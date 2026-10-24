import { describe, expect, it } from "bun:test";
import { LiveQuizRoom } from "../../workers/realtime/src/room";

async function setup(coding = true) {
  const data = new Map<string, unknown>();
  let initialized = Promise.resolve();
  const context = {
    storage: { async get(key: string) { return data.get(key); }, async put(key: string, value: unknown) { data.set(key, structuredClone(value)); }, async delete(key: string) { return data.delete(key); } },
    blockConcurrencyWhile(callback: () => Promise<void>) { initialized = callback(); return initialized; },
    getWebSockets: () => [], getTags: () => ["user:student", "role:student"], acceptWebSocket() {},
  };
  const room = new LiveQuizRoom(context as never, { LIVE_HMAC_SECRET: "secret", NEXT_APP_URL: "", LIVE_QUIZ_ROOM: {} } as never);
  await initialized;
  async function post(operation: string, body: object, secret = "secret") { return room.fetch(new Request(`https://realtime.test/room/session/${operation}`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
  await post("init", { sessionId: "session", courseId: "course", questions: [{ prompt: "Python", options: coding ? [] : ["A", "B"], correctIndex: 0, ...(coding ? { coding: { problemId: "problem", version: 1, maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300 } } : {}) }] });
  const internal = room as unknown as { roomState: { deadlineTs: number; participants: Record<string, { userId: string; name: string; score: number; connected: boolean }>; answersByQuestion: Record<number, Record<string, unknown>>; codingPending: Record<string, number> } };
  internal.roomState.participants.student = { userId: "student", name: "Student", score: 0, connected: true };
  await post("control", { action: "start" });
  return { room, post, internal, data };
}

describe("Live Quiz trusted Python grading", () => {
  it("requires service authentication and joined participant identity", async () => {
    const { post } = await setup();
    expect((await post("coding-state", { userId: "student", questionIndex: 0 }, "wrong")).status).toBe(401);
    expect((await post("coding-state", { userId: "outsider", questionIndex: 0 })).status).toBe(403);
    const state = await (await post("coding-state", { userId: "student", questionIndex: 0 })).json();
    expect(state.coding.problemId).toBe("problem");
    expect(state.deadlineMs).toBeGreaterThan(Date.now() + 250_000);
  });
  it("rejects fabricated scores and choice messages for coding questions", async () => {
    const { room, post, internal } = await setup();
    expect((await post("coding-result", { userId: "student", questionIndex: 0, requestId: "r", score: 1, ordinal: 1 })).status).toBe(409);
    await room.webSocketMessage({} as WebSocket, JSON.stringify({ type: "answer", questionIndex: 0, choice: 0 }));
    expect(internal.roomState.answersByQuestion[0]).toBeUndefined();
  });
  it("waits for grading before reveal, handles delivery replay and scores once", async () => {
    const { post, internal } = await setup();
    expect((await post("coding-reserve", { userId: "student", questionIndex: 0, requestId: "r" })).status).toBe(200);
    expect((await post("control", { action: "reveal" })).status).toBe(409);
    const result = { userId: "student", questionIndex: 0, requestId: "r", score: 0.5, ordinal: 1 };
    expect((await post("coding-result", result)).status).toBe(200);
    expect((await post("coding-result", result)).status).toBe(200);
    expect((await post("control", { action: "reveal" })).status).toBe(200);
    expect(internal.roomState.participants.student.score).toBe(500);
    expect((await post("control", { action: "reveal" })).status).toBe(400);
    expect(internal.roomState.participants.student.score).toBe(500);
  });
  it("does not accept a reservation after the server deadline", async () => {
    const { post, internal } = await setup(); internal.roomState.deadlineTs = 1;
    expect((await post("coding-reserve", { userId: "student", questionIndex: 0, requestId: "r" })).status).toBe(409);
  });
  it("keeps the legacy choice scoring path", async () => {
    const { room, post, internal } = await setup(false);
    await room.webSocketMessage({} as WebSocket, JSON.stringify({ type: "answer", questionIndex: 0, choice: 0 }));
    expect((await post("control", { action: "reveal" })).status).toBe(200);
    expect(internal.roomState.participants.student.score).toBeGreaterThanOrEqual(1000);
  });
});
