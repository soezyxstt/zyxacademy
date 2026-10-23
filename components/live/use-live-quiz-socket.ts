"use client";

import type { z } from "zod";
import type { liveCodingConfigSchema } from "@/lib/coding/live-server";
import { useCallback, useEffect, useRef, useState } from "react";

export type SessionState = "lobby" | "question" | "reveal" | "ended";
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  rank: number;
}

export interface LiveQuizState {
  connectionStatus: ConnectionStatus;
  sessionState: SessionState;
  // lobby
  participantCount: number;
  // question
  currentQuestion: { coding?: z.infer<typeof liveCodingConfigSchema>; prompt: string; options: string[]; deadline: number; total: number; questionIndex: number; origin?: "zyx_original" | "itb_example"; sourceEventName?: string | null; sourceReferenceId?: string | null } | null;
  myAnswer: number | null;
  countdown: number;
  // host-only: answer counts during question
  answerCounts: number[];
  totalAnswered: number;
  totalParticipants: number;
  // reveal
  revealCorrectIndex: number | null;
  // leaderboard (after reveal + ended)
  top10: LeaderboardEntry[];
  yourRank: number | null;
  yourScore: number;
  finalBoard: LeaderboardEntry[];
}

const INITIAL_STATE: LiveQuizState = {
  connectionStatus: "disconnected",
  sessionState: "lobby",
  participantCount: 0,
  currentQuestion: null,
  myAnswer: null,
  countdown: 0,
  answerCounts: [],
  totalAnswered: 0,
  totalParticipants: 0,
  revealCorrectIndex: null,
  top10: [],
  yourRank: null,
  yourScore: 0,
  finalBoard: [],
};

const MAX_BACKOFF_MS = 16_000;

// Optional async provider that returns a fresh signed ws URL before each
// reconnect. Returning null stops reconnection permanently (session gone).
export type RefreshConnectionUrl = () => Promise<string | null>;

export function useLiveQuizSocket(
  wsUrl: string | null,
  refreshUrl?: RefreshConnectionUrl
) {
  const [state, setState] = useState<LiveQuizState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1_000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);
  const mountedRef = useRef(true);
  // Current endpoint; refreshed via refreshUrl so expired short-lived tokens
  // (student join tokens expire after 60s) do not brick reconnection.
  const urlRef = useRef(wsUrl);
  // Kept current to avoid stale closure in ws.onclose
  const sessionStateRef = useRef<SessionState>("lobby");
  const connectRef = useRef<() => void>(() => {});

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (deadlineTs: number) => {
      clearCountdown();
      deadlineRef.current = deadlineTs;
      const tick = () => {
        if (!mountedRef.current) return;
        const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
        setState((s) => ({ ...s, countdown: remaining }));
        if (remaining <= 0) clearCountdown();
      };
      tick();
      countdownRef.current = setInterval(tick, 500);
    },
    [clearCountdown]
  );

  const handleMessage = useCallback(
    (raw: string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        case "state_sync": {
          const ss = msg.sessionState as SessionState;
          sessionStateRef.current = ss;
          setState((s) => ({
            ...s,
            sessionState: ss,
            participantCount:
              typeof msg.participantCount === "number" ? msg.participantCount : s.participantCount,
            currentQuestion:
              ss === "question" && msg.prompt
                ? {
                    prompt: msg.prompt as string,
                    options: msg.options as string[],
                    deadline: msg.deadline as number,
                    total: msg.total as number,
                    questionIndex: msg.currentQuestionIndex as number,
                    coding: msg.coding as z.infer<typeof liveCodingConfigSchema> | undefined,
                    origin: msg.origin as "zyx_original" | "itb_example" | undefined,
                    sourceEventName: typeof msg.sourceEventName === "string" ? msg.sourceEventName : null,
                    sourceReferenceId: typeof msg.sourceReferenceId === "string" ? msg.sourceReferenceId : null,
                  }
                : null,
            myAnswer: typeof msg.myAnswer === "number" ? msg.myAnswer : null,
            revealCorrectIndex:
              ss === "reveal" && typeof msg.correctIndex === "number"
                ? msg.correctIndex
                : null,
            top10: Array.isArray(msg.top10) ? (msg.top10 as LeaderboardEntry[]) : s.top10,
            yourRank: typeof msg.yourRank === "number" ? msg.yourRank : s.yourRank,
            yourScore: typeof msg.yourScore === "number" ? msg.yourScore : s.yourScore,
            finalBoard:
              ss === "ended" && Array.isArray(msg.finalBoard)
                ? (msg.finalBoard as LeaderboardEntry[])
                : s.finalBoard,
            answerCounts: Array.isArray(msg.perOptionCounts)
              ? (msg.perOptionCounts as number[])
              : s.answerCounts,
          }));
          if (ss === "question" && typeof msg.deadline === "number") {
            startCountdown(msg.deadline as number);
          } else {
            clearCountdown();
          }
          break;
        }

        case "lobby_update":
          setState((s) => ({
            ...s,
            participantCount:
              typeof msg.participantCount === "number" ? msg.participantCount : s.participantCount,
          }));
          break;

        case "question": {
          const opts = msg.options as string[];
          sessionStateRef.current = "question";
          setState((s) => ({
            ...s,
            sessionState: "question",
            currentQuestion: {
              coding: msg.coding as z.infer<typeof liveCodingConfigSchema> | undefined,
              prompt: msg.prompt as string,
              options: opts,
              deadline: msg.deadline as number,
              total: msg.total as number,
              questionIndex: msg.questionIndex as number,
              origin: msg.origin as "zyx_original" | "itb_example" | undefined,
              sourceEventName: typeof msg.sourceEventName === "string" ? msg.sourceEventName : null,
              sourceReferenceId: typeof msg.sourceReferenceId === "string" ? msg.sourceReferenceId : null,
            },
            myAnswer: null,
            revealCorrectIndex: null,
            top10: [],
            yourRank: null,
            answerCounts: new Array(opts.length).fill(0),
            totalAnswered: 0,
          }));
          startCountdown(msg.deadline as number);
          break;
        }

        case "answer_counts":
          setState((s) => ({
            ...s,
            answerCounts: Array.isArray(msg.perOptionCounts)
              ? (msg.perOptionCounts as number[])
              : s.answerCounts,
            totalAnswered:
              typeof msg.totalAnswered === "number" ? msg.totalAnswered : s.totalAnswered,
            totalParticipants:
              typeof msg.totalParticipants === "number"
                ? msg.totalParticipants
                : s.totalParticipants,
          }));
          break;

        case "reveal":
          clearCountdown();
          sessionStateRef.current = "reveal";
          setState((s) => ({
            ...s,
            sessionState: "reveal",
            revealCorrectIndex:
              typeof msg.correctIndex === "number" ? msg.correctIndex : s.revealCorrectIndex,
          }));
          break;

        case "leaderboard":
          setState((s) => ({
            ...s,
            top10: Array.isArray(msg.top10) ? (msg.top10 as LeaderboardEntry[]) : s.top10,
            yourRank: typeof msg.yourRank === "number" ? msg.yourRank : s.yourRank,
            yourScore: typeof msg.yourScore === "number" ? msg.yourScore : s.yourScore,
          }));
          break;

        case "ended":
          clearCountdown();
          sessionStateRef.current = "ended";
          setState((s) => ({
            ...s,
            sessionState: "ended",
            finalBoard: Array.isArray(msg.finalBoard)
              ? (msg.finalBoard as LeaderboardEntry[])
              : s.finalBoard,
          }));
          break;
      }
    },
    [startCountdown, clearCountdown]
  );

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl || !mountedRef.current) return;

    setState((s) => ({ ...s, connectionStatus: "connecting" }));

    const wsEndpoint = currentUrl.replace(/^https?:\/\//, (m) =>
      m.startsWith("https") ? "wss://" : "ws://"
    );

    const ws = new WebSocket(wsEndpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      backoffRef.current = 1_000;
      setState((s) => ({ ...s, connectionStatus: "connected" }));
    };

    ws.onmessage = (ev) => handleMessage(ev.data as string);

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, connectionStatus: "disconnected" }));
      if (sessionStateRef.current !== "ended") {
        reconnectTimerRef.current = setTimeout(async () => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
          try {
            if (refreshUrl) {
              const fresh = await refreshUrl();
              if (!mountedRef.current) return;
              // null means the session is definitively unavailable
              if (fresh === null) {
                sessionStateRef.current = "ended";
                return;
              }
              urlRef.current = fresh;
            }
          } catch {
            // transient refresh failure: keep retrying with the current URL
          }
          connectRef.current();
        }, backoffRef.current);
      }
    };

    ws.onerror = () => ws.close();
  }, [handleMessage, refreshUrl]);

  // Keep the ref current so the onclose closure always calls the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = wsUrl;
    if (wsUrl) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearCountdown();
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  const sendAnswer = useCallback((questionIndex: number, choice: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "answer", questionIndex, choice, clientTs: Date.now() }));
    setState((s) => ({ ...s, myAnswer: choice }));
  }, []);

  return { state, sendAnswer };
}
