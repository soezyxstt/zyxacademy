import { describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
mock.module("@/lib/auth", () => ({ auth: {} }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: () => {} }));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/db/schema", () => ({ codingProblems: {} }));
const { assertCodingSameOrigin } = await import("@/lib/coding/server-access");
describe("coding requests behind the staging proxy", () => {
  test("accepts the staging origin but rejects another origin", () => {
    process.env.ZYX_ENVIRONMENT = "staging";
    expect(() => assertCodingSameOrigin(new Request("http://internal/api/coding/drafts", { headers: { origin: "https://staging.zyxacademy.com" } }))).not.toThrow();
    expect(() => assertCodingSameOrigin(new Request("http://internal/api/coding/drafts", { headers: { origin: "https://other.example" } }))).toThrow("CODING_FORBIDDEN");
  });
  test("retains the same-origin check outside staging", () => {
    process.env.ZYX_ENVIRONMENT = "production";
    expect(() => assertCodingSameOrigin(new Request("https://zyxacademy.com/api/coding/drafts", { headers: { origin: "https://zyxacademy.com" } }))).not.toThrow();
    expect(() => assertCodingSameOrigin(new Request("https://zyxacademy.com/api/coding/drafts", { headers: { origin: "https://other.example" } }))).toThrow("CODING_FORBIDDEN");
  });
});
