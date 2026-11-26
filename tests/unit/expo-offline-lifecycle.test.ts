import { describe, expect, test } from "bun:test";
import { createOfflineMetadataLifecycle, visibleCourseMetadata } from "../../apps/mobile-native/offline/lifecycle";
import type { NativeOfflineMetadataSnapshot } from "../../apps/mobile-native/offline/metadata-store";
import { NativeOfflineSyncError } from "../../apps/mobile-native/offline/sync-client";

const current = 1_780_000_000_000;
const active = { foreground: true, online: true, verified: true, expiresAt: current + 2_000_000 };
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function snapshot(): NativeOfflineMetadataSnapshot {
  return {
    cursor: "1", activeCheckIntervalMs: 45_000, knownCourseIds: ["course-1", "course-2"],
    courses: [{ id: "course-1", title: "Fisika", leaseExpiresAt: current + 90_000, manifestCheckedAt: current,
      manifestLeaseExpiresAt: current + 70_000, materials: [{ id: "reading", kind: "article", courseId: "course-1",
        title: "Gerak lurus", key: '["article","course-1","reading"]', chapterIds: ["chapter"], revision: "r-1", updatedAt: current, estimatedBytes: 100 }] },
    { id: "course-2", title: "Kimia", leaseExpiresAt: current + 90_000, materials: [] }],
  };
}

function harness() {
  let time = current;
  let cached: NativeOfflineMetadataSnapshot | null = snapshot();
  let synchronize: (publishAccess: (stored: NativeOfflineMetadataSnapshot | null) => void) => Promise<void> = async () => {};
  const timers = new Map<() => void, number>();
  const commands: string[][] = [];
  let revokedEvents = 0;
  let cancellations = 0;
  const lifecycle = createOfflineMetadataLifecycle({
    read: async () => cached,
    async sync(courseIds, publishAccess) { commands.push([...courseIds]); await synchronize(publishAccess); },
    cancelSync() { cancellations++; },
    onRevoked() { revokedEvents++; },
    now: () => time,
    schedule(callback, delay) {
      timers.set(callback, time + delay);
      return () => { timers.delete(callback); };
    },
  });
  return {
    lifecycle, commands,
    setCached(value: NativeOfflineMetadataSnapshot | null) { cached = value; },
    setSync(sync: typeof synchronize) { synchronize = sync; },
    getRevokedEvents: () => revokedEvents,
    getCancellations: () => cancellations,
    async until(delta: number) {
      time = current + delta;
      for (const [callback, deadline] of [...timers]) {
        if (deadline > time || !timers.delete(callback)) continue;
        callback();
      }
      await flush();
    },
  };
}

describe("Expo offline metadata lifecycle", () => {
  test("scoped consumers share selection, resume, reconnect and the stored active policy interval", async () => {
    const { lifecycle, commands, until } = harness();
    lifecycle.setEnvironment(active);
    const closeFirst = lifecycle.register(["course-1"]);
    const closeSecond = lifecycle.register(["course-2"]);
    await flush();
    expect(commands).toEqual([["course-2", "course-1"]]);
    expect(lifecycle.getSnapshot().status).toBe("ready");

    await until(44_999);
    expect(commands).toHaveLength(1);
    await until(45_000);
    expect(commands).toHaveLength(2);

    lifecycle.setEnvironment({ ...active, online: false });
    await flush();
    expect(lifecycle.getSnapshot().status).toBe("offline");
    expect(commands).toHaveLength(2);
    lifecycle.setEnvironment({ ...active, foreground: false });
    await until(100_000);
    expect(commands).toHaveLength(2);

    lifecycle.setEnvironment(active);
    await flush();
    expect(commands).toHaveLength(3);
    closeSecond();
    await flush();
    expect(commands.at(-1)).toEqual(["course-1"]);
    closeFirst();
    expect(lifecycle.getSnapshot()).toEqual({ status: "inactive", snapshot: null });
    lifecycle.dispose();
  });

  test("filters out unselected titles and expires materials, course labels and the session while disconnected", async () => {
    const { lifecycle, until, commands } = harness();
    lifecycle.setEnvironment({ ...active, online: false, expiresAt: current + 100_000 });
    lifecycle.register(["course-1"]);
    await flush();
    const projection = () => visibleCourseMetadata(lifecycle.getSnapshot().snapshot, current, new Set(["course-1"]));
    expect(projection()).toMatchObject({ knownCourseIds: ["course-1"], courses: [{ title: "Fisika", materials: [{ id: "reading" }] }] });
    await until(70_000);
    expect(projection()?.courses).toMatchObject([{ title: "Fisika", materials: [] }]);
    await until(90_000);
    expect(projection()?.courses).toEqual([]);
    await until(100_000);
    expect(lifecycle.getSnapshot()).toEqual({ status: "inactive", snapshot: null });
    expect(commands).toEqual([]);
    lifecycle.dispose();
  });

  test("ignores a previous sync result and disk cache after revocation until a fresh check succeeds", async () => {
    const { lifecycle, setSync, setCached, getCancellations, getRevokedEvents } = harness();
    const pending = Promise.withResolvers<void>();
    let publishAccess: ((snapshot: NativeOfflineMetadataSnapshot | null) => void) | undefined;
    setSync(publish => { publishAccess = publish; return pending.promise; });
    lifecycle.setEnvironment(active);
    lifecycle.register(["course-1"]);
    await flush();
    lifecycle.markRevoked();
    expect(lifecycle.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
    publishAccess?.(snapshot());
    expect(lifecycle.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
    pending.resolve();
    await flush();
    expect(lifecycle.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
    expect(getCancellations()).toBe(1);

    setSync(async () => { throw new NativeOfflineSyncError("revoked", 403); });
    await lifecycle.retry();
    expect(getRevokedEvents()).toBe(1);
    expect(lifecycle.getSnapshot()).toEqual({ status: "revoked", snapshot: null });
    setCached(null);
    setSync(async () => {});
    await lifecycle.retry();
    expect(lifecycle.getSnapshot()).toEqual({ status: "ready", snapshot: null });
    lifecycle.dispose();
  });

  test("foreground, connection and verification loss cancel in-flight metadata and fence late results", async () => {
    for (const interrupted of [{ foreground: false }, { online: false }, { verified: false }]) {
      const { lifecycle, commands, setSync, getCancellations } = harness();
      const pending = Promise.withResolvers<void>();
      let publishAccess: ((stored: NativeOfflineMetadataSnapshot | null) => void) | undefined;
      setSync(publish => { publishAccess = publish; return pending.promise; });
      lifecycle.setEnvironment(active);
      lifecycle.register(["course-1"]);
      await flush();
      lifecycle.setEnvironment({ ...active, ...interrupted });
      expect(getCancellations()).toBe(1);
      const before = lifecycle.getSnapshot();
      publishAccess?.({ ...snapshot(), cursor: "stale" });
      pending.resolve();
      await flush();
      expect(lifecycle.getSnapshot()).toEqual(before);
      expect(commands).toHaveLength(1);
      setSync(async publish => { publish({ ...snapshot(), cursor: "fresh" }); });
      lifecycle.setEnvironment(active);
      await flush();
      expect(commands).toHaveLength(2);
      expect(lifecycle.getSnapshot().status).toBe("ready");
      lifecycle.dispose();
    }
  });

  test("session expiry cancels a pending check before it can publish metadata", async () => {
    const { lifecycle, setSync, getCancellations, until } = harness();
    const pending = Promise.withResolvers<void>();
    setSync(() => pending.promise);
    lifecycle.setEnvironment({ ...active, expiresAt: current + 10_000 });
    lifecycle.register(["course-1"]);
    await flush();
    await until(10_000);
    expect(getCancellations()).toBe(1);
    expect(lifecycle.getSnapshot()).toEqual({ status: "inactive", snapshot: null });
    pending.resolve();
    await flush();
    lifecycle.dispose();
  });

  test("keeps course titles hidden while revalidating and clamps poll intervals", async () => {
    const { lifecycle, commands, setCached, until } = harness();
    setCached({ ...snapshot(), activeCheckIntervalMs: 1 });
    lifecycle.setEnvironment(active);
    lifecycle.register(["course-1"]);
    await flush();
    await until(29_999);
    expect(commands).toHaveLength(1);
    await until(30_000);
    expect(commands).toHaveLength(2);
    lifecycle.setEnvironment({ ...active, verified: false });
    expect(lifecycle.getSnapshot()).toEqual({ status: "inactive", snapshot: null });
    await until(120_000);
    expect(commands).toHaveLength(2);
    lifecycle.dispose();
  });
});


test("the whole library discovers enrollments without a known course and stops on exit", async () => {
  const { lifecycle, commands } = harness();
  lifecycle.setEnvironment(active);
  const empty = lifecycle.register([]);
  await flush();
  expect(commands).toEqual([]);
  const close = lifecycle.register(null);
  await flush();
  expect(commands).toEqual([[]]);
  expect(lifecycle.getSnapshot().status).toBe("ready");
  close();
  expect(lifecycle.getSnapshot().status).toBe("inactive");
  empty();
  lifecycle.dispose();
});
