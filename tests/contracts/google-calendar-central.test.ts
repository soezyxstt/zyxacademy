import { expect, test } from "bun:test";
import { CENTRAL_CALENDAR_ID, centralCalendarConfigured } from "@/lib/google-calendar/central";
import { reconcileCalendar } from "@/lib/google-calendar/transport";

const credentials = { GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-secret", GOOGLE_REFRESH_TOKEN: "fixture-refresh" };

test("the shared host credentials enable central sync without another variable", () => {
  expect(centralCalendarConfigured(credentials)).toBe(true);
  expect(CENTRAL_CALENDAR_ID).toBe("primary");
});

test("missing or blank shared credentials leave central sync unavailable", () => {
  for (const key of Object.keys(credentials)) {
    expect(centralCalendarConfigured({ ...credentials, [key]: undefined })).toBe(false);
    expect(centralCalendarConfigured({ ...credentials, [key]: "  " })).toBe(false);
  }
});

test("central reconciliation addresses the token owner's primary calendar", async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = ((url: string | URL | Request) => {
    requests.push(new URL(String(url)));
    return Promise.resolve(Response.json({ items: [] }));
  }) as typeof fetch;
  try {
    await reconcileCalendar("fixture-access-token", CENTRAL_CALENDAR_ID, "fixture-owner", []);
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/calendar/v3/calendars/primary/events");
  } finally { globalThis.fetch = original; }
});
