import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";

let allowed = true;
mock.module("@/lib/coding/server-access", () => ({
  async requireCodingAccess() { if (!allowed) throw new Error("CODING_FORBIDDEN"); return { userId: "test", courseId: "course" }; },
  codingErrorResponse(error: Error) { return Response.json({ error: error.message }, { status: error.message === "CODING_FORBIDDEN" ? 403 : 503 }); },
}));
const { POST } = await import("@/app/api/coding/terminal/route");
const secret = Buffer.alloc(32, 42).toString("base64url");
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });
function request(body: unknown, origin = "https://staging.zyxacademy.com") {
  return new Request("http://internal-proxy/api/coding/terminal", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
describe("Python terminal ticket", () => {
  beforeEach(() => { allowed = true; process.env.NEXT_PUBLIC_APP_URL = "https://staging.zyxacademy.com"; process.env.PYTHON_RUNTIME_TOKEN_SECRET = secret; });
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
  test("issues production tickets for both public production origins", async () => {
    for (const origin of ["https://www.zyxacademy.com", "https://zyxacademy.com"]) {
      process.env.NEXT_PUBLIC_APP_URL = origin;
      const response = await POST(request({ courseId: "course" }, origin));
      expect(response.status).toBe(200);
      const result = await response.json();
      const [body, signature] = result.ticket.split(".");
      expect(JSON.parse(Buffer.from(body, "base64url").toString()).aud).toBe("zyx-python-production");
      expect(signature).toBe(createHmac("sha256", Buffer.from(secret, "base64url")).update(body).digest("base64url"));
      expect((await POST(request({ courseId: "course" }))).status).toBe(403);
    }
  });
  test("rejects missing access, cross-origin, invalid input and unknown deployments", async () => {
    allowed = false; expect((await POST(request({ courseId: "course" }))).status).toBe(403);
    allowed = true; expect((await POST(request({ courseId: "course" }, "https://other.example.test"))).status).toBe(403);
    expect((await POST(request({ courseId: "" }))).status).toBe(400);
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.test"; expect((await POST(request({ courseId: "course" }))).status).toBe(503);
  });
  test("requires a valid ticket key in production", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.zyxacademy.com";
    delete process.env.PYTHON_RUNTIME_TOKEN_SECRET;
    expect((await POST(request({ courseId: "course" }, process.env.NEXT_PUBLIC_APP_URL))).status).toBe(503);
  });
});
