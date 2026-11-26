import { afterEach, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN } from "@/apps/mobile-native/auth/session-api";
import { createNativeSessionController } from "@/apps/mobile-native/auth/session-controller";
import { createAssessmentDraftRepository, DISCUSSION_DRAFT_KEY, type AssessmentDraftDatabase } from "@/apps/mobile-native/features/student/assessment-draft-store";
import { createNativeTransport } from "@/apps/mobile-native/network/transport";

const valid = () => {};
const primary = { origin: "https://classroom.example", accountId: "learner-a", sessionId: "session-a", locale: "id" } as const;
const key = "assessment:quiz:class%2F1:attempt-1";
const cleanup: Array<() => void> = [];

function sqlite() {
  const directory = mkdtempSync(join(tmpdir(), "student-drafts-test-"));
  const file = join(directory, "drafts.db");
  const databases: Database[] = [];
  cleanup.push(() => {
    for (const db of databases) db.close(false);
    rmSync(directory, { recursive: true, force: true });
  });
  function open(): AssessmentDraftDatabase {
    const db = new Database(file);
    databases.push(db);
    return {
      async execAsync(statement) { db.exec(statement); },
      async runAsync(statement, ...values) { return db.query(statement).run(...values); },
      async getFirstAsync<T>(statement: string, ...values: string[]): Promise<T | null> {
        return db.query<T, string[]>(statement).get(...values);
      },
      async closeAsync() { db.close(false); },
    };
  }
  return { open, create: () => createAssessmentDraftRepository(async () => open()) };
}

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

test("retains only the matching course-attempt draft across database reopen and scopes locales", async () => {
  const disk = sqlite();
  const first = disk.create();
  const draft = JSON.stringify({ answers: { q1: 2 }, requestId: "attempt-retry" });
  await first.bind(primary, valid).drafts.set(key, draft);
  const reopened = disk.create();

  expect(await reopened.bind(primary, valid).drafts.get(key)).toBe(draft);
  const english = reopened.bind({ ...primary, locale: "en" }, valid).drafts;
  expect(await english.get(key)).toBeNull();
  await english.set(key, "separate language");
  await english.remove(key);
  expect(await reopened.bind(primary, valid).drafts.get(key)).toBe(draft);
  await expect(english.set("device:preference", "invalid")).rejects.toThrow("Invalid assessment draft key");
});

test("reconciles orphan account and session rows for the active origin while keeping another origin isolated", async () => {
  const disk = sqlite();
  const repository = disk.create();
  const otherOrigin = { ...primary, origin: "https://other.example" };
  await repository.bind(primary, valid).drafts.set(key, "old scope");
  await repository.bind(otherOrigin, valid).drafts.set(key, "other origin");
  const incoming = { ...primary, accountId: "learner-b", sessionId: "session-b" };
  const handle = repository.bind(incoming, valid);
  await handle.reconcile();
  expect(await handle.drafts.get(key)).toBeNull();
  expect(await repository.bind(primary, valid).drafts.get(key)).toBeNull();
  expect(await repository.bind(otherOrigin, valid).drafts.get(key)).toBe("other origin");

  await repository.bind(primary, valid).drafts.set(key, "old session for the same learner");
  const updated = repository.bind({ ...primary, sessionId: "session-c" }, valid);
  await updated.reconcile();
  expect(await updated.drafts.get(key)).toBeNull();
});

test("logout purges all locales after in-flight work and revocation blocks stale queued operations", async () => {
  const disk = sqlite();
  const database = disk.open();
  let beginRead!: () => void;
  let finishRead!: () => void;
  const reading = new Promise<void>(resolve => { beginRead = resolve; });
  const latency = new Promise<void>(resolve => { finishRead = resolve; });
  const repository = createAssessmentDraftRepository(async () => ({
    ...database,
    async getFirstAsync<T>(statement: string, ...values: string[]) {
      beginRead();
      await latency;
      return database.getFirstAsync<T>(statement, ...values);
    },
  }));
  let active = true;
  const checkActive = () => {
    if (!active) throw new Error("Session closed");
  };
  const old = repository.bind(primary, checkActive).drafts;
  await old.set(key, "before logout");
  await repository.bind({ ...primary, locale: "en" }, checkActive).drafts.set(key, "same session in English");
  const staleRead = old.get(key).catch(error => error);
  await reading;
  const staleWrite = old.set(key, "queued after read").catch(error => error);
  active = false;
  const purge = repository.purgeSession(primary);
  finishRead();

  expect((await staleRead as Error).message).toBe("Session closed");
  expect((await staleWrite as Error).message).toBe("Session closed");
  await purge;
  const reopened = disk.create();
  expect(await reopened.bind(primary, valid).drafts.get(key)).toBeNull();
  expect(await reopened.bind({ ...primary, locale: "en" }, valid).drafts.get(key)).toBeNull();
});

test("cold start purges every retired session locale on expiry or a server identity mismatch", async () => {
  const origin = NATIVE_STAGING_ORIGIN;
  const scope = { ...primary, origin };
  const now = 100_000;
  const cookie = `__Secure-better-auth.session_token=fixture.${"A".repeat(43)}%3D`;
  for (const expired of [true, false]) {
    const disk = sqlite();
    const repository = disk.create();
    const english = { ...scope, locale: "en" as const };
    await repository.bind(scope, valid).drafts.set(key, "Indonesian draft");
    await repository.bind(english, valid).drafts.set(key, "English draft");
    await repository.bind(primary, valid).drafts.set(key, "Different origin");
    let stored: string | null = JSON.stringify({ ...scope, cookie, status: "active", expiresAt: expired ? now : now + 60_000 });
    const fetcher = mock(async () => Response.json({ user: { id: "another-learner" }, session: {
      id: "another-session", userId: "another-learner", expiresAt: new Date(now + 60_000).toISOString(),
    } }));
    const controller = createNativeSessionController({
      origin, now: () => now,
      api: createNativeSessionApi(origin, fetcher),
      dataTransport: createNativeTransport({ origin, fetcher }),
      store: {
        read: async () => stored,
        write: async value => { stored = value; },
        remove: async () => { stored = null; },
      },
    });
    controller.subscribeBeforeLocalLogout(repository.purgeSession);
    await controller.refresh();

    expect(fetcher).toHaveBeenCalledTimes(expired ? 0 : 1);
    expect(controller.getSnapshot()).toMatchObject({ state: { status: "signed-out" }, transport: null });
    expect(stored).toBeNull();
    const reopened = disk.create();
    expect(await reopened.bind(scope, valid).drafts.get(key)).toBeNull();
    expect(await reopened.bind(english, valid).drafts.get(key)).toBeNull();
    expect(await reopened.bind(primary, valid).drafts.get(key)).toBe("Different origin");
  }
});

test("surfaces a database failure to the caller and retries connection initialization on the next operation", async () => {
  const disk = sqlite();
  let calls = 0;
  const repository = createAssessmentDraftRepository(async () => {
    if (++calls === 1) throw new Error("Storage unavailable");
    return disk.open();
  });
  const { drafts } = repository.bind(primary, valid);
  await expect(drafts.set(key, "first write")).rejects.toThrow("Storage unavailable");
  await drafts.set(key, "second write");
  expect(await drafts.get(key)).toBe("second write");
});


test("discussion drafts share the scoped database, serialize changes and purge on logout", async () => {
  const disk = sqlite();
  const repository = disk.create();
  const { drafts } = repository.bind(primary, valid);
  const concurrent = (value: string) => drafts.update!(DISCUSSION_DRAFT_KEY, raw => [raw, value].filter(Boolean).join(","));
  await Promise.all([concurrent("first"), concurrent("second")]);
  const reopened = disk.create();
  const exact = reopened.bind(primary, valid).drafts;
  expect(await exact.get(DISCUSSION_DRAFT_KEY)).toBe("first,second");
  const english = reopened.bind({ ...primary, locale: "en" }, valid).drafts;
  expect(await english.get(DISCUSSION_DRAFT_KEY)).toBeNull();
  await english.update!(DISCUSSION_DRAFT_KEY, () => "English");
  await reopened.purgeSession(primary);
  expect(await exact.get(DISCUSSION_DRAFT_KEY)).toBeNull();
  expect(await english.get(DISCUSSION_DRAFT_KEY)).toBeNull();
});
