import { expect, test } from "bun:test";
import { browserDestination } from "../../apps/mobile-native/routing/browser-destination";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";

test("browser consent preserves registered-client inputs including encoded redirect and state", () => {
  const params = {
    client_id: "example", response_type: "code", code_challenge: "123", code_challenge_method: "S256",
    state: "+a%2F &b", redirect_uri: "https://example.org/return?q=a%26b", resource: NATIVE_STAGING_ORIGIN,
    scope: "read write", prompt: "none",
  };
  const link = new URL(browserDestination("authorize", { ...params, session_token: "private", next: "//example.org" })!);
  expect(link.origin + link.pathname).toBe(NATIVE_STAGING_ORIGIN + "/mcp/authorize");
  expect(Object.fromEntries(link.searchParams)).toEqual(params);
  expect(browserDestination("authorize", { ...params, state: ["first", "second"] })).toBeNull();
});

test("connections always opens the fixed account management page in the browser", () => {
  expect(browserDestination("connections", { origin: "https://example.org", id: "other", action: "disconnect" }))
    .toBe(NATIVE_STAGING_ORIGIN + "/mcp/connections");
});

test("meeting routes preserve case and encode a single path segment", () => {
  expect(browserDestination("meet", { slug: "Kelas A#1" })).toBe(NATIVE_STAGING_ORIGIN + "/meet/Kelas%20A%231");
  for (const slug of ["", ".", "..", "//example.org", "../x", "x\\y", "slug\n", "\ud800", ["a", "b"]]) {
    expect(browserDestination("meet", { slug })).toBeNull();
  }
});
