import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createGoogleMeetSpace,
  provisionGoogleMeetSpaceMembers,
} from "@/lib/google-meet";

const originalFetch = globalThis.fetch;
const originalGoogleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("Google Meet space members", () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    requests.length = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requests.push({ url, body });
      if (url.endsWith("/members") && body.email === "invalid@example.com") {
        return new Response("preview access required", { status: 403 });
      }
      if (url.endsWith("/members")) {
        return Response.json({ name: "spaces/space-1/members/member-1", ...body });
      }
      return Response.json({
        name: "spaces/space-1",
        meetingUri: "https://meet.google.com/abc-defg-hij",
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    restoreEnv("GOOGLE_REFRESH_TOKEN", originalGoogleRefreshToken);
    restoreEnv("GOOGLE_CLIENT_ID", originalGoogleClientId);
    restoreEnv("GOOGLE_CLIENT_SECRET", originalGoogleClientSecret);
    globalThis.fetch = originalFetch;
  });

  test("MEET-MEMBER-001: creates a moderated space", async () => {
    await createGoogleMeetSpace({ accessType: "RESTRICTED", moderation: "ON" });

    expect(requests[0]).toEqual({
      url: "https://meet.googleapis.com/v2/spaces",
      body: { config: { accessType: "RESTRICTED", moderation: "ON" } },
    });
  });

  test("MEET-MEMBER-002: co-host wins when an email is also an invitee", async () => {
    const result = await provisionGoogleMeetSpaceMembers("spaces/space-1", [
      { email: "admin@example.com", role: "ROLE_UNSPECIFIED" },
      { email: "Admin@example.com", role: "COHOST" },
    ]);

    expect(result).toEqual([
      { email: "admin@example.com", role: "COHOST", success: true },
    ]);
    expect(requests.filter((request) => request.url.endsWith("/members"))).toHaveLength(1);
    expect(requests.at(-1)?.body).toEqual({ email: "admin@example.com", role: "COHOST" });
  });

  test("MEET-MEMBER-003: reports one failed member without dropping successful members", async () => {
    const result = await provisionGoogleMeetSpaceMembers("space-1", [
      { email: "admin@example.com", role: "COHOST" },
      { email: "invalid@example.com", role: "ROLE_UNSPECIFIED" },
    ]);

    expect(result.map((item) => ({ email: item.email, success: item.success }))).toEqual([
      { email: "admin@example.com", success: true },
      { email: "invalid@example.com", success: false },
    ]);
  });
});
