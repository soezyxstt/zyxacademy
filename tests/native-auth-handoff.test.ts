import { afterAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import * as schema from "@/db/schema";
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
    }),
  ],
  database: drizzleAdapter(testDb, {
    provider: "pg",
    schema,
  }),
});

mock.module("@/lib/auth", () => ({ auth: testAuth }));

const { GET: completeNativeAuth } = await import("@/app/api/auth/native/complete/route");

describe("Better Auth oneTimeToken native browser handoff", () => {
  test("full mobile Chrome Custom Tab flow: complete -> 302 deep link -> verify cookie -> reject replay", async () => {
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

    // 1. Mobile Chrome Custom Tab hits /api/auth/native/complete with Chrome's session cookie
    const completeReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=com.zyx.academy.nightly&next=/courses/math",
      {
        headers: { cookie: chromeCookie! },
      },
    );
    const completeRes = await completeNativeAuth(completeReq);
    expect(completeRes.status).toBe(302);
    expect(completeRes.headers.get("cache-control")).toBe("no-store");

    const location = completeRes.headers.get("location");
    expect(location).toBeTruthy();
    expect(location!.startsWith("com.zyx.academy.nightly://auth/native-finish?")).toBe(true);

    const parsedLocation = new URL(location!);
    const oneTimeTokenValue = parsedLocation.searchParams.get("token");
    expect(oneTimeTokenValue).toBeTruthy();
    expect(parsedLocation.searchParams.get("next")).toBe("/courses/math");

    // 2. WebView exchanges the one-time token (with zero pre-existing cookies)
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

    // 3. Replaying the same single-use token must fail
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

  test("desktop browser flow returns no-store HTML handoff page with zyxacademy-nightly deep link", async () => {
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

    const completeReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=zyxacademy-nightly&next=/dashboard",
      {
        headers: { cookie: desktopCookie! },
      },
    );
    const completeRes = await completeNativeAuth(completeReq);
    expect(completeRes.status).toBe(200);
    expect(completeRes.headers.get("cache-control")).toBe("no-store");
    const html = await completeRes.text();
    expect(html).toContain("zyxacademy-nightly://auth/native-finish?token=");
    expect(html).toContain("Buka Zyx Academy");
  });

  test("rejects disallowed schemes with HTTP 400 and redirects unauthenticated requests to native-start", async () => {
    const badSchemeReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=javascript&next=/dashboard",
    );
    expect((await completeNativeAuth(badSchemeReq)).status).toBe(400);

    const unauthReq = new NextRequest(
      "https://staging.zyxacademy.com/api/auth/native/complete?scheme=com.zyx.academy.nightly&next=/courses",
    );
    const unauthRes = await completeNativeAuth(unauthReq);
    expect(unauthRes.status).toBe(302);
    expect(unauthRes.headers.get("location")).toBe(
      "https://staging.zyxacademy.com/auth/native-start?scheme=com.zyx.academy.nightly&next=%2Fcourses",
    );
  });
});
