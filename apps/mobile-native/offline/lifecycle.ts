import type { NativeOfflineMetadataSnapshot } from "./metadata-store";
import { NativeOfflineSyncError } from "./sync-client";
import { NATIVE_OFFLINE_COURSE_LIMIT } from "./sync-contract";

export type CourseMetadataState = {
  status: "inactive" | "loading" | "syncing" | "ready" | "offline" | "error" | "revoked";
  snapshot: NativeOfflineMetadataSnapshot | null;
};

export const inactiveCourseMetadata: CourseMetadataState = { status: "inactive", snapshot: null };
const DEFAULT_CHECK_INTERVAL_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

type Environment = { foreground: boolean; online: boolean; verified: boolean; expiresAt: number };
type Schedule = (callback: () => void, delay: number) => () => void;

const scheduleTimeout: Schedule = (callback, delay) => {
  const id = setTimeout(callback, delay);
  return () => clearTimeout(id);
};

export function visibleCourseMetadata(snapshot: NativeOfflineMetadataSnapshot | null, now: number, selected?: ReadonlySet<string>): NativeOfflineMetadataSnapshot | null {
  if (!snapshot) return null;
  const courses = snapshot.courses.filter(course => course.leaseExpiresAt > now && (!selected || selected.has(course.id))).map(course => {
    if (course.manifestLeaseExpiresAt !== undefined && course.manifestLeaseExpiresAt > now) return course;
    return { ...course, materials: [], manifestCheckedAt: undefined, manifestLeaseExpiresAt: undefined };
  });
  return { ...snapshot, courses, knownCourseIds: selected ? courses.map(course => course.id) : snapshot.knownCourseIds };
}

function checkInterval(snapshot: NativeOfflineMetadataSnapshot | null): number {
  const value = snapshot?.activeCheckIntervalMs;
  return typeof value === "number" && Number.isSafeInteger(value)
    ? Math.min(900_000, Math.max(30_000, value)) : DEFAULT_CHECK_INTERVAL_MS;
}

export function createOfflineMetadataLifecycle({ read, sync, cancelSync, onRevoked, now = Date.now, schedule = scheduleTimeout }: {
  read: () => Promise<NativeOfflineMetadataSnapshot | null>;
  sync: (courseIds: readonly string[], publishAccess: (snapshot: NativeOfflineMetadataSnapshot | null) => void) => Promise<unknown>;
  cancelSync: () => void;
  onRevoked?: () => void;
  now?: () => number;
  schedule?: Schedule;
}) {
  let environment: Environment = { foreground: false, online: true, verified: false, expiresAt: 0 };
  let state = inactiveCourseMetadata;
  let selection: readonly string[] = [];
  let observing = false;
  let flight: Promise<void> | undefined;
  let queued = false;
  let disposed = false;
  let revoked = false;
  let generation = 0;
  let stopPoll: (() => void) | undefined;
  let stopExpiry: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const registrations = new Map<object, readonly string[] | null>();

  const canRead = () => !disposed && environment.verified && environment.expiresAt > now() && observing;
  const canSync = () => canRead() && environment.foreground && environment.online;

  function publish(status: CourseMetadataState["status"], snapshot: NativeOfflineMetadataSnapshot | null = state.snapshot) {
    state = canRead() ? { status, snapshot: visibleCourseMetadata(snapshot, now()) } : inactiveCourseMetadata;
    for (const listener of listeners) listener();
  }

  function scheduleExpiry() {
    stopExpiry?.();
    if (!canRead()) return;
    const current = now();
    const leases = (state.snapshot?.courses ?? []).flatMap(course => [course.leaseExpiresAt, course.manifestLeaseExpiresAt ?? 0]);
    const next = Math.min(environment.expiresAt, ...leases.filter(lease => lease > current));
    stopExpiry = schedule(() => {
      publish(state.status);
      scheduleExpiry();
    }, Math.min(MAX_TIMEOUT_MS, Math.max(1, next - current)));
  }

  async function run() {
    do {
      queued = false;
      if (!canRead() || !environment.foreground) break;
      const attempt = generation;
      const isCurrent = () => canRead() && attempt === generation;
      try {
        if (!revoked && !state.snapshot) {
          publish("loading", null);
          const cached = await read();
          if (!isCurrent()) continue;
          publish(environment.online ? "loading" : "offline", cached);
        }
        if (!canSync()) {
          if (canRead() && !environment.online) publish(revoked ? "revoked" : "offline");
          continue;
        }
        publish("syncing");
        await sync(selection, snapshot => {
          if (!isCurrent()) return;
          revoked = false;
          publish(environment.online ? "syncing" : "offline", snapshot);
          scheduleExpiry();
        });
        if (!isCurrent()) continue;
        const cached = await read();
        if (isCurrent()) {
          revoked = false;
          publish(environment.online ? "ready" : "offline", cached);
        }
      } catch (error) {
        if (!isCurrent()) continue;
        if (error instanceof NativeOfflineSyncError && error.code === "revoked") {
          revoked = true;
          publish("revoked", null);
          onRevoked?.();
        } else if (!revoked) {
          // A failed manifest may follow a successful access purge. Read the scoped projection again.
          const cached = await read().catch(() => null);
          if (isCurrent()) publish(environment.online ? "error" : "offline", cached);
        } else publish("revoked", null);
      } finally {
        scheduleExpiry();
      }
    } while (queued);
  }

  function trigger(): Promise<void> {
    stopPoll?.();
    if (!canRead() || !environment.foreground) return Promise.resolve();
    queued = true;
    flight ??= Promise.resolve().then(run).finally(() => {
      flight = undefined;
      if (queued) void trigger();
      else if (canSync()) stopPoll = schedule(() => { void trigger(); }, checkInterval(state.snapshot));
    });
    return flight;
  }

  function updateSelection() {
    const subscribers = [...registrations.values()].reverse();
    const next = [...new Set(subscribers.flatMap(ids => ids ?? []))].slice(0, NATIVE_OFFLINE_COURSE_LIMIT);
    const active = next.length > 0 || subscribers.includes(null);
    if (active === observing && next.length === selection.length && next.every((id, index) => id === selection[index])) return;
    observing = active;
    selection = next;
    if (!observing) {
      publish("inactive", null);
      stopPoll?.();
      stopExpiry?.();
    } else {
      scheduleExpiry();
      void trigger();
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    register(courseIds: readonly string[] | null) {
      const registration = {};
      registrations.set(registration, courseIds);
      updateSelection();
      return () => {
        registrations.delete(registration);
        if (!disposed) updateSelection();
      };
    },
    setEnvironment(next: Environment) {
      const previous = environment;
      environment = next;
      scheduleExpiry();
      if (!canRead()) publish("inactive", null);
      if (canRead() && !next.online) publish(revoked ? "revoked" : "offline");
      if (!canSync()) stopPoll?.();
      if (canRead() && next.foreground && (!previous.verified || !previous.foreground || previous.online !== next.online)) void trigger();
    },
    retry: trigger,
    markRevoked() {
      generation++;
      queued = false;
      revoked = true;
      cancelSync();
      publish("revoked", null);
      scheduleExpiry();
    },
    dispose() {
      disposed = true;
      stopPoll?.();
      stopExpiry?.();
      cancelSync();
      listeners.clear();
      registrations.clear();
    },
  };
}
