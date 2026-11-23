import { afterAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { multiSession } from "better-auth/plugins/multi-session";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "./helpers/postgres";

const origin = "https://staging.zyxacademy.com";
const clientId = "test-client.apps.googleusercontent.com";
const previousClientId = process.env.GOOGLE_CLIENT_ID;
const previousAuthUrl = process.env.BETTER_AUTH_URL;
process.env.GOOGLE_CLIENT_ID = clientId;
process.env.BETTER_AUTH_URL = origin;
const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { nativeGoogleSignInGuard } = await import("@/lib/native/google-auth-plugin");
const verifiedNonces: string[] = [];
const testAuth = betterAuth({
  baseURL: origin,
  secret: "test-native-google-auth-secret-with-more-than-32-chars",
  trustedOrigins: [origin],
  emailAndPassword: { enabled: true },
  plugins: [multiSession(), nativeGoogleSignInGuard()],
  database: drizzleAdapter(testDb, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId,
      clientSecret: "test-only",
      // Keep Google external verification outside this local integration test.
      verifyIdToken: async (token, nonce) => {
        if (!nonce || token !== `valid:${nonce}`) return false;
        verifiedNonces.push(nonce);
        return true;
      },
      getUserInfo: async () => ({
        user: { id: "google-student-b", name: "Student B", email: "student-b@example.com", emailVerified: true },
        data: {},
      }),
    },
  },
});
mock.module("@/lib/auth", () => ({ auth: testAuth }));
const { POST } = await import("@/app/api/auth/native/google/route");
const { NATIVE_GOOGLE_CHALLENGE_COOKIE } = await import("@/lib/native/google-auth-challenge");

afterAll(async () => {
  await client.close();
  if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = previousClientId;
  if (previousAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = previousAuthUrl;
});

function request(body: Record<string, unknown>, cookie = "", requestOrigin = origin) {
  return new NextRequest(`${origin}/api/auth/native/google`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}
function cookies(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
}
async function challenge(existingCookie = "") {
  const response = await POST(request({ action: "challenge" }, existingCookie));
  expect(response.status).toBe(200);
  const data = await response.json() as { nonce: string; clientId: string };
  return { response, data, cookie: cookies(response) };
}

describe("native Google nonce and Better Auth session exchange", () => {
  test("issues an independent HttpOnly proof and forwards the verified nonce with all session cookies", async () => {
    const previous = await testAuth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ name: "Student A", email: "student-a@example.com", password: "strong-pass-123" }),
    }));
    expect(previous.status).toBe(200);
    const oldCookies = cookies(previous);
    const issued = await challenge(oldCookies);
    expect(issued.data.clientId).toBe(clientId);
    expect(issued.data.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.cookie).not.toContain(issued.data.nonce);
    expect(issued.response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(issued.response.headers.get("set-cookie")).toContain("Secure");
    expect(issued.response.headers.get("set-cookie")).toContain("SameSite=strict");

    const response = await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, `${oldCookies}; ${issued.cookie}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["userId"]);
    expect(body.userId).toBeString();
    expect(verifiedNonces).toContain(issued.data.nonce);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie().some(value => value.includes("session_token="))).toBe(true);
    expect(response.headers.getSetCookie().some(value => value.includes("session_token_multi-"))).toBe(true);

    const priorSession = await testAuth.api.getSession({ headers: new Headers({ cookie: oldCookies }) });
    expect(priorSession?.user.email).toBe("student-a@example.com");
    const replay = await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie));
    expect(replay.status).toBe(401);
  });

  test("rejects foreign origins without consuming a legitimate challenge", async () => {
    const issued = await challenge();
    const denied = await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie, "https://other.example"));
    expect(denied.status).toBe(403);
    const response = await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie));
    expect(response.status).toBe(200);
  });

  test("the standard social endpoint cannot bypass the proof or choose its own nonce", async () => {
    const issued = await challenge();
    const attempt = (cookie: string, nonce: string, requestOrigin = origin) => testAuth.handler(new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json", cookie },
      body: JSON.stringify({ provider: "google", idToken: { token: `valid:${issued.data.nonce}`, nonce } }),
    }));
    expect((await attempt("", issued.data.nonce)).status).toBe(401);
    expect((await attempt(issued.cookie, issued.data.nonce, "https://other.example")).status).toBe(403);
    // The guard replaces the caller's nonce with the stored expectation.
    expect((await attempt(issued.cookie, "caller-selected-nonce")).status).toBe(200);
    expect(verifiedNonces.at(-1)).toBe(issued.data.nonce);
    expect((await attempt(issued.cookie, issued.data.nonce)).status).toBe(401);
  });

  test("rejects missing, wrong and already-used proofs", async () => {
    const issued = await challenge();
    expect((await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }))).status).toBe(401);
    expect((await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, `${NATIVE_GOOGLE_CHALLENGE_COOKIE}=wrong`))).status).toBe(401);
    expect((await POST(request({ action: "verify", idToken: "valid:wrong-nonce" }, issued.cookie))).status).toBe(401);
    expect((await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie))).status).toBe(401);
  });

  test("at most one concurrent verification consumes the nonce", async () => {
    const issued = await challenge();
    const results = await Promise.all([
      POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie)),
      POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie)),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 401]);
  });

  test("rejects an expired challenge", async () => {
    const issued = await challenge();
    const proof = issued.cookie.split("=", 2)[1];
    const id = `native-google:${createHash("sha256").update(proof).digest("hex")}`;
    await testDb.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(schema.verification.id, id));
    expect((await POST(request({ action: "verify", idToken: `valid:${issued.data.nonce}` }, issued.cookie))).status).toBe(401);
  });

  test("cancel and replacement invalidate the previous challenge without touching sessions", async () => {
    const first = await challenge();
    const second = await challenge(first.cookie);
    expect((await POST(request({ action: "verify", idToken: `valid:${first.data.nonce}` }, first.cookie))).status).toBe(401);
    const cancelled = await POST(request({ action: "cancel" }, second.cookie));
    expect(cancelled.status).toBe(200);
    expect(cancelled.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await POST(request({ action: "verify", idToken: `valid:${second.data.nonce}` }, second.cookie))).status).toBe(401);
  });
});
