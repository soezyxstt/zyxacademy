import { expect, test } from "bun:test";
import {
  canStartLiveCoding, liveCodingHelp, liveCodingKey, LiveCodingError, loadLiveProblem, loadLiveCodingHistory,
  persistLiveEditor, restoreLiveEditor, signedLiveEndpoint, submitLiveCoding, type LiveCodingScope, type LiveEditor,
} from "@/apps/mobile-native/features/student/learning/live-coding-contract";
import type { StudentRequest } from "@/apps/mobile-native/features/student/contracts";
import { readCodingSurface } from "@/lib/coding/http-contracts";

const scope: LiveCodingScope = { courseId: "legacy-course", roomId: "room-123", index: 2,
  config: { problemId: "problem", version: 1, assistance: "hints", maxAttempts: 3, durationSeconds: 60, scoring: "best" } };
const problem = { problemId: "problem", version: 1, courseId: "course", language: "python" as const,
  title: "Add two values", prompt: "Read two integers", learningObjectives: ["Read data"], starterCode: "",
  publicTests: [{ id: "example", stdin: "1\n2\n", expectedStdout: "3\n" }], limits: { timeoutMs: 5000, maxOutputChars: 1000 } };
const policy = { surfaceId: "live:room-123:2", deadlineMs: 20_000, assistance: "hints" as const, maxAttempts: 3 };
const editor: LiveEditor = { code: "print(sum(int(input()) for _ in range(2)))", stdin: "1\n2\n" };
const controller = new AbortController();
const surface = { kind: "live_quiz", sessionId: scope.roomId, questionIndex: 2 };

function transport(fixture: unknown, status = 200) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const request: StudentRequest = async (path, init) => {
    calls.push({ path, init });
    const response = Response.json(fixture, { status });
    return { ok: response.ok, status, headers: response.headers, json: () => response.json(),
      text: () => response.text(), arrayBuffer: () => response.arrayBuffer() };
  };
  return { calls, request };
}

test("reconnection only accepts the same room, and coding opens after the current participant state is synchronized", () => {
  const endpoint = { sessionId: "room-123", token: "signed", wsUrl: "wss://live.example/room/room-123/websocket" };
  expect(signedLiveEndpoint(endpoint, "room-123")).toBe("wss://live.example/room/room-123/websocket?token=signed");
  expect(signedLiveEndpoint(endpoint, "other-room")).toBeNull();
  expect(signedLiveEndpoint({ ...endpoint, wsUrl: "wss://live.example/room/other-room/websocket" })).toBeNull();
  const active = { synchronized: true, connected: true, phase: "question", deadline: 10, now: 9 };
  expect(canStartLiveCoding(active)).toBe(true);
  for (const patch of [{ synchronized: false }, { connected: false }, { phase: "reveal" }, { now: 10 }, { deadline: NaN }]) {
    expect(canStartLiveCoding({ ...active, ...patch })).toBe(false);
  }
});

test("problem queries carry the live surface, and private or stale responses fail closed", async () => {
  const fetched = transport({ problem, policy });
  const loaded = await loadLiveProblem(fetched.request, scope, controller.signal);
  expect(loaded.problem).toEqual(problem);
  const url = new URL(fetched.calls[0].path, "https://app.example");
  expect(url.pathname).toBe("/api/coding/problems/problem");
  expect(readCodingSurface(url.searchParams.get("surface"))).toEqual(surface);
  expect(() => readCodingSurface("bad JSON")).toThrow("CODING_INVALID_SURFACE");
  const privateSnapshot = transport({ problem: { ...problem, privateTests: ["secret"] }, policy });
  await expect(loadLiveProblem(privateSnapshot.request, scope, controller.signal)).rejects.toThrow();
  const wrongRoom = transport({ problem, policy: { ...policy, surfaceId: "live:other:2" } });
  await expect(loadLiveProblem(wrongRoom.request, scope, controller.signal)).rejects.toThrow("scope mismatch");
  const denied = transport({ code: "CODING_FORBIDDEN" }, 403);
  await expect(loadLiveProblem(denied.request, scope, controller.signal)).rejects.toBeInstanceOf(LiveCodingError);
});

test("only explicit exercise help uses the strictest hint policy and the immutable round destination", () => {
  const hint = liveCodingHelp(scope, { ...policy, assistance: "full" }, editor);
  expect(hint).toMatchObject({ kind: "exercise", intent: "hint", surface, problem: { problemId: "problem", version: 1 } });
  expect(liveCodingHelp(scope, { ...policy, assistance: "disabled" }, editor)).toBeNull();
  expect(liveCodingHelp({ ...scope, config: { ...scope.config, assistance: "disabled" } }, policy, editor)).toBeNull();
  expect(liveCodingHelp({ ...scope, config: { ...scope.config, assistance: "full" } },
    { ...policy, assistance: "full" }, editor)?.intent).toBe("review");
});

test("the frozen command survives a closed screen and a stale editor cannot replace it", async () => {
  const rows = new Map<string, string>();
  const drafts = {
    async get(key: string) { return rows.get(key) ?? null; },
    async set(key: string, raw: string) { rows.set(key, raw); },
    async remove(key: string) { rows.delete(key); },
    async update(key: string, change: (raw: string | null) => string | null) {
      const raw = change(rows.get(key) ?? null);
      if (raw !== null) rows.set(key, raw);
    },
  };
  const pending = { ...editor, pending: { ...editor, requestId: "first-attempt", problem: { problemId: "problem", version: 1 } } };
  expect((await persistLiveEditor(drafts, scope, editor, pending)).changed).toBe(true);
  const rejected = await persistLiveEditor(drafts, scope, editor, { ...editor, code: "print(20)" });
  expect(rejected).toEqual({ changed: false, current: pending });
  const restored = restoreLiveEditor(await drafts.get(liveCodingKey(scope)), scope);
  expect(restored?.pending).toEqual(pending.pending);
  expect(liveCodingKey({ ...scope, index: 3 })).not.toBe(liveCodingKey(scope));
  expect(restoreLiveEditor(JSON.stringify({ ...pending, code: "tampered" }), scope)).toBeNull();
  const api = transport({ attemptId: "attempt", ordinal: 1, feedback: null }, 202);
  await submitLiveCoding(api.request, scope, problem, restored!.pending!, controller.signal);
  await submitLiveCoding(api.request, scope, problem, restored!.pending!, controller.signal);
  expect(api.calls[0].init?.body).toBe(api.calls[1].init?.body);
  expect(JSON.parse(String(api.calls[0].init?.body))).toEqual({ courseId: scope.courseId, surface, submission: pending.pending });
});

test("the native grader and history display only observed public case results", async () => {
  const feedback = { problem: { problemId: "problem", version: 1 }, authority: "trusted_server", verdict: "partial",
    passed: 1, total: 2, publicCases: [{ testId: "private-id", passed: true,
      execution: { status: "completed", stdout: "secret", stderr: "", truncated: false } }] };
  const api = transport({ attempts: [{ id: "a", ordinal: 1, status: "completed", code: editor.code, feedback }] });
  await expect(loadLiveCodingHistory(api.request, scope, problem, controller.signal)).rejects.toThrow("Invalid live coding feedback");
  expect(readCodingSurface(new URL(api.calls[0].path, "https://app.example").searchParams.get("surface"))).toEqual(surface);
  const grader = transport({ attemptId: "a", ordinal: 1, feedback: { ...feedback, authority: "browser_practice", publicCases: [] } });
  await expect(submitLiveCoding(grader.request, scope, problem,
    { ...editor, requestId: "x", problem: { problemId: "problem", version: 1 } }, controller.signal)).rejects.toThrow();
});
