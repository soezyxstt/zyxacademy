import { beforeEach, expect, mock, test } from "bun:test";

let actor: { user: { id: string } } | null = { user: { id: "student-a" } };
const getCourse = mock(async (id: string) => id === "missing" ? null : ({ id, title: "Mechanics", privateBody: "not navigation data" }));
const listStudentEnrollments = mock(async () => [{ id: "course-a", title: "Mechanics", access: "standard", email: "private@example.test" }]);
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => actor }));
mock.module("@/lib/course-utils", () => ({ getCourse }));
mock.module("@/lib/student/course-catalog", () => ({ listStudentEnrollments }));
const { GET } = await import("@/app/api/student/navigation/route");

beforeEach(() => {
  actor = { user: { id: "student-a" } };
  getCourse.mockClear();
  listStudentEnrollments.mockClear();
});

test("unauthenticated and stale-account navigation requests never reach storage", async () => {
  actor = null;
  expect((await GET(new Request("http://localhost/api/student/navigation"))).status).toBe(401);
  actor = { user: { id: "student-b" } };
  expect((await GET(new Request("http://localhost/api/student/navigation?courseId=course-a", { headers: { "x-student-id": "student-a" } }))).status).toBe(409);
  expect(getCourse).not.toHaveBeenCalled();
  expect(listStudentEnrollments).not.toHaveBeenCalled();
});

test("enrollment reads use the authenticated account and expose only navigation metadata", async () => {
  const response = await GET(new Request("http://localhost/api/student/navigation", { headers: { "x-student-id": "student-a" } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual([{ id: "course-a", title: "Mechanics" }]);
  expect(listStudentEnrollments).toHaveBeenCalledWith("student-a");
  expect(getCourse).not.toHaveBeenCalled();
});

test("course fallback strips learning bodies and preserves a missing-course result", async () => {
  const response = await GET(new Request("http://localhost/api/student/navigation?courseId=course%2Fa"));
  expect(await response.json()).toEqual({ id: "course/a", title: "Mechanics" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await (await GET(new Request("http://localhost/api/student/navigation?courseId=missing"))).json()).toBeNull();
  expect(listStudentEnrollments).not.toHaveBeenCalled();
});
