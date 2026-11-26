import { expect, test } from "bun:test";
import { createDeviceReminderController, type ReminderPermission } from "../../apps/mobile-native/device/reminder-controller";
import {
  isStudyReminderAccount,
  isStudyReminderPath,
} from "../../apps/mobile-native/device/reminder-eligibility";
import {
  normalizeStudyReminderConfig,
  parseJakartaSessionStart,
  planStudyReminders,
  planTutorReminders,
  type QuietHours,
  type ReminderPlan,
  type TutorReminderSession,
} from "../../apps/mobile-native/device/reminder-plans";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const origin = "https://staging.example.test";
const now = Date.parse("2026-11-22T01:00:00Z");
const quietOff: QuietHours = { enabled: false, startMinute: 22 * 60, endMinute: 7 * 60, timeZone: "Asia/Jakarta" };
const booking: TutorReminderSession = {
  bookingId: "booking-1", status: "scheduled", sessionDate: "2026-11-22", startTime: "10:00", courseTitle: "Geometri", tutorName: "Budi",
};
const config = normalizeStudyReminderConfig({ enabled: true, hour: 19, minute: 15 });

function fixture() {
  const records = new Map<string, { plan: ReminderPlan; signature: string }>();
  const delivered = new Set<string>();
  const store = new Map<string, string>();
  const writes: Array<[string, string]> = [];
  const requests: string[] = [];
  let permission: ReminderPermission = { status: "granted", canAskAgain: true };
  let quiet: QuietHours | null = quietOff;
  let sessions: TutorReminderSession[] = [booking];
  let deny = false;
  let afterSchedule: ((id: string) => void | Promise<void>) | undefined;
  const network = createNativeTransport({
    origin,
    async fetcher(url, init) {
      const path = new URL(url).pathname;
      const cookie = new Headers(init.headers).get("Cookie");
      requests.push(`${cookie} ${path}`);
      if (deny) return new Response(null, { status: 401 });
      if (path === "/api/notifications/quiet-hours" && quiet) return Response.json(quiet);
      if (path === "/api/student/upcoming-sessions") return Response.json({ sessions });
      throw new TypeError("Device is offline");
    },
  });
  const setAccount = (accountId = "learner-a", sessionId = "session-a") => network.setSession({
    origin, accountId, sessionId, readCookie: () => `session=${sessionId}`,
  });
  const controller = createDeviceReminderController({
    now: () => now,
    digest: async value => Bun.hash(value).toString(16),
    storage: {
      async read(key) { return store.get(key) ?? null; },
      async write(key, value) { store.set(key, value); },
    },
    device: {
      supported: true,
      async getPermission() { return permission; },
      async requestPermission(locale) {
        writes.push(["prompt", locale]);
        permission = { status: "granted", canAskAgain: true };
        return permission;
      },
      async scheduled() {
        return [...records].map(([identifier, { signature }]) => ({ identifier, signature }));
      },
      async delivered() { return [...delivered]; },
      async schedule(identifier, plan, signature) {
        writes.push(["schedule", identifier]);
        records.set(identifier, { plan, signature });
        await afterSchedule?.(identifier);
      },
      async cancel(identifier) { writes.push(["cancel", identifier]); records.delete(identifier); },
      async dismiss(identifier) { writes.push(["dismiss", identifier]); delivered.delete(identifier); },
    },
  });
  return {
    controller, setAccount, network, writes, records, delivered, requests, store,
    setPermission: (next: ReminderPermission) => { permission = next; },
    setQuiet: (next: QuietHours | null) => { quiet = next; },
    setSessions: (next: TutorReminderSession[]) => { sessions = next; },
    unauthorized: () => { deny = true; },
    onSchedule: (callback: typeof afterSchedule) => { afterSchedule = callback; },
  };
}

test("study reminder scheduling requires a Student path and verified Student role", () => {
  for (const path of ["/dashboard", "/courses/physics", "/settings/notifications", "/discussions"]) {
    expect(isStudyReminderPath(path)).toBe(true);
  }
  for (const path of ["/admin/settings", "/tutor/schedule", "/internal/reminders", "/gallery/separator", "/dashboarding", "/"]) {
    expect(isStudyReminderPath(path)).toBe(false);
  }
  const account = { accountId: "learner-a", sessionId: "session-a", locale: "en" as const };
  expect(isStudyReminderAccount(null)).toBe(false);
  expect(isStudyReminderAccount({ ...account, dashboard: "/dashboard", roles: ["murid"] })).toBe(true);
  expect(isStudyReminderAccount({ ...account, dashboard: "/admin", roles: ["admin", "murid"] })).toBe(false);
  expect(isStudyReminderAccount({ ...account, dashboard: "/tutor", roles: ["tutor", "murid"] })).toBe(false);
});

test("uses the Capacitor daily and weekly defaults and shifts overnight in the device wall clock", () => {
  expect(normalizeStudyReminderConfig({ frequency: "weekly", weekdays: [7, 2, 2, 0], hour: -2, minute: 60, tutorLeadMinutes: 181 }))
    .toEqual({ enabled: false, frequency: "weekly", weekdays: [2, 7], hour: 19, minute: 0, tutorLeadMinutes: 30 });
  const monday = new Date(2026, 10, 23, 12).getTime();
  const quiet: QuietHours = { enabled: true, startMinute: 22 * 60, endMinute: 6 * 60, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  expect(planStudyReminders({ ...config, hour: 23 }, "en", quiet, monday)[0]?.trigger)
    .toEqual({ type: "daily", hour: 6, minute: 0 });
  expect(planStudyReminders({ ...config, frequency: "weekly", hour: 23, weekdays: [2] }, "id", quiet, monday)[0]?.trigger)
    .toEqual({ type: "weekly", weekday: 3, hour: 6, minute: 0 });
});

test("Jakarta tutor reminders respect quiet-window DST and never fire after the booking starts", () => {
  expect(parseJakartaSessionStart("2026-02-30", "12:00")).toBeNull();
  expect(parseJakartaSessionStart("2026-11-22", "10:00")?.toISOString()).toBe("2026-11-22T03:00:00.000Z");
  const dstBooking = { ...booking, sessionDate: "2026-03-08", startTime: "14:30" };
  const quiet: QuietHours = { enabled: true, startMinute: 60, endMinute: 150, timeZone: "America/New_York" };
  const before = Date.parse("2026-03-08T05:00:00Z");
  const plans = planTutorReminders([dstBooking], 60, "en", quiet, before);
  expect(plans[0]?.trigger).toEqual({ type: "date", time: Date.parse("2026-03-08T07:00:00Z") });
  expect(plans[0]?.body).toContain("30 minutes (14:30 WIB)");
  expect(planTutorReminders([dstBooking], 60, "en", { ...quiet, endMinute: 220 }, before)).toEqual([]);
});

test("checks permission silently until explicitly asked and replaces weekly timing without duplicates", async () => {
  const f = fixture();
  const session = f.setAccount();
  const denied = { status: "prompt", canAskAgain: true } as const;
  f.setPermission(denied);
  expect(await f.controller.updateSettings(session, config, "en")).toEqual({ status: "permission-required", permission: denied });
  expect(f.writes).toEqual([]);
  expect(f.requests).toEqual([]);
  expect((await f.controller.loadSettings(session))?.enabled).toBe(false);
  expect(await f.controller.requestPermission(session, "en")).toMatchObject({ status: "granted" });
  expect(f.writes).toEqual([["prompt", "en"]]);

  expect(await f.controller.updateSettings(session, config, "en")).toMatchObject({ status: "synced", cancelled: [] });
  expect([...f.records.values()][0]?.plan).toMatchObject({ title: "Time to study", trigger: { type: "daily", hour: 19, minute: 15 } });
  expect(await f.controller.syncStudy(session, "en")).toEqual({ status: "synced", scheduled: [], cancelled: [] });
  expect(await f.controller.updateSettings(session, { ...config, frequency: "weekly", weekdays: [2, 5] }, "id"))
    .toMatchObject({ status: "synced" });
  expect([...f.records.values()].map(({ plan }) => plan.trigger)).toEqual([
    { type: "weekly", weekday: 2, hour: 19, minute: 15 },
    { type: "weekly", weekday: 5, hour: 19, minute: 15 },
  ]);
  expect(await f.controller.updateSettings(session, { ...config, enabled: false }, "id"))
    .toMatchObject({ status: "synced", scheduled: [] });
  expect(f.records.size).toBe(0);
  expect(f.writes.filter(([kind]) => kind === "prompt")).toHaveLength(1);
});

test("reconciles complete tutor sessions and lead time and reuses cached quiet preferences offline", async () => {
  const f = fixture();
  const session = f.setAccount();
  f.setQuiet({ ...quietOff, enabled: true, startMinute: 9 * 60, endMinute: 9 * 60 + 45 });
  await f.controller.refreshTutorSessions(session, "id");
  const initialId = [...f.records.keys()][0];
  expect(f.records.get(initialId)?.plan.trigger).toEqual({ type: "date", time: Date.parse("2026-11-22T02:45:00Z") });
  f.setQuiet(null);
  expect(await f.controller.refreshTutorSessions(session, "id")).toEqual({ status: "synced", scheduled: [], cancelled: [] });
  expect(await f.controller.updateSettings(session, { ...config, enabled: false, tutorLeadMinutes: 90 }, "id"))
    .toMatchObject({ status: "synced" });
  expect(await f.controller.refreshTutorSessions(session, "en"))
    .toEqual({ status: "synced", scheduled: [initialId], cancelled: [initialId] });
  expect(f.records.get(initialId)?.plan.trigger).toEqual({ type: "date", time: Date.parse("2026-11-22T01:30:00Z") });
  f.setSessions([]);
  expect(await f.controller.refreshTutorSessions(session, "en")).toEqual({ status: "synced", scheduled: [], cancelled: [initialId] });
  expect(f.requests[0]).toBe("session=session-a /api/student/upcoming-sessions");
});

test("retries ambiguous scheduling callbacks without scheduling additional copies", async () => {
  const f = fixture();
  const session = f.setAccount();
  let attempts = 0;
  f.onSchedule(() => {
    if (++attempts === 2) throw new Error("Native response lost after persisting");
  });
  expect(await f.controller.updateSettings(session, { ...config, frequency: "weekly", weekdays: [2, 5] }, "en"))
    .toEqual({ status: "retry" });
  expect(f.records.size).toBe(2);
  expect(await f.controller.syncStudy(session, "en")).toEqual({ status: "synced", scheduled: [], cancelled: [] });
  expect(attempts).toBe(2);
});

test("discards late scheduled work during logout and isolates the next account without touching unrelated alerts", async () => {
  const f = fixture();
  const session = f.setAccount();
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<void>();
  f.onSchedule(async () => { started.resolve(); await response.promise; });
  const schedule = f.controller.updateSettings(session, config, "id");
  await started.promise;
  const oldId = [...f.records.keys()][0];
  f.delivered.add(oldId);
  f.delivered.add("unrelated-alert");
  f.network.clearSession();
  const purge = f.controller.clearSession(session.scope);
  response.resolve();
  expect(await schedule).toEqual({ status: "stale" });
  await purge;
  expect(f.records.has(oldId)).toBe(false);
  expect([...f.delivered]).toEqual(["unrelated-alert"]);

  const second = f.setAccount("learner-b", "session-b");
  expect((await f.controller.loadSettings(second))?.enabled).toBe(false);
  f.onSchedule(undefined);
  await f.controller.updateSettings(second, config, "id");
  await f.controller.clearSession(session.scope);
  expect(f.records.size).toBe(1);
  expect([...f.records.keys()][0]).not.toBe(oldId);
});

test("explicit server deauthorization cancels local work even with cached preferences", async () => {
  const f = fixture();
  const session = f.setAccount();
  await f.controller.updateSettings(session, config, "id");
  await f.controller.refreshTutorSessions(session, "id");
  expect(f.records.size).toBe(2);
  f.unauthorized();
  expect(await f.controller.syncStudy(session, "id")).toEqual({ status: "stale" });
  expect(f.records.size).toBe(0);
});

test("session activation removes remnants from a previous device session while keeping account settings", async () => {
  const f = fixture();
  const first = f.setAccount();
  await f.controller.updateSettings(first, config, "id");
  const firstId = [...f.records.keys()][0];
  f.delivered.add(firstId);
  f.delivered.add("unrelated-alert");
  const second = f.setAccount("learner-a", "session-b");
  await f.controller.clearOtherSessions(second);
  expect(f.records.size).toBe(0);
  expect([...f.delivered]).toEqual(["unrelated-alert"]);
  expect(await f.controller.loadSettings(second)).toEqual(config);
  expect(await f.controller.syncStudy(second, "id")).toMatchObject({ status: "synced" });
  expect([...f.records.keys()][0]).not.toBe(firstId);
});
