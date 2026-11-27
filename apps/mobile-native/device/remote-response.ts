import type { NativeSessionScope, NativeSessionTransport } from "../network/transport";
import { markInboxRead } from "../features/notification-inbox/client";
import type { ReminderResponse } from "./notification-response-controller";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Tap = { kind: "row"; id: string } | { kind: "digest" };
export type PushHost = {
  session: NativeSessionTransport;
  navigationReady: boolean;
  isCurrent(): boolean;
  revalidate(): Promise<"verified" | "checking" | "unavailable">;
  resolve(path?: string): string | null;
  navigate(path: string): void;
};

export type PushHostState = PushHost | { status: "checking"; scope?: NativeSessionScope } | null;

function sameScope(left: NativeSessionScope, right: NativeSessionScope) {
  return left.origin === right.origin && left.accountId === right.accountId && left.sessionId === right.sessionId;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Zyx sends FCM data directly and APNs custom fields alongside aps. Expo also
// exposes parsed content.data when the provider uses its nested body format.
export function remotePushData(content: unknown, trigger: unknown) {
  const native = record(trigger);
  const candidates = [content, record(native?.remoteMessage)?.data, native?.payload];
  return candidates.map(record).find(data => data && (typeof data.notificationId === "string" || data.quietDigest === "true")) ?? null;
}

function parseTap(value: unknown): Tap | null {
  const data = record(value);
  if (typeof data?.notificationId === "string" && uuid.test(data.notificationId)) {
    return { kind: "row", id: data.notificationId };
  }
  return data?.quietDigest === "true" && data.groupKey === "quiet-digest" ? { kind: "digest" } : null;
}

async function resolvePushRow(session: NativeSessionTransport, id: string, signal: AbortSignal) {
  const response = await session.request("/api/notifications/history?tapId=" + encodeURIComponent(id), { signal });
  try {
    if (response.status === 401) return { status: "unauthorized" } as const;
    if (!response.ok) return null;
    const row = record(await response.json());
    session.assertCurrent();
    return row?.id === id && (row.url === null || typeof row.url === "string")
      ? { status: "visible", url: row.url } as const : null;
  } finally {
    response.dispose();
  }
}

type PendingTap = {
  key: string;
  tap: Tap;
  scope?: NativeSessionScope;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
  retried: boolean;
  verifying: boolean;
};

export function createPushResponseController(defaultAction: string, now = Date.now) {
  let host: PushHostState = { status: "checking" };
  let pending: PendingTap | null = null;
  let active: { host: PushHost; controller: AbortController } | null = null;
  const seen = new Set<string>();

  function remember(key: string) {
    seen.add(key);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
  }

  function finish(tap: PendingTap) {
    if (pending !== tap) return;
    clearTimeout(tap.timer);
    pending = null;
    remember(tap.key);
  }

  function abortActive() {
    const attempt = active;
    active = null;
    attempt?.controller.abort();
  }

  function verifiedHost() {
    return host && "session" in host && host.isCurrent() && host.session.isCurrent() ? host : null;
  }

  async function deliver() {
    const next = pending;
    const current = verifiedHost();
    if (!next || !current?.navigationReady || active || next.verifying) return;
    if (now() >= next.deadline || (next.scope && !sameScope(next.scope, current.session.scope))) {
      finish(next);
      return;
    }
    next.scope = current.session.scope;
    const controller = new AbortController();
    const attempt = { host: current, controller };
    active = attempt;
    const timer = setTimeout(() => controller.abort(), 12_000);
    const latestHost = () => {
      const latest = verifiedHost();
      return active === attempt && pending === next && latest?.navigationReady && latest.session === current.session && current.isCurrent()
        ? latest : null;
    };
    const { tap } = next;
    try {
      const row = tap.kind === "row" ? await resolvePushRow(current.session, tap.id, controller.signal) : null;
      const latest = latestHost();
      if (!latest) return;
      if (now() >= next.deadline) {
        finish(next);
        return;
      }
      if (row?.status === "unauthorized" && !next.retried && !controller.signal.aborted) {
        next.retried = true;
        next.verifying = true;
        active = null;
        clearTimeout(timer);
        const result = await latest.revalidate();
        if (pending !== next) return;
        next.verifying = false;
        if (result === "unavailable") finish(next);
        else if (result === "verified" || verifiedHost() !== latest) void deliver();
        return;
      }
      finish(next);
      if (controller.signal.aborted || (tap.kind === "row" && row?.status !== "visible")) return;
      const destination = latest.resolve(row?.status === "visible" ? row.url ?? undefined : undefined);
      if (!destination) return;
      latest.navigate(destination);
      if (tap.kind === "row" && current.isCurrent() && current.session.isCurrent()) {
        await markInboxRead(current.session, { id: tap.id }, controller.signal);
      }
    } catch {
      if (latestHost() || (pending === next && next.verifying)) finish(next);
    } finally {
      clearTimeout(timer);
      if (active === attempt) active = null;
    }
  }

  return {
    consume(response: ReminderResponse) {
      if (response.trigger !== "push") return false;
      const tap = parseTap(response.data);
      const age = now() - response.deliveredAt;
      if (!tap || response.actionIdentifier !== defaultAction || !Number.isFinite(age) || age < -60_000 || age > 86_400_000) return true;
      const key = JSON.stringify([response.identifier, response.deliveredAt, tap.kind === "row" ? tap.id : null]);
      if (seen.has(key) || pending?.key === key) return true;
      if (!host || (tap.kind === "digest" && !verifiedHost())) {
        remember(key);
        return true;
      }
      if (pending) finish(pending);
      abortActive();
      // Bind a queued tap before leaving the current session. A cold row tap
      // can bind when the first verified host proves ownership on the server.
      const scope = "session" in host ? host.session.scope : host.scope;
      const deadline = now() + 60_000;
      const next: PendingTap = { key, tap, scope, deadline, retried: false, verifying: false, timer: setTimeout(() => {
        if (pending !== next) return;
        finish(next);
        abortActive();
      }, 60_000) };
      pending = next;
      void deliver();
      return true;
    },
    update(next: PushHostState) {
      host = next;
      const scope = next && ("session" in next ? next.session.scope : next.scope);
      if (pending && (!next || (pending.scope && scope && !sameScope(pending.scope, scope)))) finish(pending);
      const verified = verifiedHost();
      if (active && (!verified?.navigationReady || active.host.session !== verified.session || !active.host.isCurrent())) abortActive();
      void deliver();
    },
    close() {
      if (pending) finish(pending);
      abortActive();
      host = null;
    },
  };
}
