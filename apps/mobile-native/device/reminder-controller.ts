import type { NativeSessionScope, NativeSessionTransport } from "../network/transport";
import { LOCAL_REMINDER_PREFIX, localReminderSessionPrefix } from "./notification-response-identity";
import {
  normalizeStudyReminderConfig,
  parseQuietHours,
  planStudyReminders,
  planTutorReminders,
  type QuietHours,
  type ReminderKind,
  type ReminderLocale,
  type ReminderPlan,
  type StudyReminderConfig,
  type TutorReminderSession,
} from "./reminder-plans";

export type ReminderSession = Pick<NativeSessionTransport, "scope" | "isCurrent" | "request">;
export type ReminderPermission = { status: "granted" | "prompt" | "denied" | "unsupported"; canAskAgain: boolean };
export type ReminderOutcome =
  | { status: "synced"; scheduled: string[]; cancelled: string[] }
  | { status: "permission-required"; permission: ReminderPermission }
  | { status: "stale" | "unavailable" | "retry" };

type ReminderDevice = {
  supported: boolean;
  getPermission(): Promise<ReminderPermission>;
  requestPermission(locale: ReminderLocale): Promise<ReminderPermission>;
  scheduled(): Promise<readonly { identifier: string; signature: string | null }[]>;
  delivered(): Promise<readonly string[]>;
  schedule(identifier: string, plan: ReminderPlan, signature: string, locale: ReminderLocale): Promise<void>;
  cancel(identifier: string): Promise<void>;
  dismiss(identifier: string): Promise<void>;
};

type ReminderStorage = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
};

const requestTimeoutMs = 4_000;
const unsupported: ReminderPermission = { status: "unsupported", canAskAgain: false };
const revoked = Symbol("reminder-session-revoked");

function sessionRows(payload: unknown): TutorReminderSession[] | null {
  if (!payload || typeof payload !== "object" || !("sessions" in payload) || !Array.isArray(payload.sessions)) return null;
  const rows: TutorReminderSession[] = [];
  for (const row of payload.sessions) {
    if (!row || typeof row !== "object" || typeof row.bookingId !== "string" || !/^[\w-]{1,256}$/.test(row.bookingId)
      || typeof row.status !== "string" || (row.sessionDate !== null && typeof row.sessionDate !== "string")
      || (row.startTime !== null && typeof row.startTime !== "string")) return null;
    rows.push({
      bookingId: row.bookingId, status: row.status, sessionDate: row.sessionDate, startTime: row.startTime,
      courseTitle: typeof row.courseTitle === "string" ? row.courseTitle : null,
      tutorName: typeof row.tutorName === "string" ? row.tutorName : null,
    });
  }
  return rows;
}

async function getJson(session: ReminderSession, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await session.request(path, { signal: controller.signal });
    try {
      if (response.status === 401 || response.status === 403) throw revoked;
      return response.ok ? await response.json() : null;
    } finally {
      response.dispose();
    }
  } finally {
    clearTimeout(timer);
  }
}

export function createDeviceReminderController({ device, storage, digest, now = Date.now }: {
  device: ReminderDevice;
  storage: ReminderStorage;
  digest(value: string): Promise<string>;
  now?: () => number;
}) {
  let queue = Promise.resolve<unknown>(undefined);
  const accountKey = (scope: NativeSessionScope) => digest(JSON.stringify([scope.origin, scope.accountId]));
  const sessionPrefix = (scope: NativeSessionScope) => localReminderSessionPrefix(scope, digest);

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  }

  async function readStored<T>(key: string, parse: (value: unknown) => T): Promise<T> {
    const value = await storage.read(key);
    try {
      return parse(value === null ? null : JSON.parse(value));
    } catch {
      return parse(null);
    }
  }

  async function configFor(scope: NativeSessionScope): Promise<StudyReminderConfig> {
    return readStored(`zyx-reminder-settings.${await accountKey(scope)}`, normalizeStudyReminderConfig);
  }

  async function quietFor(session: ReminderSession): Promise<QuietHours | null> {
    const key = `zyx-reminder-quiet.${await accountKey(session.scope)}`;
    let current: QuietHours | null = null;
    try {
      current = parseQuietHours(await getJson(session, "/api/notifications/quiet-hours"));
    } catch (error) {
      if (error === revoked) throw error;
    }
    if (current && session.isCurrent()) {
      await storage.write(key, JSON.stringify(current)).catch(() => {});
      return current;
    }
    return readStored(key, parseQuietHours).catch(() => null);
  }

  async function removeMatching(match: (identifier: string) => boolean, allowed = () => true): Promise<void> {
    async function remove(
      list: Promise<readonly string[]>, removeOne: (identifier: string) => Promise<void>,
    ) {
      const identifiers = await list;
      return Promise.allSettled(identifiers.filter(match).map(async identifier => {
        if (allowed()) await removeOne(identifier);
      }));
    }
    const pending = await Promise.allSettled([
      remove(device.scheduled().then(items => items.map(item => item.identifier)), device.cancel),
    ]);
    const presented = await Promise.allSettled([
      remove(device.delivered(), device.dismiss),
    ]);
    if ([...pending, ...presented].some(result => result.status === "rejected" || result.value.some(item => item.status === "rejected"))) {
      throw new Error("Could not remove every scheduled reminder.");
    }
  }

  async function reconcile(
    session: ReminderSession, kind: ReminderKind, plans: readonly ReminderPlan[], locale: ReminderLocale,
  ): Promise<ReminderOutcome> {
    if (!session.isCurrent()) return { status: "stale" };
    const prefix = `${await sessionPrefix(session.scope)}${kind}.`;
    const desired = new Map(plans.map(plan => [prefix + plan.key, { plan, signature: JSON.stringify(plan) }]));
    const scheduled: string[] = [];
    const cancelled: string[] = [];
    const existing = await device.scheduled();
    for (const { identifier, signature } of existing) {
      if (!session.isCurrent()) return { status: "stale" };
      if (!identifier.startsWith(prefix)) continue;
      if (desired.get(identifier)?.signature === signature) {
        desired.delete(identifier);
      } else {
        await device.cancel(identifier);
        cancelled.push(identifier);
      }
    }
    for (const [identifier, { plan, signature }] of desired) {
      if (!session.isCurrent()) return { status: "stale" };
      await device.schedule(identifier, plan, signature, locale);
      if (!session.isCurrent()) {
        await device.cancel(identifier);
        return { status: "stale" };
      }
      scheduled.push(identifier);
    }
    return session.isCurrent() ? { status: "synced", scheduled, cancelled } : { status: "stale" };
  }

  function run(session: ReminderSession, operation: () => Promise<ReminderOutcome>): Promise<ReminderOutcome> {
    return serialize(async () => {
      if (!device.supported) return { status: "unavailable" };
      if (!session.isCurrent()) return { status: "stale" };
      try {
        const outcome = await operation();
        return session.isCurrent() ? outcome : { status: "stale" };
      } catch (error) {
        if (error === revoked) {
          const prefix = await sessionPrefix(session.scope);
          await removeMatching(id => id.startsWith(prefix)).catch(() => {});
          return { status: "stale" };
        }
        return { status: session.isCurrent() ? "retry" : "stale" };
      }
    });
  }

  async function study(
    session: ReminderSession, config: StudyReminderConfig, locale: ReminderLocale, persist: boolean,
  ): Promise<ReminderOutcome> {
    if (config.enabled) {
      const permission = await device.getPermission();
      if (permission.status !== "granted") {
        await reconcile(session, "study_reminder", [], locale);
        return { status: "permission-required", permission };
      }
    }
    const quiet = config.enabled ? await quietFor(session) : null;
    if (!session.isCurrent()) return { status: "stale" };
    if (persist) {
      const key = `zyx-reminder-settings.${await accountKey(session.scope)}`;
      if (!session.isCurrent()) return { status: "stale" };
      await storage.write(key, JSON.stringify(config));
    }
    return reconcile(session, "study_reminder", planStudyReminders(config, locale, quiet, now()), locale);
  }

  return {
    isSupported: device.supported,
    loadSettings(session: ReminderSession): Promise<StudyReminderConfig | null> {
      return serialize(async () => {
        if (!device.supported || !session.isCurrent()) return null;
        const config = await configFor(session.scope).catch(() => normalizeStudyReminderConfig(null));
        return session.isCurrent() ? config : null;
      });
    },
    async getPermission(): Promise<ReminderPermission> {
      return device.supported ? device.getPermission().catch(() => unsupported) : unsupported;
    },
    requestPermission(session: ReminderSession, locale: ReminderLocale): Promise<ReminderPermission> {
      return serialize(async () => {
        if (!device.supported || !session.isCurrent()) return unsupported;
        try {
          const current = await device.getPermission();
          if (!session.isCurrent()) return unsupported;
          const result = current.status !== "granted" && current.canAskAgain
            ? await device.requestPermission(locale) : current;
          return session.isCurrent() ? result : unsupported;
        } catch {
          return unsupported;
        }
      });
    },
    updateSettings(session: ReminderSession, config: StudyReminderConfig, locale: ReminderLocale) {
      return run(session, () => study(session, normalizeStudyReminderConfig(config), locale, true));
    },
    syncStudy(session: ReminderSession, locale: ReminderLocale) {
      return run(session, async () => study(session, await configFor(session.scope), locale, false));
    },
    refreshTutorSessions(session: ReminderSession, locale: ReminderLocale) {
      return run(session, async () => {
        const permission = await device.getPermission();
        if (permission.status !== "granted") {
          await reconcile(session, "tutor_reminder", [], locale);
          return { status: "permission-required", permission };
        }
        const sessions = sessionRows(await getJson(session, "/api/student/upcoming-sessions"));
        if (!sessions) return { status: "retry" };
        const config = await configFor(session.scope);
        const quiet = await quietFor(session);
        return reconcile(session, "tutor_reminder", planTutorReminders(sessions, config.tutorLeadMinutes, locale, quiet, now()), locale);
      });
    },
    cancelTutor(session: ReminderSession, bookingId: string) {
      return run(session, async () => {
        const identifier = `${await sessionPrefix(session.scope)}tutor_reminder.${encodeURIComponent(bookingId)}`;
        await removeMatching(id => id === identifier, session.isCurrent);
        return { status: "synced", scheduled: [], cancelled: [identifier] };
      });
    },
    clearSession(scope: NativeSessionScope): Promise<void> {
      return serialize(async () => {
        if (!device.supported) return;
        const prefix = await sessionPrefix(scope);
        await removeMatching(id => id.startsWith(prefix));
      });
    },
    clearOtherSessions(session: ReminderSession | null): Promise<void> {
      return serialize(async () => {
        if (!device.supported || (session && !session.isCurrent())) return;
        const prefix = session ? await sessionPrefix(session.scope) : null;
        await removeMatching(id => id.startsWith(LOCAL_REMINDER_PREFIX) && (!prefix || !id.startsWith(prefix)),
          () => session === null || session.isCurrent());
      });
    },
  };
}
