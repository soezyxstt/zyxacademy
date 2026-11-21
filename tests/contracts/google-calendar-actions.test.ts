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
mock.module("@/lib/auth", () => ({ auth: { api: {
  getSession: async () => ({ user: { id: "fixture-user" } }),
  linkSocialAccount: async (input: any) => {
    expect(input.returnHeaders).toBe(true);
    expect(input.body.scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    return { response: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=fixture-state&code_challenge=fixture-pkce" }, headers: new Headers({ "Set-Cookie": "better-auth.oauth_state=fixture-signed-state; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure" }) };
  },
} } }));
const { connectGoogleCalendar } = await import("@/app/actions/google-calendar");

test("personal consent forwards the signed OAuth state cookie with its attributes", async () => {
  const { url } = await connectGoogleCalendar("/tutor/schedule");
  expect(written).toEqual([{ name: "better-auth.oauth_state", value: "fixture-signed-state", options: expect.objectContaining({ path: "/", maxAge: 600, httpOnly: true, secure: true, sameSite: "lax" }) }]);
  const consent = new URL(url!);
  expect(consent.searchParams.get("state")).toBe("fixture-state");
  expect(consent.searchParams.get("code_challenge")).toBe("fixture-pkce");
  expect(consent.searchParams.get("access_type")).toBe("offline");
  expect(consent.searchParams.get("include_granted_scopes")).toBe("true");
});
test("unauthorized roles cannot start personal consent", async () => {
  roles = ["admin"];
  await expect(connectGoogleCalendar("/calendar")).rejects.toThrow("Forbidden");
});
