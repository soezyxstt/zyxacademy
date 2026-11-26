import type { NativeSessionScope, NativeSessionTransport, createNativeTransport } from "../network/transport";
import { parseNativeLoginIntent, type NativeLoginIntent } from "./login-intent";
import {
  NativeSessionConnectionError,
  isSignedSessionCookie,
  readSignedSessionCookie,
  type SessionHeaders,
  type SessionIdentity,
  type createNativeSessionApi,
} from "./session-api";

type StoredSession = SessionIdentity & {
  origin: string;
  cookie: string;
  status: "active" | "revoking";
  loginIntent?: NativeLoginIntent;
};
type SessionStore = { read(): Promise<string | null>; write(value: string): Promise<void>; remove(): Promise<void> };
type BeforeLogout = (transport: NativeSessionTransport) => void | Promise<void>;
type BeforeLocalLogout = (scope: NativeSessionScope) => void | Promise<void>;
const PUSH_CLEANUP_PATH = "/api/notifications/register-token";

export type NativeSessionState =
  | { status: "loading" | "signed-out" }
  | { status: "unavailable"; offlineIdentity?: SessionIdentity }
  | { status: "logout-pending"; retry: boolean }
  | ({ status: "signed-in" } & SessionIdentity);

function decodeStoredSession(value: string | null, origin: string): StoredSession | null {
  if (!value) return null;
  try {
    const record = JSON.parse(value) as Partial<StoredSession> | null;
    if (record?.origin === origin && isSignedSessionCookie(record.cookie)
      && (record.status === "active" || record.status === "revoking")
      && typeof record.accountId === "string" && record.accountId.trim()
      && typeof record.sessionId === "string" && record.sessionId.trim()
      && typeof record.expiresAt === "number" && Number.isFinite(record.expiresAt)) {
      return { origin, cookie: record.cookie, status: record.status, accountId: record.accountId,
        sessionId: record.sessionId, expiresAt: record.expiresAt, loginIntent: parseNativeLoginIntent(record.loginIntent) };
    }
  } catch { /* Treat an unreadable record as signed out. */ }
  return null;
}

export function createNativeSessionController({ origin, store, api, dataTransport, now = Date.now }: {
  origin: string;
  store: SessionStore;
  api: ReturnType<typeof createNativeSessionApi>;
  dataTransport: ReturnType<typeof createNativeTransport>;
  now?: () => number;
}) {
  let record: StoredSession | null | undefined;
  let snapshot: {
    state: NativeSessionState;
    transport: NativeSessionTransport | null;
    revalidating: boolean;
    loginIntent?: NativeLoginIntent;
  } = {
    state: { status: "loading" }, transport: null, revalidating: false,
  };
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let validation: AbortController | null = null;
  let refreshOperation: Promise<void> | null = null;
  let logoutOperation: Promise<void> | null = null;
  const subscriptions = new Set<() => void>();
  const beforeLogout = new Set<BeforeLogout>();
  const beforeLocalLogout = new Set<BeforeLocalLogout>();

  function publish(
    state: NativeSessionState, transport: NativeSessionTransport | null = null,
    revalidating = false, loginIntent?: NativeLoginIntent,
  ) {
    snapshot = { state, transport, revalidating, ...(loginIntent && { loginIntent }) };
    for (const notify of subscriptions) notify();
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const operation = queue.then(work, work);
    queue = operation;
    return operation;
  }

  async function load() {
    if (record !== undefined) return record;
    const stored = await store.read();
    const parsed = decodeStoredSession(stored, origin);
    if (stored !== null && !parsed) await store.remove();
    record = parsed;
    return record;
  }

  async function purgeLocalSession({ origin, accountId, sessionId }: NativeSessionScope) {
    const results = await Promise.allSettled([...beforeLocalLogout].map(async handler => handler({ origin, accountId, sessionId })));
    if (results.some(result => result.status === "rejected")) throw new Error("Data sesi lokal belum dapat dihapus.");
  }

  async function clear(current?: StoredSession) {
    dataTransport.clearSession();
    if (current) await purgeLocalSession(current);
    await store.remove();
    record = null;
  }

  function publishVerified(identity: SessionIdentity) {
    const active = dataTransport.captureSession();
    const transport = active?.scope.sessionId === identity.sessionId && active.scope.accountId === identity.accountId
      ? active
      : dataTransport.setSession({
        origin,
        accountId: identity.accountId,
        sessionId: identity.sessionId,
        readCookie: scope => record?.status === "active" && record.expiresAt > now()
          && record.origin === scope.origin && record.sessionId === scope.sessionId && record.accountId === scope.accountId
          ? record.cookie : null,
      });
    publish({ status: "signed-in", ...identity }, transport, false, record?.loginIntent);
  }

  async function revoke(current: StoredSession, cleanPush = false) {
    dataTransport.clearSession();
    const pending = { ...current, status: "revoking", loginIntent: undefined } as const;
    // Keep the credential usable only for revocation after restarting offline.
    try {
      await store.write(JSON.stringify(pending));
    } catch {
      // If the record cannot be updated, try removing it before contacting the server.
      await store.remove().catch(() => {});
    }
    record = pending;
    if (cleanPush && beforeLogout.size) {
      const cleanup = dataTransport.setSession({
        origin,
        accountId: current.accountId,
        sessionId: current.sessionId,
        readCookie: () => current.expiresAt > now() ? current.cookie : null,
      });
      const cleanupTransport: NativeSessionTransport = {
        ...cleanup,
        async request(path, init) {
          if (path !== PUSH_CLEANUP_PATH || init?.method !== "DELETE") {
            throw new Error("Permintaan pembersihan sesi tidak didukung.");
          }
          return cleanup.request(path, init);
        },
      };
      await Promise.allSettled([...beforeLogout].map(async handler => handler(cleanupTransport)));
      dataTransport.clearSession();
    }
    const results = await Promise.allSettled([purgeLocalSession(current), api.revoke(pending.cookie)]);
    if (results.some(result => result.status === "rejected")) throw new Error("Sesi belum dapat dihapus.");
    await clear();
    publish({ status: "signed-out" });
  }

  function refresh() {
    if (logoutOperation) return logoutOperation;
    if (refreshOperation) return refreshOperation;
    const expectedRevision = revision;
    refreshOperation = enqueue(async () => {
      if (revision !== expectedRevision) return;
      try {
        const current = await load();
        if (revision !== expectedRevision) return;
        if (!current) {
          publish({ status: "signed-out" });
          return;
        }
        if (current.status === "revoking") {
          publish({ status: "logout-pending", retry: false });
          await revoke(current);
          return;
        }
        if (current.expiresAt <= now()) {
          await clear(current);
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }

        const controller = new AbortController();
        validation = controller;
        const identity = await api.read(current.cookie, controller.signal);
        if (revision !== expectedRevision) return;
        if (!identity || identity.accountId !== current.accountId || identity.sessionId !== current.sessionId
          || identity.expiresAt <= now()) {
          await clear(current);
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }
        if (identity.expiresAt !== current.expiresAt) {
          const updated = { ...current, expiresAt: identity.expiresAt };
          await store.write(JSON.stringify(updated));
          record = updated;
        }
        if (revision === expectedRevision) publishVerified(identity);
      } catch (error) {
        if (revision === expectedRevision) {
          dataTransport.clearSession();
          if (record?.status === "revoking") {
            publish({ status: "logout-pending", retry: true });
          } else if (error instanceof NativeSessionConnectionError && record?.status === "active" && record.expiresAt > now()) {
            const { accountId, sessionId, expiresAt } = record;
            publish({ status: "unavailable", offlineIdentity: { accountId, sessionId, expiresAt } });
          } else {
            publish({ status: "unavailable" });
          }
        }
      } finally {
        validation = null;
      }
    }).finally(() => { refreshOperation = null; });
    if (snapshot.state.status === "signed-in") publish(snapshot.state, snapshot.transport, true, snapshot.loginIntent);
    return refreshOperation;
  }

  async function acceptLogin(
    headers: SessionHeaders, expectedAccount: string, signal?: AbortSignal, intent?: NativeLoginIntent,
  ) {
    const cookie = readSignedSessionCookie(headers);
    if (!cookie || !expectedAccount.trim() || signal?.aborted || logoutOperation || snapshot.state.status !== "signed-out") {
      throw new Error("Sesi masuk belum tersedia.");
    }
    const expectedRevision = revision;
    return enqueue(async () => {
      const active = () => !signal?.aborted && revision === expectedRevision;
      if (!active() || await load()) throw new Error("Sesi masuk belum tersedia.");
      if (!active()) throw new Error("Sesi masuk belum tersedia.");
      const controller = new AbortController();
      validation = controller;
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        const identity = await api.read(cookie, controller.signal);
        if (!identity || identity.accountId !== expectedAccount || identity.expiresAt <= now()) {
          throw new Error("Identitas sesi masuk tidak valid.");
        }
        const current: StoredSession = { ...identity, origin, cookie, status: "active",
          loginIntent: parseNativeLoginIntent(intent) };
        // A verified token remains visible to the queue for revocation if acceptance is cancelled.
        record = current;
        if (!active()) throw new Error("Sesi masuk dibatalkan.");
        await store.write(JSON.stringify(current));
        if (!active()) throw new Error("Sesi masuk dibatalkan.");
        publishVerified(identity);
      } catch {
        if (revision === expectedRevision && record) {
          try {
            publish({ status: "logout-pending", retry: false });
            await revoke(record);
          } catch {
            publish({ status: "logout-pending", retry: true });
          }
        }
        throw new Error("Sesi masuk tidak dapat disimpan.");
      } finally {
        validation = null;
        signal?.removeEventListener("abort", cancel);
      }
    });
  }

  function clearLoginIntent({ accountId, sessionId }: Pick<SessionIdentity, "accountId" | "sessionId">) {
    return enqueue(async () => {
      if (!record?.loginIntent || record.status !== "active" ||
        accountId !== record.accountId || sessionId !== record.sessionId) return;
      const current = { ...record, loginIntent: undefined };
      await store.write(JSON.stringify(current));
      record = current;
      if (snapshot.state.status === "signed-in" && snapshot.state.sessionId === sessionId) {
        publish(snapshot.state, snapshot.transport, snapshot.revalidating);
      }
    });
  }

  function logout() {
    if (logoutOperation) return logoutOperation;
    revision++;
    validation?.abort();
    const cleanPush = !!dataTransport.captureSession();
    dataTransport.clearSession();
    logoutOperation = enqueue(async () => {
      try {
        const current = await load();
        if (current) await revoke(current, cleanPush);
        else publish({ status: "signed-out" });
      } catch {
        dataTransport.clearSession();
        publish({ status: "logout-pending", retry: true });
      }
    }).finally(() => { logoutOperation = null; });
    publish({ status: "logout-pending", retry: false });
    return logoutOperation;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(handler: () => void) {
      subscriptions.add(handler);
      return () => { subscriptions.delete(handler); };
    },
    subscribeBeforeLogout(handler: BeforeLogout) {
      beforeLogout.add(handler);
      return () => { beforeLogout.delete(handler); };
    },
    subscribeBeforeLocalLogout(handler: BeforeLocalLogout) {
      beforeLocalLogout.add(handler);
      return () => { beforeLocalLogout.delete(handler); };
    },
    acceptLogin,
    clearLoginIntent,
    logout,
    refresh,
  };
}
