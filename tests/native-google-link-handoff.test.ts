import { afterAll, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { parseNativeDeepLink } from "@/lib/native/deep-links";
import { createPostgresTestDb } from "./helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(() => client.close());

mock.module("@/db", () => ({ db: testDb }));

const { issueNativeGoogleLinkHandoff } = await import("@/lib/native/google-link-handoff");
const { GET: startGoogleLink } = await import("@/app/api/auth/native/google-link/start/route");
const { GET: completeGoogleLink } = await import("@/app/api/auth/native/google-link/complete/route");

describe("Native system-browser Google scope-link handoff", () => {
  test("start route forwards only OAuth state cookies, strips session cookies, redirects to Google consent, and rejects replay", async () => {
    const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=s1&prompt=consent&login_hint=user%40example.com";
    const token = await issueNativeGoogleLinkHandoff({
      googleUrl,
      setCookies: [
        "better-auth.oauth_state=signed-state-value; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure",
        "better-auth.session_token=do-not-leak-1; Path=/; HttpOnly; Secure",
        "__Secure-better-auth.session_token=do-not-leak-2; Path=/; HttpOnly; Secure",
      ],
    });

    const firstRes = await startGoogleLink(
      new NextRequest(`https://staging.zyxacademy.com/api/auth/native/google-link/start?token=${token}`),
    );
    expect(firstRes.status).toBe(302);
    expect(firstRes.headers.get("location")).toBe(googleUrl);
    expect(firstRes.headers.get("cache-control")).toBe("no-store");
    const setCookie = firstRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.oauth_state=signed-state-value");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("session_token");
    expect(setCookie).not.toContain("do-not-leak");

    const replayRes = await startGoogleLink(
      new NextRequest(`https://staging.zyxacademy.com/api/auth/native/google-link/start?token=${token}`),
    );
    expect(replayRes.status).toBe(410);
    expect(replayRes.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects non-Google OAuth URLs when issuing a handoff", async () => {
    await expect(
      issueNativeGoogleLinkHandoff({
        googleUrl: "https://evil.example/o/oauth2/v2/auth",
        setCookies: [],
      }),
    ).rejects.toThrow("Invalid Google OAuth URL");
  });

  test("complete route redirects mobile schemes to deep link and renders desktop handoff HTML", async () => {
    const mobileRes = await completeGoogleLink(
      new NextRequest(
        "https://staging.zyxacademy.com/api/auth/native/google-link/complete?scheme=com.zyx.academy.nightly&next=/dashboard/schedule&param=calendarSync&status=ok",
      ),
    );
    expect(mobileRes.status).toBe(302);
    expect(mobileRes.headers.get("cache-control")).toBe("no-store");
    const mobileDeepLink = mobileRes.headers.get("location")!;
    expect(mobileDeepLink).toBe("com.zyx.academy.nightly://dashboard/schedule?calendarSync=1");
    expect(parseNativeDeepLink(mobileDeepLink)).toEqual({
      kind: "app",
      path: "/dashboard/schedule?calendarSync=1",
    });

    const desktopRes = await completeGoogleLink(
      new NextRequest(
        "https://www.zyxacademy.com/api/auth/native/google-link/complete?scheme=zyxacademy&next=/tutor/schedule&param=calendarSync&status=ok",
      ),
    );
    expect(desktopRes.status).toBe(200);
    expect(desktopRes.headers.get("cache-control")).toBe("no-store");
    const html = await desktopRes.text();
    expect(html).toContain("zyxacademy://tutor/schedule?calendarSync=1");
    expect(html).toContain("Akun Google terhubung");
  });

  test("complete route handles provider errors, rejects disallowed schemes, and constrains next paths and params", async () => {
    const errorRes = await completeGoogleLink(
      new NextRequest(
        "https://www.zyxacademy.com/api/auth/native/google-link/complete?scheme=com.zyx.academy&next=/calendar&param=calendarSync&error=access_denied",
      ),
    );
    expect(errorRes.status).toBe(302);
    expect(errorRes.headers.get("location")).toBe("com.zyx.academy://calendar?calendarSync=error");

    const badSchemeRes = await completeGoogleLink(
      new NextRequest(
        "https://www.zyxacademy.com/api/auth/native/google-link/complete?scheme=javascript&next=/calendar",
      ),
    );
    expect(badSchemeRes.status).toBe(400);

    const unsupportedNextRes = await completeGoogleLink(
      new NextRequest(
        "https://www.zyxacademy.com/api/auth/native/google-link/complete?scheme=com.zyx.academy&next=/courses/123&param=arbitrary",
      ),
    );
    expect(unsupportedNextRes.status).toBe(302);
    expect(unsupportedNextRes.headers.get("location")).toBe("com.zyx.academy://calendar?calendarSync=1");
  });
});

test("Expo staging returns Calendar consent without issuing or transferring a login credential", async () => {
  const state = "525bfd44-97a7-495e-b1f0-ca84d41d7a0a";
  const previous = process.env.BETTER_AUTH_URL;
  try {
    process.env.BETTER_AUTH_URL = "https://staging.zyxacademy.com";
    const url = new URL("https://staging.zyxacademy.com/api/auth/native/google-link/complete");
    url.search = new URLSearchParams({ scheme: "zyx-native-parity", next: "/dashboard/schedule", linkState: state, status: "ok" }).toString();
    const appUrl = "zyx-native-parity://dashboard/schedule?calendarSync=1&linkState=" + state;
    const ios = await completeGoogleLink(new NextRequest(url, { headers: { "User-Agent": "iPhone", Accept: "text/html" } }));
    expect(ios.status).toBe(302);
    expect(ios.headers.get("location")).toBe(appUrl);
    expect(ios.headers.get("set-cookie")).toBeNull();

    const android = await completeGoogleLink(new NextRequest(url, { headers: { "User-Agent": "Android", Accept: "text/html" } }));
    expect(android.status).toBe(200);
    expect(android.headers.get("cache-control")).toBe("no-store");
    expect(android.headers.get("set-cookie")).toBeNull();
    expect(android.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await android.text();
    expect(html).toContain(appUrl.replace("&", "&amp;"));
    expect(html).not.toContain("<script>");

    url.searchParams.set("error", "access_denied");
    const denied = await completeGoogleLink(new NextRequest(url));
    expect(denied.headers.get("location")).toBe(appUrl.replace("calendarSync=1", "calendarSync=error"));
    url.searchParams.append("linkState", state);
    expect((await completeGoogleLink(new NextRequest(url))).status).toBe(400);
    url.searchParams.set("linkState", state);
    url.searchParams.set("next", "/tutor/schedule");
    expect((await completeGoogleLink(new NextRequest(url))).status).toBe(400);
    url.searchParams.set("next", "/calendar");
    process.env.BETTER_AUTH_URL = "https://www.zyxacademy.com";
    expect((await completeGoogleLink(new NextRequest(url))).status).toBe(400);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});
