import type { NativeAccountContext } from "../../../packages/native-session/context";
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

type SessionCredential = SessionIdentity & {
  origin: string;
  cookie: string;
};
type ActiveSession = SessionCredential & {
  status: "active";
  loginIntent?: NativeLoginIntent;
  locale?: NativeAccountContext["locale"];
  readingDenied?: true;
};
type RevokingSession = SessionCredential & { status: "revoking" };
type LocalClearTombstone = NativeSessionScope & { status: "clearing" };
type ClearingSession = LocalClearTombstone & { persisted: boolean };
type StoredSession = ActiveSession | RevokingSession | ClearingSession;
type OfflineIdentity = SessionIdentity & Pick<ActiveSession, "locale">;
type SessionStore = { read(): Promise<string | null>; write(value: string): Promise<void>; remove(): Promise<void> };
type BeforeLogout = (transport: NativeSessionTransport) => void | Promise<void>;
type BeforeLocalLogout = (scope: NativeSessionScope) => void | Promise<void>;
const PUSH_CLEANUP_PATH = "/api/notifications/register-token";

export type NativeSessionState =
  | { status: "loading" | "signed-out" }
  | { status: "unavailable"; offlineIdentity?: OfflineIdentity }
  | { status: "logout-pending"; retry: boolean }
  | ({ status: "signed-in" } & SessionIdentity);

function decodeStoredSession(value: string | null, origin: string): StoredSession | null {
  if (!value) return null;
  try {
    const record = JSON.parse(value) as (Partial<Omit<ActiveSession, "status">> & { status?: unknown }) | null;
    if (record?.origin !== origin || typeof record.accountId !== "string" || !record.accountId.trim() ||
      typeof record.sessionId !== "string" || !record.sessionId.trim()) return null;
    const scope = { origin, accountId: record.accountId, sessionId: record.sessionId };
    const { status } = record;
    if (status === "clearing") return { ...scope, status, persisted: true };
    if ((status !== "active" && status !== "revoking") || !isSignedSessionCookie(record.cookie) ||
      typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null;
    const credential = { ...scope, cookie: record.cookie, expiresAt: record.expiresAt };
    if (status === "revoking") return { ...credential, status };
    const locale = record.locale === "id" || record.locale === "en" ? record.locale : undefined;
    return { ...credential, status, locale, loginIntent: parseNativeLoginIntent(record.loginIntent),
      readingDenied: record.readingDenied === true ? true : undefined };
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
    offlineReadingDenied?: true;
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
    const offlineReadingDenied = state.status === "signed-in" && record?.status === "active" &&
      state.accountId === record.accountId && state.sessionId === record.sessionId && record.readingDenied;
    snapshot = { state, transport, revalidating, ...(loginIntent && { loginIntent }),
      ...(offlineReadingDenied && { offlineReadingDenied }) };
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

  async function clear() {
    dataTransport.clearSession();
    await store.remove();
    record = null;
  }

  async function markClearing({ origin, accountId, sessionId }: NativeSessionScope) {
    dataTransport.clearSession();
    if (snapshot.state.status !== "logout-pending" || snapshot.state.retry) {
      publish({ status: "logout-pending", retry: false });
    }
    if (record?.status === "clearing" && record.persisted) return;
    const pending: LocalClearTombstone = { status: "clearing", origin, accountId, sessionId };
    record = { ...pending, persisted: false };
    try {
      await store.write(JSON.stringify(pending));
      record = { ...pending, persisted: true };
    } catch (error) {
      // If the marker cannot be written, at least retire the on-disk credential.
      await store.remove().catch(() => {});
      throw error;
    }
  }

  async function clearLocalSession(current: NativeSessionScope) {
    // Retire the credential before touching storage that can fail or be interrupted.
    await markClearing(current);
    await purgeLocalSession(current);
    await clear();
  }

  function publishVerified(identity: SessionIdentity) {
    const active = dataTransport.captureSession();
    const transport = active?.scope.sessionId === identity.sessionId && active.scope.accountId === identity.accountId
      ? active
      : dataTransport.setSession({
        origin,
        accountId: identity.accountId,
        sessionId: identity.sessionId,
        // Keep submitted requests alive without starting new writes during verification.
        canStartRequest: method => !snapshot.revalidating || method === "GET" || method === "HEAD",
        readCookie: scope => record?.status === "active" && record.expiresAt > now()
          && record.origin === scope.origin && record.sessionId === scope.sessionId && record.accountId === scope.accountId
          ? record.cookie : null,
      });
    publish({ status: "signed-in", ...identity }, transport, false, record?.status === "active" ? record.loginIntent : undefined);
  }

  async function revoke(current: SessionCredential, cleanPush = false) {
    dataTransport.clearSession();
    const { origin, cookie, accountId, sessionId, expiresAt } = current;
    const pending: RevokingSession = { origin, cookie, accountId, sessionId, expiresAt, status: "revoking" };
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
    const [local, remote] = await Promise.allSettled([
      purgeLocalSession(current),
      api.revoke(pending.cookie).then(() => markClearing(current)),
    ]);
    if (remote.status === "rejected") throw remote.reason;
    if (local.status === "rejected") throw local.reason;
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
        if (current.status === "clearing" || current.expiresAt <= now()) {
          await clearLocalSession(current);
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }

        const controller = new AbortController();
        validation = controller;
        const identity = await api.read(current.cookie, controller.signal);
        if (!identity || identity.accountId !== current.accountId || identity.sessionId !== current.sessionId
          || identity.expiresAt <= now()) {
          await clearLocalSession(current);
          if (revision === expectedRevision) publish({ status: "signed-out" });
          return;
        }
        if (revision !== expectedRevision) return;
        if (identity.expiresAt !== current.expiresAt) {
          const updated = { ...current, expiresAt: identity.expiresAt };
          await store.write(JSON.stringify(updated));
          record = updated;
        }
        if (revision === expectedRevision) publishVerified(identity);
      } catch (error) {
        if (revision === expectedRevision) {
          dataTransport.clearSession();
          if (record?.status === "revoking" || record?.status === "clearing") {
            publish({ status: "logout-pending", retry: true });
          } else if (error instanceof NativeSessionConnectionError && record?.status === "active" &&
            record.expiresAt > now() && !record.readingDenied) {
            const { accountId, sessionId, expiresAt, locale } = record;
            publish({ status: "unavailable", offlineIdentity: { accountId, sessionId, expiresAt, ...(locale && { locale }) } });
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

  function refreshAfterRecovery(stillOnline: () => boolean) {
    const existing = refreshOperation;
    if (!existing || logoutOperation) return refresh();
    const expectedRevision = revision;
    // An in-flight read may have started before the network became usable.
    return existing.then(() => {
      if (revision === expectedRevision && !logoutOperation && snapshot.state.status === "unavailable" && stillOnline()) {
        return refresh();
      }
    });
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
        const current: ActiveSession = { ...identity, origin, cookie, status: "active",
          loginIntent: parseNativeLoginIntent(intent) };
        // A verified token remains visible to the queue for revocation if acceptance is cancelled.
        record = current;
        if (!active()) throw new Error("Sesi masuk dibatalkan.");
        await store.write(JSON.stringify(current));
        if (!active()) throw new Error("Sesi masuk dibatalkan.");
        publishVerified(identity);
      } catch {
        if (revision === expectedRevision && record?.status === "active") {
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
      if (record?.status !== "active" || !record.loginIntent ||
        accountId !== record.accountId || sessionId !== record.sessionId) return;
      const current = { ...record, loginIntent: undefined };
      await store.write(JSON.stringify(current));
      record = current;
      if (snapshot.state.status === "signed-in" && snapshot.state.sessionId === sessionId) {
        publish(snapshot.state, snapshot.transport, snapshot.revalidating);
      }
    });
  }

  function rememberAccountAccess(
    context: Pick<NativeAccountContext, "accountId" | "sessionId" | "locale" | "roles"> | null,
    transport: NativeSessionTransport,
  ) {
    return enqueue(async () => {
      const { accountId, sessionId } = transport.scope;
      if (snapshot.transport !== transport || !transport.isCurrent() || record?.status !== "active" ||
        record.accountId !== accountId || record.sessionId !== sessionId) return;
      if (context && (context.accountId !== accountId || context.sessionId !== sessionId ||
        (context.locale !== "id" && context.locale !== "en"))) return;
      const locale = context?.locale ?? record.locale;
      const readingDenied = context?.roles.includes("murid") ? undefined : true;
      if (locale === record.locale && readingDenied === record.readingDenied) return;
      const denialChanged = readingDenied !== record.readingDenied;
      const updated: ActiveSession = { ...record, locale, readingDenied };
      const publishReadingAccess = () => {
        if (denialChanged && snapshot.transport === transport && transport.isCurrent()) {
          publish(snapshot.state, transport, snapshot.revalidating, snapshot.loginIntent);
        }
      };
      // A known denial takes effect even if the current SecureStore write fails.
      if (readingDenied) {
        record = updated;
        publishReadingAccess();
      }
      try {
        await store.write(JSON.stringify(updated));
        record = updated;
        if (!readingDenied) publishReadingAccess();
      } catch (error) {
        if (readingDenied) await store.remove().catch(() => {});
        throw error;
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
        if (current && (current.status === "clearing" || (current.status === "active" && current.expiresAt <= now()))) {
          await clearLocalSession(current);
        } else if (current) {
          await revoke(current, cleanPush);
          return;
        }
        publish({ status: "signed-out" });
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
    getPendingRefresh: () => snapshot.revalidating ? refreshOperation : null,
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
    rememberAccountAccess,
    logout,
    refresh,
    refreshAfterRecovery,
  };
}
