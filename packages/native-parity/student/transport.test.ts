import { expect, test } from "bun:test";
import { bindStudentRequest } from "../../../apps/mobile-native/features/student/transport";

const session = { role: "student" as const, origin: "https://example.invalid", userId: "learner", locale: "id" };

test("session identity and locale come from the injected session even on retry", async () => {
  const seen: string[] = [];
  const request = bindStudentRequest(session, async (path, init) => {
    expect(path).toBe("/api/native/student/courses?view=catalog");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-app-locale")).toBe("id");
    expect(init?.redirect).toBe("error");
    expect(headers.get("content-type")).toBe("application/json");
    seen.push(headers.get("x-student-id")!);
    return new Response(null, { status: 204 });
  });
  for (let i = 0; i < 2; ++i) await request("/api/native/student/courses?view=catalog", {
    headers: { "x-student-id": "different-learner", "content-type": "application/json" },
  });
  expect(seen).toEqual(["learner", "learner"]);
});

test("external, traversing and non-API paths cannot reach the authenticated transport", async () => {
  let calls = 0;
  const request = bindStudentRequest(session, async () => { calls++; return new Response(); });
  for (const path of ["https://evil.invalid", "//evil.invalid/api/x", "/api/../auth", "/api/..%2f/../outside", "/api/\\test", "/courses"]) {
    await expect(request(path)).rejects.toThrow();
  }
  expect(calls).toBe(0);
});
