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

test("raw native consent intent bypasses router decoding and expires on the device", async () => {
  const { createConsentIntake } = await import("../../apps/mobile-native/routing/consent-intent");
  let now = 0;
  const intake = createConsentIntake(() => now);
  const state = "opaque%2F+ &state";
  const redirect = "https://client.example/callback?label=x+y&value=%26";
  const query = new URLSearchParams({ client_id: "client", redirect_uri: redirect, state });
  for (const prefix of ["zyx-native-parity://mcp/authorize", "zyx-native-parity:///mcp/authorize",
    "/mcp/authorize", NATIVE_STAGING_ORIGIN + "/mcp/authorize"]) {
    const routed = intake.capture(prefix + "?" + query, () => "ref");
    expect(routed).toBe("/mcp/authorize?handoff=ref");
    const url = new URL(intake.resolve("ref")!);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
  }
  expect(intake.capture("/mcp/authorize?" + query + "&state=second", () => "invalid")).toBe("/mcp/authorize");
  expect(intake.capture("/mcp/authorize?handoff=ref", () => "unused")).toBe("/mcp/authorize");
  expect(intake.capture("zyx-native-parity://auth/native-finish#state=fixture", () => "unused")).toBeNull();
  now = 300_000;
  expect(intake.resolve("ref")).toBeNull();
});
