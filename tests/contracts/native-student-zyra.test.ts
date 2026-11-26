import { beforeEach, expect, mock, test } from "bun:test";
import { tutorHistoryMessageId } from "../../lib/zyra/history-identity";

const origin = "https://staging.zyxacademy.com";
const guardian = mock(async (request: Request) => request.headers.get("x-student-id") === "student-a"
  ? { userId: "student-a" }
  : Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
const resolveAccess = mock(async () => ({ hasCourseAccess: true, capabilities: { canAskZyra: true }, tier: "enrolled" }));
const save = mock(async () => ({ success: true }));
const list = mock(async () => [{ id: "empty-draft", title: "Empty", messageCount: 0 }, { id: "owned", title: "Calculus", messageCount: 2 }]);
const history = mock(async () => ({ sessionId: "owned", messages: [] }));
const answer = mock(async () => ({ responseLanguage: "en", answer: "The answer is $x^2$.", sessionId: "owned", sources: [] }));
const receiptQuery = mock(async () => [{ sessionId: "owned" }]);
mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: guardian }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: resolveAccess }));
mock.module("@/app/actions/tutor", () => ({
  askTutorRagAction: answer, saveTutorMessagesAction: save, listTutorSessionsAction: list, loadTutorHistoryAction: history,
}));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "student-a" } }) } } }));
mock.module("@/lib/usage-budget-service", () => ({ FREE_ALLOWANCE_IDEMPOTENCY_PREFIX: "zyra-free:" }));
mock.module("@/lib/zyra/title-ai", () => ({ generateZyraSessionTitle: async () => ({ updated: false }) }));
mock.module("next/server", () => ({ after: () => {} }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: receiptQuery }) }) }) } }));
mock.module("@/lib/tutor/answer-sanitizer", () => ({ sanitizeAnswer: (value: string) => value }));

const { GET } = await import("../../app/api/native/student/zyra/route");
const { POST } = await import("../../app/api/zyra/chat/route");

const signed = { "x-student-id": "student-a" };
const read = (params: string, headers?: Record<string, string>) => GET(new Request(origin + "/api/native/student/zyra?" + params, { headers }));
function chat(persistHistory: boolean, headers?: Record<string, string>) {
  return POST(new Request(origin + "/api/zyra/chat", { method: "POST", headers,
    body: JSON.stringify({ courseId: "calculus", question: "What is x?", sessionId: "owned", requestId: "turn-1", persistHistory }) }));
}
beforeEach(() => {
  for (const fn of [guardian, resolveAccess, save, list, history, answer, receiptQuery]) fn.mockClear();
});

test("the Student history endpoint checks session and course, loads only owned saved history, and is never cached", async () => {
  expect((await read("view=history&courseId=calculus")).status).toBe(401);
  expect(list).not.toHaveBeenCalled();
  expect((await read("view=history&courseId=calculus&courseId=other", signed)).status).toBe(400);
  resolveAccess.mockImplementationOnce(async () => ({ hasCourseAccess: false, capabilities: { canAskZyra: false }, tier: "enrolled" }));
  expect((await read("view=history&courseId=calculus", signed)).status).toBe(403);
  const response = await read("view=history&courseId=calculus", signed);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ tier: "standard", sessions: [{ id: "owned" }], history: { sessionId: "owned" } });
  expect(history).toHaveBeenCalledWith("calculus", "owned");
});

test("the Student receipt lookup reports absent receipts without loading another conversation", async () => {
  receiptQuery.mockImplementationOnce(async () => []);
  expect(await (await read("view=receipt&courseId=calculus&requestId=turn-1", signed)).json()).toEqual({ saved: false });
  expect(history).not.toHaveBeenCalled();
  expect(await (await read("view=receipt&courseId=calculus&requestId=turn-1", signed)).json()).toMatchObject({ saved: true, history: { sessionId: "owned" } });
  expect(tutorHistoryMessageId("student-a", "calculus", "zyra:turn-1", 1))
    .not.toBe(tutorHistoryMessageId("student-b", "calculus", "zyra:turn-1", 1));
});

test("normal turns persist in the existing history only for the verified native opt-in", async () => {
  expect((await chat(true)).status).toBe(401);
  expect(answer).not.toHaveBeenCalled();
  expect(await (await chat(false)).text()).toContain("data: [DONE]");
  expect(save).not.toHaveBeenCalled();
  const response = await chat(true, signed);
  expect(response.status).toBe(200);
  const wire = await response.text();
  expect(wire).toContain('"type":"data-history","saved":true');
  expect(wire).toContain("data: [DONE]");
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith("calculus", expect.arrayContaining([
    expect.objectContaining({ role: "student", content: "What is x?" }),
    expect.objectContaining({ role: "ai", content: "The answer is $x^2$." }),
  ]), "owned", "zyra:turn-1");
});
