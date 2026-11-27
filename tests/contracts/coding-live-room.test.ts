import { describe, expect, it, test } from "bun:test";
import { LiveQuizRoom } from "../../workers/realtime/src/room";

async function setup(coding = true) {
  const data = new Map<string, unknown>();
  const messages: Array<{ type: string; totalAnswered?: number; perOptionCounts?: number[] }> = [];
  let beforePut: (() => Promise<void>) | undefined;
  let initialized = Promise.resolve();
  const host = { send: (value: string) => messages.push(JSON.parse(value)) };
  const context = {
    storage: {
      async get(key: string) { return data.get(key); },
      async put(key: string, value: unknown) { await beforePut?.(); data.set(key, structuredClone(value)); },
      async delete(key: string) { return data.delete(key); },
    },
    blockConcurrencyWhile(callback: () => Promise<void>) { initialized = callback(); return initialized; },
    getWebSockets: () => [host], getTags: () => ["user:student", "role:student"], acceptWebSocket() {},
  };
  async function restoreRoom() {
    const room = new LiveQuizRoom(context as never, { LIVE_HMAC_SECRET: "secret", NEXT_APP_URL: "", LIVE_QUIZ_ROOM: {} } as never);
    await initialized;
    return room;
  }
  let room = await restoreRoom();
  async function post(operation: string, body: object, secret = "secret") { return room.fetch(new Request(`https://realtime.test/room/session/${operation}`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })); }
  await post("init", { sessionId: "session", courseId: "course", questions: [{ prompt: "Python", options: coding ? [] : ["A", "B"], correctIndex: 0, ...(coding ? { coding: { problemId: "problem", version: 1, maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300 } } : {}) }] });
  const internal = room as unknown as { roomState: { deadlineTs: number; participants: Record<string, { userId: string; name: string; score: number; connected: boolean }>; answersByQuestion: Record<number, Record<string, unknown>>; codingPending: Record<string, number> } };
  internal.roomState.participants.student = { userId: "student", name: "Student", score: 0, connected: true };
  await post("control", { action: "start" });
  return {
    room, post, internal, data, messages,
    async restart() { room = await restoreRoom(); return room; },
    onPut(hook?: () => Promise<void>) { beforePut = hook; },
  };
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

function sendChoice(room: LiveQuizRoom, choice: number) {
  return room.webSocketMessage({} as WebSocket, JSON.stringify({ type: "answer", questionIndex: 0, choice }));
}

test("live choice counts follow durable writes and the first answer survives restart", async () => {
  const fixture = await setup(false);
  const pending = Promise.withResolvers<void>();
  fixture.onPut(() => pending.promise);
  const accepted = sendChoice(fixture.room, 0);
  expect(fixture.messages.filter((message) => message.type === "answer_counts")).toEqual([]);
  pending.resolve();
  await accepted;
  expect(fixture.messages.at(-1)).toMatchObject({ type: "answer_counts", totalAnswered: 1, perOptionCounts: [1, 0] });

  const restored = await fixture.restart();
  const count = fixture.messages.length;
  await sendChoice(restored, 1);
  expect(fixture.messages).toHaveLength(count);
  expect((await fixture.post("control", { action: "reveal" })).status).toBe(200);
  expect(fixture.messages.find((message) => message.type === "reveal")).toMatchObject({ perOptionCounts: [1, 0] });
  const saved = fixture.data.get("roomState") as typeof fixture.internal.roomState;
  expect(saved.answersByQuestion[0].student).toMatchObject({ choice: 0 });
  expect(saved.participants.student.score).toBeGreaterThanOrEqual(1000);
  expect((await fixture.post("control", { action: "reveal" })).status).toBe(400);
  expect((fixture.data.get("roomState") as typeof saved).participants.student.score).toBe(saved.participants.student.score);
});

test("failed live choice persistence leaves the count and first-answer slot open", async () => {
  const fixture = await setup(false);
  fixture.onPut(async () => { throw new Error("Storage unavailable"); });
  await expect(sendChoice(fixture.room, 0)).rejects.toThrow("Storage unavailable");
  expect(fixture.messages.filter((message) => message.type === "answer_counts")).toEqual([]);
  expect(fixture.internal.roomState.answersByQuestion[0]).toBeUndefined();
  fixture.onPut();
  await sendChoice(fixture.room, 1);
  expect(fixture.messages.at(-1)).toMatchObject({ type: "answer_counts", totalAnswered: 1, perOptionCounts: [0, 1] });
});

test("a reconnected Tutor receives live answer totals while a learner receives neither totals nor the answer key", async () => {
  const fixture = await setup(false);
  await sendChoice(fixture.room, 1);
  const room = await fixture.restart() as unknown as {
    sendStateSync(socket: { send(value: string): void }, id: string, host: boolean): void;
  };
  const frame = (id: string, host: boolean) => {
    let message: Record<string, unknown> = {};
    room.sendStateSync({ send(value) { message = JSON.parse(value); } }, id, host);
    return message;
  };
  expect(frame("tutor", true)).toMatchObject({ type: "state_sync", sessionState: "question",
    totalAnswered: 1, totalParticipants: 1, perOptionCounts: [0, 1] });
  const learner = frame("student", false);
  expect(learner).toMatchObject({ type: "state_sync", sessionState: "question", myAnswer: 1 });
  for (const field of ["totalAnswered", "totalParticipants", "perOptionCounts", "correctIndex"]) {
    expect(learner).not.toHaveProperty(field);
  }
});
