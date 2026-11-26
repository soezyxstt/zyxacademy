
export type SessionState = "lobby" | "question" | "reveal" | "ended";
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  rank: number;
}

export interface LiveQuizState<Coding = unknown> {
  connectionStatus: ConnectionStatus;
  sessionState: SessionState;
  // lobby
  participantCount: number;
  // question
  currentQuestion: { coding?: Coding; prompt: string; options: string[]; deadline: number; total: number; questionIndex: number; origin?: "zyx_original" | "itb_example"; sourceEventName?: string | null; sourceReferenceId?: string | null } | null;
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

/** The worker can sync a reveal without a timer or total, for example on a reconnect. */
export function applyLiveStateSync<Coding>(previous: LiveQuizState<Coding>, message: Record<string, unknown>): LiveQuizState<Coding> {
  const phase = message.sessionState;
  if (phase !== "lobby" && phase !== "question" && phase !== "reveal" && phase !== "ended") return previous;
  const index = typeof message.currentQuestionIndex === "number" ? message.currentQuestionIndex : -1;
  const sameQuestion = previous.currentQuestion?.questionIndex === index ? previous.currentQuestion : null;
  const isRound = phase === "question" || phase === "reveal";
  const question = isRound && index >= 0 && typeof message.prompt === "string" && Array.isArray(message.options)
    && message.options.every((option) => typeof option === "string") ? {
      prompt: message.prompt,
      options: message.options as string[],
      deadline: typeof message.deadline === "number" ? message.deadline : sameQuestion?.deadline ?? 0,
      total: typeof message.total === "number" ? message.total : sameQuestion?.total ?? 0,
      questionIndex: index,
      coding: message.coding as Coding | undefined,
      origin: message.origin === "zyx_original" || message.origin === "itb_example" ? message.origin : undefined,
      sourceEventName: typeof message.sourceEventName === "string" ? message.sourceEventName : null,
      sourceReferenceId: typeof message.sourceReferenceId === "string" ? message.sourceReferenceId : null,
    } satisfies LiveQuizState<Coding>["currentQuestion"] : null;
  return {
    ...previous,
    sessionState: phase,
    participantCount: typeof message.participantCount === "number" ? message.participantCount : previous.participantCount,
    currentQuestion: question,
    myAnswer: typeof message.myAnswer === "number" ? message.myAnswer : phase === "reveal" && sameQuestion ? previous.myAnswer : null,
    revealCorrectIndex: phase === "reveal" && typeof message.correctIndex === "number" ? message.correctIndex : null,
    top10: Array.isArray(message.top10) ? message.top10 as LeaderboardEntry[] : previous.top10,
    yourRank: typeof message.yourRank === "number" ? message.yourRank : previous.yourRank,
    yourScore: typeof message.yourScore === "number" ? message.yourScore : previous.yourScore,
    finalBoard: phase === "ended" && Array.isArray(message.finalBoard) ? message.finalBoard as LeaderboardEntry[] : previous.finalBoard,
    answerCounts: Array.isArray(message.perOptionCounts) ? message.perOptionCounts as number[] : previous.answerCounts,
  };
}

const MAX_BACKOFF_MS = 16_000;

// Optional async provider that returns a fresh signed ws URL before each
// reconnect. Returning null stops reconnection permanently (session gone).
export type RefreshConnectionUrl = () => Promise<string | null>;

type Hooks = {
  useCallback<T extends (...input: never[]) => unknown>(callback: T, dependencies: readonly unknown[]): T;
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
  useState<T>(initial: T | (() => T)): [T, (update: T | ((previous: T) => T)) => void];
};

/** Use each renderer's React instance, including Metro in the isolated Expo app. */
export function createLiveQuizSocketHook({ useCallback, useEffect, useRef, useState }: Hooks) {
  return function useLiveQuizSocket<Coding = unknown>(
    wsUrl: string | null,
    refreshUrl?: RefreshConnectionUrl,
    allowExistingUrlOnRefreshFailure = true,
  ) {
    const [state, setState] = useState<LiveQuizState<Coding>>(() => ({ ...INITIAL_STATE, currentQuestion: null }));
    const [synchronized, setSynchronized] = useState(false);
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
            if (ss !== "lobby" && ss !== "question" && ss !== "reveal" && ss !== "ended") break;
            sessionStateRef.current = ss;
            setState((state) => applyLiveStateSync(state, msg));
            setSynchronized(true);
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
                coding: msg.coding as Coding | undefined,
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
      setSynchronized(false);

      const wsEndpoint = currentUrl.replace(/^https?:\/\//, (m) =>
        m.startsWith("https") ? "wss://" : "ws://"
      );

      const ws = new WebSocket(wsEndpoint);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current || wsRef.current !== ws) {
          ws.close();
          return;
        }
        backoffRef.current = 1_000;
        setState((s) => ({ ...s, connectionStatus: "connected" }));
      };

      ws.onmessage = (ev) => {
        if (mountedRef.current && wsRef.current === ws) handleMessage(ev.data as string);
      };

      ws.onclose = () => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        setSynchronized(false);
        setState((s) => ({ ...s, connectionStatus: "disconnected" }));
        if (sessionStateRef.current !== "ended") {
          const retry = async () => {
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
            try {
              if (refreshUrl) {
                const fresh = await refreshUrl();
                if (!mountedRef.current || wsRef.current !== ws) return;
                // null means the session is definitively unavailable
                if (fresh === null) {
                  sessionStateRef.current = "ended";
                  return;
                }
                urlRef.current = fresh;
              }
            } catch {
              if (!allowExistingUrlOnRefreshFailure) {
                if (mountedRef.current && wsRef.current === ws) reconnectTimerRef.current = setTimeout(retry, backoffRef.current);
                return;
              }
            }
            if (wsRef.current === ws) connectRef.current();
          };
          reconnectTimerRef.current = setTimeout(retry, backoffRef.current);
        }
      };

      ws.onerror = () => ws.close();
    }, [allowExistingUrlOnRefreshFailure, handleMessage, refreshUrl]);

    // Keep the ref current so the onclose closure always calls the latest version
    useEffect(() => {
      connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
      mountedRef.current = true;
      urlRef.current = wsUrl;
      setSynchronized(false);
      if (wsUrl) connectRef.current();
      return () => {
        mountedRef.current = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        clearCountdown();
        const socket = wsRef.current;
        wsRef.current = null;
        socket?.close();
      };
      // The connection is reset only when the room endpoint changes.
    }, [wsUrl, clearCountdown]);

    const sendAnswer = useCallback((questionIndex: number, choice: number) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "answer", questionIndex, choice, clientTs: Date.now() }));
      setState((s) => ({ ...s, myAnswer: choice }));
    }, []);

    return { state, sendAnswer, synchronized };
  }
}
