import { expect, mock, test } from "bun:test";

const written: Array<{ name: string; value: string; options: any }> = [];
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: (name: string, value: string, options: unknown) => written.push({ name, value, options }) }),
}));
let roles = ["murid"];
mock.module("@/lib/auth/authorization", () => ({ getPeranCodes: async () => roles }));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/jobs/client", () => ({ inngest: {} }));
mock.module("@/lib/google-calendar/sync", () => ({ centralCalendarConfigured: () => true, personalCalendarAccount: async () => null }));
const issuedHandoffs: Array<{ googleUrl: string; setCookieHeader: string }> = [];
let sessionEmail: string | undefined = "student@example.com";
mock.module("@/lib/native/google-link-handoff", () => ({
  issueNativeGoogleLinkHandoff: async (payload: { googleUrl: string; setCookieHeader: string }) => {
    issuedHandoffs.push(payload);
    return "fixture_handoff_token_123456789012345678901";
  },
}));
mock.module("@/lib/auth", () => ({ auth: { api: {
  getSession: async () => ({ user: { id: "fixture-user", email: sessionEmail } }),
  linkSocialAccount: async (input: any) => {
    expect(input.returnHeaders).toBe(true);
    expect(input.body.scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    return { response: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=fixture-state&code_challenge=fixture-pkce&prompt=select_account" }, headers: new Headers({ "Set-Cookie": "better-auth.oauth_state=fixture-signed-state; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure" }) };
  },
} } }));
const { connectGoogleCalendar } = await import("@/app/actions/google-calendar");

test("personal consent forwards the signed OAuth state cookie and pre-selects the session email", async () => {
  written.length = 0;
  sessionEmail = "student@example.com";
  const { url, nativeBrowser } = await connectGoogleCalendar("/tutor/schedule");
  expect(nativeBrowser).toBe(false);
  expect(written).toEqual([{ name: "better-auth.oauth_state", value: "fixture-signed-state", options: expect.objectContaining({ path: "/", maxAge: 600, httpOnly: true, secure: true, sameSite: "lax" }) }]);
  const consent = new URL(url!);
  expect(consent.searchParams.get("state")).toBe("fixture-state");
  expect(consent.searchParams.get("code_challenge")).toBe("fixture-pkce");
  expect(consent.searchParams.get("access_type")).toBe("offline");
  expect(consent.searchParams.get("include_granted_scopes")).toBe("true");
  expect(consent.searchParams.get("prompt")).toBe("consent");
  expect(consent.searchParams.get("login_hint")).toBe("student@example.com");
});

test("native personal consent issues a single-use system-browser handoff without writing WebView cookies", async () => {
  written.length = 0;
  issuedHandoffs.length = 0;
  sessionEmail = "student@example.com";
  const { url, nativeBrowser } = await connectGoogleCalendar("/calendar", { nativeScheme: "com.zyx.academy" });
  expect(nativeBrowser).toBe(true);
  expect(written).toEqual([]);
  expect(url).toBe("/api/auth/native/google-link/start?token=fixture_handoff_token_123456789012345678901");
  expect(issuedHandoffs).toHaveLength(1);
  const googleUrl = new URL(issuedHandoffs[0].googleUrl);
  expect(googleUrl.searchParams.get("prompt")).toBe("consent");
  expect(googleUrl.searchParams.get("login_hint")).toBe("student@example.com");
  expect(issuedHandoffs[0].setCookieHeader).toContain("better-auth.oauth_state=fixture-signed-state");
});

test("unauthorized roles cannot start personal consent", async () => {
  roles = ["admin"];
  await expect(connectGoogleCalendar("/calendar")).rejects.toThrow("Forbidden");
});
