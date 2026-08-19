// LiveQuizRoom Durable Object
// Uses WebSocket Hibernation API + SQLite-backed DO storage.
// All mutable state is persisted to ctx.storage on every write so the DO
// can hibernate between messages and recover after a redeploy mid-session.

import { DurableObject } from "cloudflare:workers";

interface Env {
  LIVE_QUIZ_ROOM: DurableObjectNamespace;
  LIVE_HMAC_SECRET: string;
  NEXT_APP_URL: string;
}

export interface Question {
  prompt: string;
  options: string[];
  correctIndex: number;
  origin?: "zyx_original" | "itb_example";
  sourceEventName?: string | null;
  sourceReferenceId?: string | null;
}

interface Participant {
  userId: string;
  name: string;
  score: number;
  connected: boolean;
}

type SessionState = "lobby" | "question" | "reveal" | "ended";

interface RoomState {
  sessionState: SessionState;
  currentQuestionIndex: number;
  deadlineTs: number;
  participants: Record<string, Participant>;
  // answersByQuestion[qi][userId] = { choice, receivedTs }
  answersByQuestion: Record<number, Record<string, { choice: number; receivedTs: number }>>;
}

interface TokenPayload {
  userId: string;
  name: string;
  sessionId: string;
  exp: number;
  isHost?: boolean;
}

const BASE_POINTS = 1000;
const QUESTION_WINDOW_MS = 30_000;
const MAX_PARTICIPANTS = 150;

export class LiveQuizRoom extends DurableObject<Env> {
  private questions: Question[] = [];
  private roomState: RoomState = {
    sessionState: "lobby",
    currentQuestionIndex: 0,
    deadlineTs: 0,
    participants: {},
    answersByQuestion: {},
  };
  private sessionId = "";
  private courseId = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const savedState = await this.ctx.storage.get<RoomState>("roomState");
      if (savedState) this.roomState = savedState;
      const questions = await this.ctx.storage.get<Question[]>("questions");
      if (questions) this.questions = questions;
      const sessionId = await this.ctx.storage.get<string>("sessionId");
      if (sessionId) this.sessionId = sessionId;
      const courseId = await this.ctx.storage.get<string>("courseId");
      if (courseId) this.courseId = courseId;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/init") && request.method === "POST") {
      return this.handleInit(request);
    }
    if (url.pathname.endsWith("/control") && request.method === "POST") {
      return this.handleControl(request);
    }
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      sessionId: string;
      courseId: string;
      questions: Question[];
    };

    this.questions = body.questions;
    this.sessionId = body.sessionId;
    this.courseId = body.courseId;

    await this.ctx.storage.put("questions", this.questions);
    await this.ctx.storage.put("sessionId", this.sessionId);
    await this.ctx.storage.put("courseId", this.courseId);
    await this.persistState();

    return Response.json({ ok: true });
  }

  // ── Control (host commands via Next.js API proxy) ───────────────────────────

  private async handleControl(request: Request): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${this.env.LIVE_HMAC_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as { action: string };
    switch (body.action) {
      case "start":
        return this.startSession();
      case "next":
        return this.nextQuestion();
      case "reveal":
        return this.revealQuestion();
      case "end":
        return this.endSession();
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 400 });

    const payload = await verifyHmacToken(token, this.env.LIVE_HMAC_SECRET);
    if (!payload) return new Response("Invalid or expired token", { status: 401 });

    const isHost = !!payload.isHost;

    if (!isHost) {
      const connectedNonHosts = Object.values(this.roomState.participants).filter(
        (p) => p.connected
      ).length;
      if (
        connectedNonHosts >= MAX_PARTICIPANTS &&
        !this.roomState.participants[payload.userId]
      ) {
        return new Response("Room full", { status: 429 });
      }
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const tags = isHost
      ? [`user:${payload.userId}`, "role:host"]
      : [`user:${payload.userId}`, "role:student"];
    this.ctx.acceptWebSocket(server, tags);

    if (!isHost) {
      if (!this.roomState.participants[payload.userId]) {
        this.roomState.participants[payload.userId] = {
          userId: payload.userId,
          name: payload.name,
          score: 0,
          connected: true,
        };
      } else {
        this.roomState.participants[payload.userId].connected = true;
      }
      await this.persistState();
    }

    // Send current state to the new connection
    this.sendStateSync(server, payload.userId, isHost);

    if (this.roomState.sessionState === "lobby") {
      this.broadcastLobbyUpdate();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const userId = this.getUserId(ws);
    if (!userId) return;

    let data: { type: string; questionIndex?: number; choice?: number; clientTs?: number };
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (data.type === "answer" && data.questionIndex !== undefined && data.choice !== undefined) {
      await this.handleAnswer(userId, data.questionIndex, data.choice, data.clientTs);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const userId = this.getUserId(ws);
    if (!userId) return;
    if (this.roomState.participants[userId]) {
      this.roomState.participants[userId].connected = false;
      await this.persistState();
    }
    if (this.roomState.sessionState === "lobby") {
      this.broadcastLobbyUpdate();
    }
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Handled by close event
  }

  // ── Answer handling ─────────────────────────────────────────────────────────

  private async handleAnswer(
    userId: string,
    questionIndex: number,
    choice: number,
    _clientTs?: number
  ): Promise<void> {
    if (this.roomState.sessionState !== "question") return;
    if (questionIndex !== this.roomState.currentQuestionIndex) return;

    if (!this.roomState.answersByQuestion[questionIndex]) {
      this.roomState.answersByQuestion[questionIndex] = {};
    }
    // Rate limit: 1 answer per question per user
    if (this.roomState.answersByQuestion[questionIndex][userId]) return;

    this.roomState.answersByQuestion[questionIndex][userId] = {
      choice,
      receivedTs: Date.now(),
    };
    await this.persistState();

    // Push live counts to host connections
    this.sendAnswerCountsToHosts(questionIndex);
  }

  // ── State machine ───────────────────────────────────────────────────────────

  private async startSession(): Promise<Response> {
    if (this.roomState.sessionState !== "lobby") {
      return Response.json({ error: "Not in lobby" }, { status: 400 });
    }
    if (this.questions.length === 0) {
      return Response.json({ error: "No questions" }, { status: 400 });
    }

    this.roomState.sessionState = "question";
    this.roomState.currentQuestionIndex = 0;
    this.roomState.deadlineTs = Date.now() + QUESTION_WINDOW_MS;
    await this.persistState();

    const q = this.questions[0];
    this.broadcast({
      type: "question",
      questionIndex: 0,
      prompt: q.prompt,
      options: q.options,
      origin: q.origin,
      sourceEventName: q.sourceEventName,
      sourceReferenceId: q.sourceReferenceId,
      deadline: this.roomState.deadlineTs,
      total: this.questions.length,
    });

    return Response.json({ ok: true });
  }

  private async nextQuestion(): Promise<Response> {
    if (this.roomState.sessionState !== "reveal") {
      return Response.json({ error: "Must reveal before advancing" }, { status: 400 });
    }

    const nextIndex = this.roomState.currentQuestionIndex + 1;
    if (nextIndex >= this.questions.length) {
      return Response.json({ error: "No more questions" }, { status: 400 });
    }

    this.roomState.sessionState = "question";
    this.roomState.currentQuestionIndex = nextIndex;
    this.roomState.deadlineTs = Date.now() + QUESTION_WINDOW_MS;
    await this.persistState();

    const q = this.questions[nextIndex];
    this.broadcast({
      type: "question",
      questionIndex: nextIndex,
      prompt: q.prompt,
      options: q.options,
      origin: q.origin,
      sourceEventName: q.sourceEventName,
      sourceReferenceId: q.sourceReferenceId,
      deadline: this.roomState.deadlineTs,
      total: this.questions.length,
    });

    return Response.json({ ok: true });
  }

  private async revealQuestion(): Promise<Response> {
    if (this.roomState.sessionState !== "question") {
      return Response.json({ error: "Not in question state" }, { status: 400 });
    }

    const qi = this.roomState.currentQuestionIndex;
    const q = this.questions[qi];
    if (!q) return Response.json({ error: "No question" }, { status: 400 });

    const answersForQ = this.roomState.answersByQuestion[qi] ?? {};
    const correctIndex = q.correctIndex;
    const questionDeadline = this.roomState.deadlineTs;

    const perOptionCounts = q.options.map(
      (_, i) => Object.values(answersForQ).filter((a) => a.choice === i).length
    );

    // Score: base + linear time bonus from server receive time
    for (const [userId, answer] of Object.entries(answersForQ)) {
      if (answer.choice === correctIndex) {
        const elapsed = answer.receivedTs - (questionDeadline - QUESTION_WINDOW_MS);
        const timeBonus = Math.max(0, Math.round(BASE_POINTS * (1 - elapsed / QUESTION_WINDOW_MS)));
        const points = BASE_POINTS + timeBonus;
        if (this.roomState.participants[userId]) {
          this.roomState.participants[userId].score += points;
        }
      }
    }

    this.roomState.sessionState = "reveal";
    await this.persistState();

    const leaderboard = this.buildLeaderboard();

    // Broadcast reveal (correctIndex included only in reveal frame)
    this.broadcast({
      type: "reveal",
      questionIndex: qi,
      correctIndex,
      perOptionCounts,
    });

    // Personalized leaderboard to every connected socket
    for (const ws of this.ctx.getWebSockets()) {
      const wsUserId = this.getUserId(ws);
      if (!wsUserId) continue;
      const myEntry = leaderboard.find((e) => e.userId === wsUserId);
      try {
        ws.send(
          JSON.stringify({
            type: "leaderboard",
            top10: leaderboard.slice(0, 10),
            yourRank: myEntry?.rank ?? null,
            yourScore: myEntry?.score ?? 0,
          })
        );
      } catch {
        // socket gone
      }
    }

    return Response.json({ ok: true });
  }

  private async endSession(): Promise<Response> {
    this.roomState.sessionState = "ended";
    await this.persistState();

    const finalBoard = this.buildLeaderboard();
    this.broadcast({ type: "ended", finalBoard });

    // POST results to callback
    await this.sendCallback(finalBoard);

    return Response.json({ ok: true });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buildLeaderboard(): Array<{
    userId: string;
    name: string;
    score: number;
    rank: number;
  }> {
    return Object.values(this.roomState.participants)
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ userId: p.userId, name: p.name, score: p.score, rank: i + 1 }));
  }

  private broadcast(message: unknown): void {
    const str = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(str);
      } catch {
        // skip closed
      }
    }
  }

  private broadcastLobbyUpdate(): void {
    const participantCount = Object.keys(this.roomState.participants).length;
    this.broadcast({ type: "lobby_update", participantCount });
  }

  private sendAnswerCountsToHosts(questionIndex: number): void {
    const q = this.questions[questionIndex];
    if (!q) return;
    const answersForQ = this.roomState.answersByQuestion[questionIndex] ?? {};
    const perOptionCounts = q.options.map(
      (_, i) => Object.values(answersForQ).filter((a) => a.choice === i).length
    );
    const totalAnswered = Object.keys(answersForQ).length;
    const totalParticipants = Object.keys(this.roomState.participants).length;
    const msg = JSON.stringify({
      type: "answer_counts",
      questionIndex,
      perOptionCounts,
      totalAnswered,
      totalParticipants,
    });
    for (const ws of this.ctx.getWebSockets("role:host")) {
      try {
        ws.send(msg);
      } catch {
        // skip
      }
    }
  }

  private sendStateSync(ws: WebSocket, userId: string, isHost: boolean): void {
    const { sessionState, currentQuestionIndex, deadlineTs } = this.roomState;
    const base = { type: "state_sync", sessionState, currentQuestionIndex };

    if (sessionState === "lobby") {
      ws.send(
        JSON.stringify({
          ...base,
          participantCount: Object.keys(this.roomState.participants).length,
        })
      );
      return;
    }

    const q = this.questions[currentQuestionIndex];
    if (!q) return;

    if (sessionState === "question") {
      const answersForQ = this.roomState.answersByQuestion[currentQuestionIndex] ?? {};
      const myAnswer = answersForQ[userId]?.choice ?? null;
      ws.send(
        JSON.stringify({
          ...base,
          prompt: q.prompt,
          options: q.options,
          origin: q.origin,
          sourceEventName: q.sourceEventName,
          sourceReferenceId: q.sourceReferenceId,
          deadline: deadlineTs,
          myAnswer,
          total: this.questions.length,
          ...(isHost && {
            perOptionCounts: q.options.map(
              (_, i) => Object.values(answersForQ).filter((a) => a.choice === i).length
            ),
          }),
        })
      );
      return;
    }

    if (sessionState === "reveal") {
      const leaderboard = this.buildLeaderboard();
      const myEntry = leaderboard.find((e) => e.userId === userId);
      ws.send(
        JSON.stringify({
          ...base,
          prompt: q.prompt,
          options: q.options,
          origin: q.origin,
          sourceEventName: q.sourceEventName,
          sourceReferenceId: q.sourceReferenceId,
          correctIndex: q.correctIndex,
          top10: leaderboard.slice(0, 10),
          yourRank: myEntry?.rank ?? null,
          yourScore: myEntry?.score ?? 0,
        })
      );
      return;
    }

    if (sessionState === "ended") {
      ws.send(JSON.stringify({ ...base, finalBoard: this.buildLeaderboard() }));
    }
  }

  private getUserId(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws);
    const tag = tags.find((t) => t.startsWith("user:"));
    return tag ? tag.slice(5) : null;
  }

  private async persistState(): Promise<void> {
    await this.ctx.storage.put("roomState", this.roomState);
  }

  private async sendCallback(
    leaderboard: Array<{ userId: string; name: string; score: number; rank: number }>
  ): Promise<void> {
    if (!this.env.NEXT_APP_URL || !this.sessionId) return;
    try {
      await fetch(`${this.env.NEXT_APP_URL}/api/live/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.LIVE_HMAC_SECRET}`,
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          courseId: this.courseId,
          leaderboard,
          answersByQuestion: this.roomState.answersByQuestion,
          questions: this.questions,
        }),
      });
    } catch (err) {
      console.error("Callback failed:", err);
    }
  }
}

// ── HMAC token verification (Web Crypto) ──────────────────────────────────────

async function verifyHmacToken(
  token: string,
  secret: string
): Promise<TokenPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payloadB64 = token.slice(0, dotIdx);
    const sigHex = token.slice(dotIdx + 1);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = hexToBytes(sigHex);
    const valid = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(payloadB64));
    if (!valid) return null;

    const payload: TokenPayload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
