import { applyLiveStateSync, liveOptionDistribution, type LiveQuizState } from "../../packages/native-parity/student/learning/live-socket";
import { formatQuestionSourceCitation } from "../../lib/asesmen/question-provenance";
import { expect, test } from "bun:test";
import { createTutorLiveHost, tutorLiveSocketUrl } from "../../apps/mobile-native/features/academic/tutor/live-client";
import type { AcademicCommand } from "../../apps/mobile-native/features/academic/client";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import { handleTutorLive, type TutorLiveServices } from "../../lib/native/academic/handle-tutor-live";
import { makeHostToken } from "../../lib/live-host-token";
import { TutorDataError } from "../../packages/native-parity/academic/tutor/model";

const origin = "https://academy.example.test";
const path = "/api/native/academic/tutor-support/courses/course-id/live/host";
const room = {
  id: "room-id", code: "ABC234", questionCount: 2, wsUrl: "https://realtime.example.test/room/room-id/websocket",
  hostToken: makeHostToken("tutor", "Tutor Preview", "room-id", "fixture-only-signature"),
};
const response = (data: unknown, status = 200) => Response.json(data, { status });

function services(overrides: Partial<TutorLiveServices> = {}): TutorLiveServices {
  return {
    async session() { return { user: { id: "tutor" } }; },
    async hasTutor() { return true; },
    async authorizeCourse() {},
    async resume() { return room; },
    async ownsRoom() { return true; },
    async create() { return response({ ...room, sessionId: room.id, internal: "not part of the native contract" }); },
    async control() { return response({ ok: true }); },
    ...overrides,
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method: "POST", body: JSON.stringify(body), headers: { Origin: origin, "Content-Type": "application/json", ...headers },
  });
}

test("Live host API requires a Tutor session and assignment before opening, reading or controlling rooms", async () => {
  const denied: Partial<TutorLiveServices>[] = [
    { async session() { return null; } },
    { async hasTutor() { return false; } },
    { async authorizeCourse() { throw new Error("TUTOR_ACCESS_DENIED: NO_COURSE_ACCESS"); } },
  ];
  let called = 0;
  for (const [index, overrides] of denied.entries()) {
    const target = services({
      async create() { called++; return response({}); },
      async resume() { called++; return null; },
      async control() { called++; return response({}); },
      ...overrides,
    });
    for (const input of [new Request(origin + path), request({ templateId: "template" }), request({ sessionId: room.id, action: "end" })]) {
      const result = await handleTutorLive(input, "course-id", origin, target);
      expect(result.status).toBe(index === 0 ? 401 : 403);
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    }
  }
  expect(called).toBe(0);
});

test("the configured route forwards one course-bound identity and can resume the exact session", async () => {
  const seen: unknown[][] = [];
  const target = services({
    async resume(...input) { seen.push(input); return room; },
    async ownsRoom(...input) { seen.push(input); return true; },
    async control(...input) { seen.push(input); return response({ ok: true, internal: true }); },
  });
  const resume = await handleTutorLive(new Request(origin + path + "?sessionId=room-id"), "course-id", origin, target);
  expect(await resume.json()).toEqual(room);
  const start = await handleTutorLive(request({ templateId: "template-id" }), "course-id", origin, target);
  expect(await start.json()).toEqual(room);
  const reveal = await handleTutorLive(request({ sessionId: room.id, action: "reveal" }), "course-id", origin, target);
  expect(await reveal.json()).toEqual({ ok: true });
  expect(seen).toEqual([["tutor", "course-id", room.id], ["tutor", "course-id", room.id], [room.id, "reveal"]]);
});

test("cross-site, unexpected controls and foreign rooms cannot dispatch writes", async () => {
  let calls = 0;
  const target = services({ async ownsRoom() { return false; }, async control() { calls++; return response({}); } });
  const input = { sessionId: room.id, action: "start" };
  expect((await handleTutorLive(request(input, { Origin: "https://other.example.test" }), "course-id", origin, target)).status).toBe(403);
  expect((await handleTutorLive(request(input, { "Sec-Fetch-Site": "cross-site" }), "course-id", origin, target)).status).toBe(403);
  expect((await handleTutorLive(request({ ...input, action: "reset" }), "course-id", origin, target)).status).toBe(400);
  expect((await handleTutorLive(request({ ...input, courseId: "other-course" }), "course-id", origin, target)).status).toBe(400);
  expect((await handleTutorLive(request(input), "course-id", origin, target)).status).toBe(403);
  expect((await handleTutorLive(new Request(origin + path + "?sessionId=room-id&sessionId=other"), "course-id", origin, target)).status).toBe(400);
  expect(calls).toBe(0);
});

test("native requests are confined to the bound Tutor transport and control failures are not replayed", async () => {
  const calls: unknown[] = [];
  const host = createTutorLiveHost({
    accountId: "tutor", origin, locale: "id",
    async get(path) { calls.push(path); return response(room); },
    async command(path, command: AcademicCommand) {
      calls.push([path, command]);
      return command.requestId === "open-id" ? response(room) : response({ error: "ambiguous" }, 502);
    },
  })!;
  const signal = new AbortController().signal;
  expect(await host.resume("course-id", room.id, signal)).toEqual(room);
  expect(await host.create("course-id", "template-id", "open-id", signal)).toEqual(room);
  await expect(host.control("course-id", room.id, "next", "next-id", signal)).rejects.toBeInstanceOf(TutorDataError);
  expect(calls).toEqual([path + "?sessionId=room-id",
    [path, { method: "POST", body: { templateId: "template-id" }, requestId: "open-id" }],
    [path, { method: "POST", body: { sessionId: "room-id", action: "next" }, requestId: "next-id" }],
  ]);
});

test("socket credentials are accepted only for a clean secure WebSocket URL for the returned room", async () => {
  expect(tutorLiveSocketUrl(room)).toBe(room.wsUrl + "?token=" + room.hostToken);
  for (const wsUrl of [
    room.wsUrl.replace("https:", "http:"), room.wsUrl.replace("room-id", "another-room"),
    room.wsUrl + "?token=attacker", room.wsUrl + "#fragment", "https://secret@realtime.example.test/room/room-id/websocket",
  ]) expect(tutorLiveSocketUrl({ ...room, wsUrl })).toBeNull();
  expect(tutorLiveSocketUrl({ ...room, hostToken: "invalid" })).toBeNull();
  const host = createTutorLiveHost({
    accountId: "tutor", origin, locale: "id",
    async get() { return response(room); },
    async command() { return response({}); },
  })!;
  await expect(host.resume("course-id", "another-room", new AbortController().signal)).rejects.toMatchObject({ status: 502 });
});

test("Live hosting is scoped to the native Tutor session in the MCP operations catalog", () => {
  expect(operationsCatalog.find(row => row.source.endsWith("/[courseId]/live/host/route.ts")))
    .toMatchObject({ actions: ["GET", "POST"], tools: [], status: "excluded" });
});

test("the native host opens only one exact published coding locator in the assigned course", async () => {
  const selections: unknown[] = [];
  const target = services({ async create(courseId, selection) {
    selections.push([courseId, selection]);
    return response({ ...room, sessionId: room.id, questionCount: 1 });
  } });
  const codingProblem = { problemId: "py-loop", version: 2 };
  const accepted = await handleTutorLive(request({ codingProblem }), "course-id", origin, target);
  expect(await accepted.json()).toEqual({ ...room, questionCount: 1, kind: "coding" });
  for (const body of [
    { codingProblem: { ...codingProblem, version: "2" } },
    { codingProblem: { ...codingProblem, version: 0 } },
    { codingProblem: { ...codingProblem, assistance: "full" } },
    { codingProblem, courseId: "elsewhere" },
    { codingProblem, templateId: "also-template" },
    { codingQuestions: [codingProblem] },
  ]) expect((await handleTutorLive(request(body), "course-id", origin, target)).status).toBe(400);
  expect((await handleTutorLive(request({ codingProblem }), "other-course", origin, services({
    ...target,
    async authorizeCourse() { throw new Error("TUTOR_ACCESS_DENIED"); },
  }))).status).toBe(403);
  expect(selections).toEqual([["course-id", { codingProblem }]]);
});

test("the mobile coding command sends no untrusted policy and retains the web ad hoc defaults", async () => {
  const { adHocLiveCodingQuestion, liveCodingConfigSchema } = await import("../../lib/coding/live-config");
  const codingProblem = { problemId: "loops", version: 4 };
  expect(liveCodingConfigSchema.parse(adHocLiveCodingQuestion(codingProblem))).toEqual({
    ...codingProblem, maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300,
  });
  const codingRoom = { ...room, questionCount: 1, kind: "coding" };
  const seen: Array<[string, AcademicCommand]> = [];
  const host = createTutorLiveHost({
    accountId: "tutor", origin, locale: "id",
    async get() { return response(codingRoom); },
    async command(path, command) { seen.push([path, command]); return response(codingRoom); },
  })!;
  const signal = new AbortController().signal;
  expect(await host.create("course-id", { codingProblem }, "open-python", signal)).toEqual(codingRoom);
  expect(await host.resume("course-id", room.id, signal)).toEqual(codingRoom);
  expect(seen).toEqual([[path, { method: "POST", body: { codingProblem }, requestId: "open-python" }]]);
});

test("standard Tutor live reconnect restores exact totals and published source provenance", () => {
  const previous: LiveQuizState = {
    connectionStatus: "connected", sessionState: "lobby", participantCount: 7, currentQuestion: null, myAnswer: null,
    countdown: 0, answerCounts: [], totalAnswered: 0, totalParticipants: 0, revealCorrectIndex: null,
    top10: [], yourRank: null, yourScore: 0, finalBoard: [],
  };
  const question = { sessionState: "question", currentQuestionIndex: 1, prompt: "Compute $x^2$", options: ["$1$", "$2$"],
    origin: "historical_reference", sourceEventName: "  ITB archival example  ", sourceReferenceId: "reference", total: 3 };
  const synced = applyLiveStateSync(previous, { ...question, perOptionCounts: [2, 1], totalAnswered: 3, totalParticipants: 4 });
  expect(synced).toMatchObject({ totalAnswered: 3, totalParticipants: 4,
    currentQuestion: { prompt: question.prompt, options: question.options, origin: "historical_reference", total: 3 } });
  expect(liveOptionDistribution(synced.answerCounts, synced.totalAnswered, 3)).toEqual([
    { count: 2, percent: 67 }, { count: 1, percent: 33 }, { count: 0, percent: 0 },
  ]);
  expect(formatQuestionSourceCitation(synced.currentQuestion?.origin, synced.currentQuestion?.sourceEventName, "en"))
    .toBe("Reference: ITB archival example");
  expect(formatQuestionSourceCitation("zyx_original", "Private note")).toBeNull();
  expect(applyLiveStateSync(previous, { ...question, perOptionCounts: [0, 3] })).toMatchObject({
    totalAnswered: 3, totalParticipants: 7,
  });
  expect(applyLiveStateSync(synced, { ...question, currentQuestionIndex: 2, totalParticipants: 0 }))
    .toMatchObject({ totalAnswered: 0, totalParticipants: 0, answerCounts: [] });
});
