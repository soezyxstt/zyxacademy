import { AccountSwitchError, MAX_SAVED_ACCOUNTS, type AccountSwitchErrorCode } from "../../../lib/auth/account-switch-contract";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import type { NativeSessionScope, NativeSessionTransport, createNativeTransport } from "../network/transport";
import { NativeAdditionalLoginError } from "./additional-login-error";
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
  display?: NativeAccountContext["display"];
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

export type NativeAccountChangeIssue = Readonly<{ action: "add" | "switch"; code: AccountSwitchErrorCode }>;

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
    const display = record.display && typeof record.display.name === "string" && typeof record.display.email === "string"
      ? { name: record.display.name.slice(0, 256), email: record.display.email.slice(0, 320) } : undefined;
    return { ...credential, status, locale, display, loginIntent: parseNativeLoginIntent(record.loginIntent),
      readingDenied: record.readingDenied === true ? true : undefined };
  } catch { /* Treat an unreadable record as signed out. */ }
  return null;
}

export function createNativeSessionController({ origin, store: secureStore, api, dataTransport, now = Date.now }: {
  origin: string;
  store: SessionStore;
  api: ReturnType<typeof createNativeSessionApi>;
  dataTransport: ReturnType<typeof createNativeTransport>;
  now?: () => number;
}) {
  let record: StoredSession | null | undefined;
  let saved: ActiveSession[] = [];
  let changing: Promise<void> | null = null;
  let rollback: { issue: NativeAccountChangeIssue; source: Pick<SessionIdentity, "accountId" | "sessionId"> | null } | undefined;

  // Commit both sides of a switch in the same device-only SecureStore record.
  // With no saved accounts, keep the existing single-session representation.
  async function persist(active: object | null, nextSaved: ActiveSession[]) {
    const items = nextSaved.filter(item => item.expiresAt > now()).slice(0, MAX_SAVED_ACCOUNTS - (active ? 1 : 0));
    const bundle = items.length ? { ...active, origin, savedSessions: items } : active;
    if (bundle) await secureStore.write(JSON.stringify(bundle));
    else await secureStore.remove();
    saved = items;
  }
  const store = {
    async read() {
      const raw = await secureStore.read();
      if (!raw) return null;
      let bundle: { origin?: unknown; status?: unknown; accountId?: unknown; savedSessions?: unknown } | null;
      try { bundle = JSON.parse(raw); } catch { return raw; }
      if (bundle?.origin === origin && Array.isArray(bundle.savedSessions)) {
        const seen = new Set<unknown>([bundle.accountId]);
        saved = [];
        for (const item of bundle.savedSessions.slice(0, MAX_SAVED_ACCOUNTS)) {
          if (!item || typeof item !== "object") continue;
          const entry = decodeStoredSession(JSON.stringify(item), origin);
          if (entry?.status !== "active" || entry.expiresAt <= now() || seen.has(entry.accountId)) continue;
          seen.add(entry.accountId);
          saved.push(entry);
        }
        if (!bundle.status) return null;
      }
      return raw;
    },
    async write(value: string) {
      const active = JSON.parse(value);
      await persist(active, saved.filter(other => other.accountId !== active.accountId));
    },
    remove: () => persist(null, saved),
  };
  let snapshot: {
    state: NativeSessionState;
    transport: NativeSessionTransport | null;
    revalidating: boolean;
    loginIntent?: NativeLoginIntent;
    offlineReadingDenied?: true;
    accountChangeIssue?: NativeAccountChangeIssue;
  } = {
    state: { status: "loading" }, transport: null, revalidating: false,
  };
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let validation: AbortController | null = null;
  let refreshOperation: Promise<void> | null = null;
  let logoutOperation: Promise<void> | null = null;
  let verifiedAccess: { state: NativeSessionState; roles: NativeAccountContext["roles"] } | undefined;
  const subscriptions = new Set<() => void>();
  const beforeLogout = new Set<BeforeLogout>();
  const beforeLocalLogout = new Set<BeforeLocalLogout>();

  function publish(
    state: NativeSessionState, transport: NativeSessionTransport | null = null,
    revalidating = false, loginIntent?: NativeLoginIntent,
  ) {
    if (revalidating || state !== snapshot.state) verifiedAccess = undefined;
    const offlineReadingDenied = state.status === "signed-in" && record?.status === "active" &&
      state.accountId === record.accountId && state.sessionId === record.sessionId && record.readingDenied;
    if (rollback && (state.status === "logout-pending" ||
      (state.status === "signed-out" && rollback.source !== null) ||
      (state.status === "signed-in" && (state.accountId !== rollback.source?.accountId || state.sessionId !== rollback.source?.sessionId)))) {
      rollback = undefined;
    }
    const accountChangeIssue = (state.status === "signed-in" || state.status === "signed-out") ? rollback?.issue : undefined;
    snapshot = { state, transport, revalidating, ...(loginIntent && { loginIntent }),
      ...(offlineReadingDenied && { offlineReadingDenied }), ...(accountChangeIssue && { accountChangeIssue }) };
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

  async function discardUnreadableVault() {
    try {
      await secureStore.remove();
      saved = [];
    } catch { /* Keep the cleanup marker in memory for retry. */ }
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
      await discardUnreadableVault();
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
        canStartRequest: (method, role) => method === "GET" || method === "HEAD" || (!snapshot.revalidating &&
          (!role || (verifiedAccess?.state === snapshot.state && verifiedAccess.roles.includes(role)))),
        readCookie: scope => record?.status === "active" && record.expiresAt > now()
          && record.origin === scope.origin && record.sessionId === scope.sessionId && record.accountId === scope.accountId
          ? record.cookie : null,
      });
    const { accountId, sessionId, expiresAt } = identity;
    publish({ status: "signed-in", accountId, sessionId, expiresAt }, transport, false, record?.status === "active" ? record.loginIntent : undefined);
  }

  async function detachDevice(current: SessionCredential, requireSuccess: boolean) {
    if (beforeLogout.size) {
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
      const results = await Promise.allSettled([...beforeLogout].map(async handler => handler(cleanupTransport)));
      dataTransport.clearSession();
      if (requireSuccess && results.some(result => result.status === "rejected")) throw new AccountSwitchError("SWITCH_FAILED");
    }
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
      await discardUnreadableVault();
    }
    record = pending;
    if (cleanPush) await detachDevice(current, false);
    const [local, remote] = await Promise.allSettled([
      purgeLocalSession(current),
      api.revoke(pending.cookie).then(() => markClearing(current)),
    ]);
    if (remote.status === "rejected") throw remote.reason;
    if (local.status === "rejected") throw local.reason;
    await clear();
    publish({ status: "signed-out" });
  }

  function refresh(): Promise<void> {
    if (logoutOperation) return logoutOperation;
    if (refreshOperation) return refreshOperation;
    if (changing) return changing.catch(() => {});
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
    context: Pick<NativeAccountContext, "accountId" | "sessionId" | "locale" | "roles" | "display"> | null,
    transport: NativeSessionTransport,
    checkedState = snapshot.state,
  ) {
    const { accountId, sessionId } = transport.scope;
    if (snapshot.state === checkedState && !snapshot.revalidating && snapshot.transport === transport && transport.isCurrent() &&
      (!context || (context.accountId === accountId && context.sessionId === sessionId))) {
      verifiedAccess = context ? { state: checkedState, roles: context.roles } : undefined;
    }
    return enqueue(async () => {
      if (snapshot.state !== checkedState || snapshot.revalidating || snapshot.transport !== transport ||
        !transport.isCurrent() || record?.status !== "active" ||
        record.accountId !== accountId || record.sessionId !== sessionId) return;
      if (context && (context.accountId !== accountId || context.sessionId !== sessionId ||
        (context.locale !== "id" && context.locale !== "en"))) return;
      const locale = context?.locale ?? record.locale;
      const readingDenied = context?.roles.includes("murid") ? undefined : true;
      const display = context?.display ?? record.display;
      if (locale === record.locale && readingDenied === record.readingDenied &&
        display?.name === record.display?.name && display?.email === record.display?.email) return;
      const denialChanged = readingDenied !== record.readingDenied;
      const updated: ActiveSession = { ...record, locale, readingDenied, display };
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
        if (readingDenied) await discardUnreadableVault();
        throw error;
      }
    });
  }

  function checkSwitchSource(fromSessionId: string | null) {
    const state = snapshot.state;
    if (logoutOperation || snapshot.revalidating || (fromSessionId === null ? state.status !== "signed-out"
      : state.status !== "signed-in" || state.sessionId !== fromSessionId)) throw new AccountSwitchError("BUSY");
    if (dataTransport.hasPendingWrites()) throw new AccountSwitchError("PENDING_CHANGES");
  }

  function runChange(from: string | null, change: () => Promise<void>) {
    if (changing) return Promise.reject(new AccountSwitchError("BUSY"));
    changing = enqueue(async () => {
      await load();
      checkSwitchSource(from);
      if (snapshot.accountChangeIssue) dismissAccountChangeIssue(snapshot.accountChangeIssue);
      await change();
    })
      .finally(() => { changing = null; });
    return changing;
  }

  function dismissAccountChangeIssue(issue: NativeAccountChangeIssue) {
    if (snapshot.accountChangeIssue !== issue) return;
    rollback = undefined;
    publish(snapshot.state, snapshot.transport, snapshot.revalidating, snapshot.loginIntent);
  }

  async function listSavedAccounts() {
    return enqueue(async () => {
      await load();
      return saved.filter(item => item.expiresAt > now()).map(({ accountId, display }) => ({
        accountId, name: display?.name, email: display?.email,
      }));
    });
  }

  async function activate(candidate: ActiveSession, identity: SessionIdentity | null, from: string | null, {
    action, signal, loginIntent,
  }: { action: NativeAccountChangeIssue["action"]; signal?: AbortSignal; loginIntent?: NativeLoginIntent }) {
    const previous = record?.status === "active" ? record : null;
    checkSwitchSource(from);
    if (signal?.aborted) throw new AccountSwitchError("CANCELLED");
    if (!identity || identity.accountId !== candidate.accountId || identity.sessionId !== candidate.sessionId || identity.expiresAt <= now()) {
      await persist(previous, saved.filter(item => item.sessionId !== candidate.sessionId));
      throw new AccountSwitchError("SESSION_EXPIRED");
    }
    const next: ActiveSession = { ...candidate, ...identity, loginIntent };
    const previousSaved = saved;
    const others = saved.filter(item => item.expiresAt > now() && item.accountId !== next.accountId);
    if (previous) others.push({ ...previous, loginIntent: undefined });
    if (others.length >= MAX_SAVED_ACCOUNTS) throw new AccountSwitchError("SESSION_LIMIT");
    // Block the old UI and cancel its outstanding reads before relinquishing its device bindings.
    dataTransport.clearSession();
    const detached = previous && detachDevice(previous, true);
    publish({ status: "loading" });
    try {
      if (previous) {
        await detached;
        await purgeLocalSession(previous);
      }
      if (signal?.aborted) throw new AccountSwitchError("CANCELLED");
      await persist(next, others);
      if (signal?.aborted) {
        // A cancellation during the SecureStore write can still restore the old vault.
        let reverted = false;
        try { await persist(previous, previousSaved); reverted = true; } catch { /* The new vault is already durable. */ }
        if (reverted) throw new AccountSwitchError("CANCELLED");
      }
      record = next;
      publishVerified(identity);
    } catch (error) {
      const code = error instanceof AccountSwitchError ? error.code : "SWITCH_FAILED";
      if (code !== "CANCELLED") {
        rollback = { issue: { action, code }, source: previous && { accountId: previous.accountId, sessionId: previous.sessionId } };
      }
      if (previous) publishVerified(previous);
      else publish({ status: "signed-out" });
      throw error;
    }
  }

  function switchSavedAccount(accountId: string, from: string | null, intent?: NativeLoginIntent) {
    const loginIntent = from === null ? parseNativeLoginIntent(intent) : undefined;
    return runChange(from, async () => {
      const candidate = saved.find(item => item.accountId === accountId);
      if (!candidate) throw new AccountSwitchError("ACCOUNT_UNAVAILABLE");
      await activate(candidate, await api.read(candidate.cookie), from, { action: "switch", loginIntent });
    });
  }

  function removeSavedAccount(accountId: string, from: string | null) {
    return runChange(from, async () => {
      if (record && record.accountId === accountId) throw new AccountSwitchError("ACTIVE_ACCOUNT");
      const candidate = saved.find(item => item.accountId === accountId);
      if (!candidate) return;
      await api.revoke(candidate.cookie);
      await purgeLocalSession(candidate);
      await persist(record ?? null, saved.filter(item => item !== candidate));
    });
  }

  async function acceptAdditionalLogin(headers: SessionHeaders, accountId: string, from: string, signal?: AbortSignal) {
    const cookie = readSignedSessionCookie(headers);
    try {
      await runChange(from, async () => {
        if (!cookie || signal?.aborted) throw new AccountSwitchError("CANCELLED");
        const identity = await api.read(cookie, signal);
        if (!identity || identity.accountId !== accountId || identity.expiresAt <= now()) throw new AccountSwitchError("ACCOUNT_UNAVAILABLE");
        if (record?.accountId === accountId || saved.some(item => item.accountId === accountId && item.expiresAt > now())) {
          throw new AccountSwitchError("ACTIVE_ACCOUNT");
        }
        await activate({ status: "active", origin, cookie, ...identity }, identity, from, { action: "add", signal });
      });
    } catch (error) {
      // A provider may return an existing credential. Only retire a newly minted session.
      if (cookie) await enqueue(async () => {
        const current = await load();
        if ((current && "cookie" in current && current.cookie === cookie) || saved.some(item => item.cookie === cookie)) return;
        await api.revoke(cookie);
      }).catch(() => {});
      throw new NativeAdditionalLoginError(signal?.aborted ? "CANCELLED" : error instanceof AccountSwitchError ? error.code :
        error instanceof NativeSessionConnectionError ? "OFFLINE" : "SWITCH_FAILED");
    }
  }

  function logout(): Promise<void> {
    if (logoutOperation) return logoutOperation;
    if (changing) {
      const expected = record?.sessionId;
      return changing.catch(() => {}).then(() => expected && expected === record?.sessionId ? logout() : undefined);
    }
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
    acceptLogin, listSavedAccounts, switchSavedAccount, removeSavedAccount, acceptAdditionalLogin,
    clearLoginIntent, dismissAccountChangeIssue,
    rememberAccountAccess,
    logout,
    refresh,
    refreshAfterRecovery,
  };
}
