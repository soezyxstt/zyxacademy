import { afterEach, describe, expect, test } from "bun:test";
import { calendarEventId, reconcileCalendar, CalendarApiError } from "@/lib/google-calendar/transport";
import { hasCalendarScope } from "@/lib/google-calendar/shared";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const now = new Date("2026-11-20T00:00:00Z");
const entry = { key: "booking:one", summary: "Tutorial", description: "Zyx", start: new Date("2026-11-21T03:00:00Z"), end: new Date("2026-11-21T04:30:00Z") };
function mock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(new URL(String(url)), init))) as typeof fetch;
}
describe("Google Calendar reconciliation", () => {
  test("recognizes comma and space scopes without accepting partial grants", () => {
    expect(hasCalendarScope("openid,https://www.googleapis.com/auth/calendar.events")).toBe(true);
    expect(hasCalendarScope("openid https://www.googleapis.com/auth/calendar.events")).toBe(true);
    expect(hasCalendarScope("https://www.googleapis.com/auth/calendar.events.readonly")).toBe(false);
  });
  test("uses stable scoped IDs, patches changed schedules, removes only stale managed events after pagination", async () => {
    const id = calendarEventId("owner:booking:one");
    const calls: Array<{ method: string; url: URL; body?: any }> = [];
    mock((url, init) => {
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === "GET") return Response.json(url.searchParams.has("pageToken") ? { items: [{ id: "stale" }] } : { items: [{ id }], nextPageToken: "next" });
      return new Response(null, { status: 204 });
    });
    await reconcileCalendar("secret", "user@example.com", "owner", [entry], now);
    expect(calls.filter(c => c.method === "GET")).toHaveLength(2);
    expect(calls[0].url.searchParams.get("privateExtendedProperty")).toBe("zyxOwner=owner");
    expect(calls.find(c => c.method === "PATCH")?.body.start.dateTime).toBe(entry.start.toISOString());
    expect(calls.find(c => c.method === "DELETE")?.url.pathname.endsWith("/stale")).toBe(true);
    expect(calendarEventId("other:booking:one")).not.toBe(id);
  });
  test("recovers an ambiguous previous insert without creating another event", async () => {
    const calls: string[] = [];
    mock((_url, init) => {
      calls.push(init!.method!);
      if (init?.method === "GET") return Response.json({ items: [] });
      return new Response(null, { status: init?.method === "POST" ? 409 : 204 });
    });
    await reconcileCalendar("secret", "primary", "owner", [entry], now);
    expect(calls).toEqual(["GET", "POST", "PATCH"]);
  });
  test("does not delete stale events when an upsert fails", async () => {
    const calls: string[] = [];
    mock((_url, init) => {
      calls.push(init!.method!);
      return init?.method === "GET" ? Response.json({ items: [{ id: "stale" }] }) : new Response(null, { status: 503 });
    });
    await expect(reconcileCalendar("secret", "primary", "owner", [entry], now)).rejects.toBeInstanceOf(CalendarApiError);
    expect(calls).not.toContain("DELETE");
  });
  test("keeps past events and treats an already deleted stale event as success", async () => {
    const calls: string[] = [];
    mock((_url, init) => {
      calls.push(init!.method!);
      return init?.method === "GET" ? Response.json({ items: [{ id: "cancelled" }] }) : new Response(null, { status: 410 });
    });
    await reconcileCalendar("secret", "primary", "owner", [{ ...entry, start: new Date("2020-01-01"), end: new Date("2020-01-02") }], now);
    expect(calls).toEqual(["GET", "DELETE"]);
  });
});

test("republishing a deleted event confirms its stable ID during conflict recovery", async () => {
  const bodies: Array<{ status: string }> = [];
  mock((_url, init) => {
    if (init?.method === "GET") return Response.json({ items: [] });
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: init?.method === "POST" ? 409 : 204 });
  });
  await reconcileCalendar("fixture", "primary", "owner", [entry], now);
  expect(bodies.map(body => body.status)).toEqual(["confirmed", "confirmed"]);
});

test("403 quota reasons remain retryable while denied permissions require reconnection", async () => {
  for (const reason of ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "insufficientPermissions"]) {
    mock(() => Response.json({ error: { errors: [{ reason }], message: "provider details must not be displayed" } }, { status: 403 }));
    try {
      await reconcileCalendar("fixture", "primary", "owner", [], now);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarApiError);
      const failure = error as CalendarApiError;
      expect(failure.reasons).toEqual([reason]);
      expect(failure.requiresReconnect).toBe(reason === "insufficientPermissions");
      expect(failure.message).not.toContain("provider details");
    }
  }
});
