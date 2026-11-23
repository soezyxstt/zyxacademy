import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  DASHBOARD_ENTRY_COOKIE_NAME,
  type RoleDashboardPath,
} from "@/lib/auth/dashboard-entry";

let mockSession: { user?: { id: string } } | null = null;
let mockSessionError: Error | null = null;
let mockDestination: RoleDashboardPath = "/dashboard";
let mockBaseUrl = "https://www.zyxacademy.com";

mock.module("@/lib/auth-site-url", () => ({
  resolveAuthBaseUrl: () => mockBaseUrl,
}));

mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => {
    if (mockSessionError) throw mockSessionError;
    return mockSession;
  },
}));

mock.module("@/lib/auth/dashboard-entry-server", () => ({
  resolveUserDashboardPath: async () => mockDestination,
}));

const { GET } = await import("@/app/api/entry-redirect/route");

describe("GET /api/entry-redirect", () => {
  beforeEach(() => {
    mockSession = null;
    mockSessionError = null;
    mockDestination = "/dashboard";
    mockBaseUrl = "https://www.zyxacademy.com";
  });

  test("redirects active users to their resolved role dashboard and sets the cooldown cookie", async () => {
    for (const target of ["/admin", "/tutor", "/dashboard"] as const) {
      mockSession = { user: { id: `user-${target.slice(1)}` } };
      mockDestination = target;

      const response = await GET(
        new NextRequest("https://www.zyxacademy.com/api/entry-redirect?returnTo=%2F"),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`https://www.zyxacademy.com${target}`);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const cookie = response.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME);
      expect(cookie?.value).toBe("1");
    }
  });

  test("falls back to safe returnTo when the session is missing or stale", async () => {
    const enRes = await GET(
      new NextRequest("https://www.zyxacademy.com/api/entry-redirect?returnTo=%2Fen"),
    );
    expect(enRes.status).toBe(307);
    expect(enRes.headers.get("location")).toBe("https://www.zyxacademy.com/en");
    expect(enRes.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME)?.value).toBe("1");

    const unsafeRes = await GET(
      new NextRequest("https://www.zyxacademy.com/api/entry-redirect?returnTo=%2F%2Fevil.example"),
    );
    expect(unsafeRes.status).toBe(307);
    expect(unsafeRes.headers.get("location")).toBe("https://www.zyxacademy.com/");
  });

  test("falls back safely to returnTo if session resolution throws", async () => {
    mockSessionError = new Error("DB_UNAVAILABLE");
    mockBaseUrl = "http://localhost";

    const response = await GET(
      new NextRequest("http://localhost/api/entry-redirect?returnTo=%2Fid"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/id");
    expect(response.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME)?.value).toBe("1");
  });

  test("uses the configured public origin behind Cloud Run for dashboards and fallbacks", async () => {
    mockBaseUrl = "https://staging.zyxacademy.com";
    const request = () => new NextRequest(
      "http://127.0.0.1:3001/api/entry-redirect?returnTo=%2Fen",
      { headers: { "x-forwarded-host": "evil.example" } },
    );
    for (const target of ["/admin", "/tutor", "/dashboard"] as const) {
      mockSession = { user: { id: "active-user" } };
      mockDestination = target;
      const response = await GET(request());
      expect(response.headers.get("location")).toBe(`${mockBaseUrl}${target}`);
      expect(response.cookies.get(DASHBOARD_ENTRY_COOKIE_NAME)?.secure).toBe(true);
    }
    mockSession = null;
    expect((await GET(request())).headers.get("location")).toBe(`${mockBaseUrl}/en`);
    mockSessionError = new Error("DB_UNAVAILABLE");
    expect((await GET(request())).headers.get("location")).toBe(`${mockBaseUrl}/en`);
  });
});
