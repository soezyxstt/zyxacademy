import { afterAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import * as schema from "@/db/schema";
import { NATIVE_AUTH_HANDOFF_COOKIE } from "@/lib/native/auth-handoff";
import { createPostgresTestDb } from "./helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(() => client.close());

const testAuth = betterAuth({
  baseURL: "https://staging.zyxacademy.com",
  secret: "test-secret-key-for-native-auth-handoff-32-chars",
  trustedOrigins: ["https://staging.zyxacademy.com"],
  emailAndPassword: { enabled: true },
  plugins: [
    oneTimeToken({
      expiresIn: 2,
      storeToken: "hashed",
      disableClientRequest: true,
    }),
  ],
  database: drizzleAdapter(testDb, {
    provider: "pg",
    schema,
  }),
});

mock.module("@/lib/auth", () => ({ auth: testAuth }));

const { GET: startNativeAuth } = await import("@/app/api/auth/native/start/route");
const { GET: completeNativeAuth } = await import("@/app/api/auth/native/complete/route");

function extractCookiePair(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookie);
  return match ? `${name}=${match[1]}` : null;
}

describe("Better Auth oneTimeToken native browser handoff", () => {
  test("full mobile Chrome Custom Tab flow: start cookie -> complete 302 fragment -> verify cookie -> reject replay & direct client OTT mint", async () => {
    const signUpRes = await testAuth.handler(
      new Request("https://staging.zyxacademy.com/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://staging.zyxacademy.com",
        },
        body: JSON.stringify({
          name: "Student Nightly",
          email: "student-nightly@example.com",
          password: "strong-password-123",
        }),
      }),
    );
    expect(signUpRes.status).toBe(200);
    const chromeCookie = signUpRes.headers.get("set-cookie");
    expect(chromeCookie).toBeTruthy();

    // Direct client request to /api/auth/one-time-token/generate MUST be disabled
    const directMintRes = await testAuth.handler(
      new Request("https://staging.zyxacademy.com/api/auth/one-time-token/generate", {
        method: "GET",
        headers: { cookie: chromeCookie! },
      }),
    );
    expect(directMintRes.status).toBeGreaterThanOrEqual(400);

    // 1. Mobile Chrome Custom Tab hits /api/auth/native/start to establish HttpOnly handoff cookie
    const state = "mobile_state_nonce_abcdef123456";
    const startRes = await startNativeAuth(
      new NextRequest(
        `https://staging.zyxacademy.com/api/auth/native/start?scheme=com.zyx.academy.nightly&state=${state}&next=/courses/math`,
      ),
    );
    expect(startRes.status).toBe(302);
    const handoffCookiePair = extractCookiePair(
      startRes.headers.get("set-cookie"),
      NATIVE_AUTH_HANDOFF_COOKIE,
    );
    expect(handoffCookiePair).toBeTruthy();

    // 2. Cross-site GET to /complete WITHOUT handoff cookie MUST be rejected with 403
    const csrfCompleteRes = await completeNativeAuth(
      new NextRequest(
        `https://staging.zyxacademy.com/api/auth/native/complete?scheme=com.zyx.academy.nightly&state=${state}&next=/courses/math`,
        { headers: { cookie: chromeCookie! } },
      ),
    );
    expect(csrfCompleteRes.status).toBe(403);

    // 3. Legitimate callback with matching handoff cookie mints OTT and returns fragment 302
    const completeReq = new NextRequest(
      `https://staging.zyxacademy.com/api/auth/native/complete?scheme=com.zyx.academy.nightly&state=${state}&next=/courses/math`,
      {
        headers: { cookie: `${chromeCookie!}; ${handoffCookiePair!}` },
      },
    );
    const completeRes = await completeNativeAuth(completeReq);
    expect(completeRes.status).toBe(302);
    expect(completeRes.headers.get("cache-control")).toBe("no-store");

    const location = completeRes.headers.get("location");
    expect(location).toBeTruthy();
    expect(location!.startsWith("com.zyx.academy.nightly://auth/native-finish#")).toBe(true);
    expect(location!).not.toContain("?token=");

    const parsedLocation = new URL(location!);
    const hashParams = new URLSearchParams(parsedLocation.hash.replace(/^#/, ""));
    const oneTimeTokenValue = hashParams.get("token");
    expect(oneTimeTokenValue).toBeTruthy();
    expect(hashParams.get("state")).toBe(state);
    expect(hashParams.get("next")).toBe("/courses/math");

    // 4. WebView exchanges the one-time token (with zero pre-existing cookies)
    const verifyRes = await testAuth.handler(
      new Request("https://staging.zyxacademy.com/api/auth/one-time-token/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://staging.zyxacademy.com",
        },
        body: JSON.stringify({ token: oneTimeTokenValue }),
      }),
    );
    expect(verifyRes.status).toBe(200);
    const webviewCookie = verifyRes.headers.get("set-cookie");
    expect(webviewCookie).toContain("session_token=");

    // 5. Replaying the same single-use token must fail
    const replayRes = await testAuth.handler(
      new Request("https://staging.zyxacademy.com/api/auth/one-time-token/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://staging.zyxacademy.com",
        },
        body: JSON.stringify({ token: oneTimeTokenValue }),
      }),
    );
    expect(replayRes.status).toBeGreaterThanOrEqual(400);
  });

  test("desktop browser flow returns no-store HTML handoff page with fragment deep link", async () => {
    const signInRes = await testAuth.handler(
      new Request("https://staging.zyxacademy.com/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://staging.zyxacademy.com",
        },
        body: JSON.stringify({
          email: "student-nightly@example.com",
          password: "strong-password-123",
        }),
      }),
    );
    const desktopCookie = signInRes.headers.get("set-cookie");
    expect(desktopCookie).toBeTruthy();

    const state = "desktop_state_nonce_xyz987654";
    const startRes = await startNativeAuth(
      new NextRequest(
        `https://staging.zyxacademy.com/api/auth/native/start?scheme=zyxacademy-nightly&state=${state}&next=/dashboard`,
      ),
    );
    const handoffCookiePair = extractCookiePair(
      startRes.headers.get("set-cookie"),
      NATIVE_AUTH_HANDOFF_COOKIE,
    );

    const completeReq = new NextRequest(
      `https://staging.zyxacademy.com/api/auth/native/complete?scheme=zyxacademy-nightly&state=${state}&next=/dashboard`,
      {
        headers: { cookie: `${desktopCookie!}; ${handoffCookiePair!}; zyx_locale=en` },
      },
    );
    const completeRes = await completeNativeAuth(completeReq);
    expect(completeRes.status).toBe(200);
    expect(completeRes.headers.get("cache-control")).toBe("no-store");
    const html = await completeRes.text();
    expect(html).toContain("zyxacademy-nightly://auth/native-finish#token=");
    expect(html).toContain(`state=${state}`);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Open Zyx Academy");
  });

  test("rejects disallowed schemes or mismatched state", async () => {
    const badSchemeReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=javascript&state=valid_state_nonce_123456&next=/dashboard",
    );
    expect((await completeNativeAuth(badSchemeReq)).status).toBe(400);

    const missingStateReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=com.zyx.academy.nightly&next=/courses",
    );
    expect((await completeNativeAuth(missingStateReq)).status).toBe(400);
  });

  test("preserves canonical HTTPS origin and Secure cookie behind Cloud Run HTTP reverse proxy", async () => {
    const prevAuthUrl = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://staging.zyxacademy.com";
    try {
      const state = "cloudrun_proxy_state_1234567890";
      const res = await startNativeAuth(
        new NextRequest(
          `http://127.0.0.1:3001/api/auth/native/start?scheme=com.zyx.academy.nightly&state=${state}&next=/dashboard`,
          {
            headers: {
              host: "staging.zyxacademy.com",
              "x-forwarded-host": "staging.zyxacademy.com",
              "x-forwarded-proto": "https",
            },
          },
        ),
      );
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location.startsWith("https://staging.zyxacademy.com/auth/native-start?")).toBe(true);
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`${NATIVE_AUTH_HANDOFF_COOKIE}=`);
      expect(setCookie).toContain("Secure");
    } finally {
      if (prevAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = prevAuthUrl;
    }
  });
});
