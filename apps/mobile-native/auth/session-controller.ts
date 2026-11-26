import type { NativeSessionTransport, createNativeTransport } from "../network/transport";
import {
  isSignedSessionCookie,
  readSignedSessionCookie,
  type SessionHeaders,
  type SessionIdentity,
  type createNativeSessionApi,
} from "./session-api";

type StoredSession = SessionIdentity & { origin: string; cookie: string; status: "active" | "revoking" };
type SessionStore = { read(): Promise<string | null>; write(value: string): Promise<void>; remove(): Promise<void> };
type BeforeLogout = (transport: NativeSessionTransport) => void | Promise<void>;
const PUSH_CLEANUP_PATH = "/api/notifications/register-token";

export type NativeSessionState =
  | { status: "loading" | "signed-out" | "unavailable" }
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
        sessionId: record.sessionId, expiresAt: record.expiresAt };
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
  let snapshot: { state: NativeSessionState; transport: NativeSessionTransport | null } = {
    state: { status: "loading" }, transport: null,
  };
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let validation: AbortController | null = null;
  let refreshOperation: Promise<void> | null = null;
  let logoutOperation: Promise<void> | null = null;
  const subscriptions = new Set<() => void>();
  const beforeLogout = new Set<BeforeLogout>();

  function publish(state: NativeSessionState, transport: NativeSessionTransport | null = null) {
    snapshot = { state, transport };
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

  async function clear() {
    dataTransport.clearSession();
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
    publish({ status: "signed-in", ...identity }, transport);
  }

  async function revoke(current: StoredSession, cleanPush = false) {
    dataTransport.clearSession();
    const pending = { ...current, status: "revoking" } as const;
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
    await api.revoke(pending.cookie);
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
          await clear();
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }

        const controller = new AbortController();
        validation = controller;
        const identity = await api.read(current.cookie, controller.signal);
        if (revision !== expectedRevision) return;
        if (!identity || identity.accountId !== current.accountId || identity.sessionId !== current.sessionId
          || identity.expiresAt <= now()) {
          await clear();
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }
        if (identity.expiresAt !== current.expiresAt) {
          const updated = { ...current, expiresAt: identity.expiresAt };
          await store.write(JSON.stringify(updated));
          record = updated;
        }
        if (revision === expectedRevision) publishVerified(identity);
      } catch {
        if (revision === expectedRevision) {
          dataTransport.clearSession();
          publish(record?.status === "revoking" ? { status: "logout-pending", retry: true } : { status: "unavailable" });
        }
      } finally {
        validation = null;
      }
    }).finally(() => { refreshOperation = null; });
    return refreshOperation;
  }

  async function acceptLogin(headers: SessionHeaders, expectedAccount: string, signal?: AbortSignal) {
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
        const current: StoredSession = { ...identity, origin, cookie, status: "active" };
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
    acceptLogin,
    logout,
    refresh,
  };
}
