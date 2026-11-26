import { expect, test } from "bun:test";
import { handleAdminCourseQuestionCommand } from "@/lib/native/academic/course-question-command";

const origin = "https://example.test";
const path = ["admin", "courses", "course", "questions", "question"];
const viewer = { user: { id: "admin" }, session: { id: "session" } };
const key = "admin-course-question-delete";
const draft = { expectedRevision: "b".repeat(64), confirmed: true };

function request(body: unknown = draft, from = origin) {
  return new Request(origin, {
    method: "DELETE", headers: { Origin: from, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

test("course question deletion binds a same-origin Admin session, route and confirmation", async () => {
  const writes: unknown[][] = [];
  const services = { session: async () => viewer, hasAdmin: async () => true,
    remove: async (...args: unknown[]) => { writes.push(args); } };
  expect((await handleAdminCourseQuestionCommand(request(draft, "https://other.test"), path, origin, services)).status).toBe(403);
  expect((await handleAdminCourseQuestionCommand(request(), path, origin, { ...services, session: async () => null })).status).toBe(401);
  expect((await handleAdminCourseQuestionCommand(request(), path, origin, { ...services, hasAdmin: async () => false })).status).toBe(403);
  expect((await handleAdminCourseQuestionCommand(request(), ["tutor", ...path.slice(1)], origin, services)).status).toBe(404);
  expect((await handleAdminCourseQuestionCommand(request(), [...path.slice(0, 4), "../other"], origin, services)).status).toBe(400);
  expect((await handleAdminCourseQuestionCommand(request({ ...draft, courseId: "other" }), path, origin, services)).status).toBe(422);
  expect((await handleAdminCourseQuestionCommand(request({ ...draft, confirmed: false }), path, origin, services)).status).toBe(422);
  expect(writes).toEqual([]);
  const accepted = await handleAdminCourseQuestionCommand(request(), path, origin, services);
  expect(accepted.headers.get("cache-control")).toBe("private, no-store");
  expect(await accepted.json()).toEqual({ status: "saved", requestId: key });
  expect(writes).toEqual([["course", "question", draft, key, viewer]]);
});

test("course question deletion reports provenance, dependency and stale-version conflicts without a saved receipt", async () => {
  const expected = [
    ["HISTORICAL_QUESTION_IMMUTABLE", 403],
    ["QUESTION_NOT_FOUND", 404],
    ["DEPENDENCIES_EXIST", 409],
    ["REVISION_CONFLICT", 409],
  ] as const;
  for (const [code, status] of expected) {
    const response = await handleAdminCourseQuestionCommand(request(), path, origin, {
      session: async () => viewer, hasAdmin: async () => true, remove: async () => { throw new Error(code); },
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: status === 404 ? "NOT_FOUND" : code });
  }
});
