import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";

let allowed = true;
mock.module("@/lib/coding/server-access", () => ({
  assertCodingSameOrigin(request: Request) { if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("CODING_FORBIDDEN"); },
  async requireCodingAccess() { if (!allowed) throw new Error("CODING_FORBIDDEN"); return { userId: "test", courseId: "course" }; },
  codingErrorResponse(error: Error) { return Response.json({ error: error.message }, { status: error.message === "CODING_FORBIDDEN" ? 403 : 503 }); },
}));
const { POST } = await import("@/app/api/coding/terminal/route");
const secret = Buffer.alloc(32, 42).toString("base64url");
function request(body: unknown, origin = "https://staging.example.test") {
  return new Request("https://staging.example.test/api/coding/terminal", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
describe("staging Python terminal ticket", () => {
  beforeEach(() => { allowed = true; process.env.ZYX_ENVIRONMENT = "staging"; process.env.PYTHON_RUNTIME_TOKEN_SECRET = secret; });
  test("issues an authenticated short-lived single-use ticket without exposing the key", async () => {
    const response = await POST(request({ courseId: "course" }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json(); const [body, signature] = result.ticket.split(".");
    expect(signature).toBe(createHmac("sha256", Buffer.from(secret, "base64url")).update(body).digest("base64url"));
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    expect(payload.aud).toBe("zyx-python-staging"); expect(payload.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(90);
    expect(JSON.stringify(result)).not.toContain(secret);
    const other = await (await POST(request({ courseId: "course" }))).json(); expect(other.ticket).not.toBe(result.ticket);
  });
  test("rejects missing access, cross-origin, invalid input and non-staging", async () => {
    allowed = false; expect((await POST(request({ courseId: "course" }))).status).toBe(403);
    allowed = true; expect((await POST(request({ courseId: "course" }, "https://other.example.test"))).status).toBe(403);
    expect((await POST(request({ courseId: "" }))).status).toBe(400);
    process.env.ZYX_ENVIRONMENT = "production"; expect((await POST(request({ courseId: "course" }))).status).toBe(503);
  });
});
