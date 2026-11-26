import type { NativeSessionTransport } from "../network/transport";
import { markInboxRead } from "../features/notification-inbox/client";
import type { ReminderResponse } from "./notification-response-controller";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Tap = { kind: "row"; id: string; path: string | null } | { kind: "digest" };
export type PushHost = {
  session: NativeSessionTransport;
  resolve(path?: string): string | null;
  navigate(path: string): void;
};

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
    return { kind: "row", id: data.notificationId, path: typeof data.url === "string" ? data.url : null };
  }
  return data?.quietDigest === "true" && data.groupKey === "quiet-digest" ? { kind: "digest" } : null;
}

export async function resolvePushRow(session: NativeSessionTransport, id: string, signal: AbortSignal) {
  const response = await session.request("/api/notifications/history?tapId=" + encodeURIComponent(id), { signal, retry: "transient-read" });
  try {
    if (!response.ok) return null;
    const row = record(await response.json());
    session.assertCurrent();
    return row?.id === id && (row.url === null || typeof row.url === "string") ? { url: row.url } : null;
  } finally {
    response.dispose();
  }
}

export function createPushResponseController(defaultAction: string, now = Date.now) {
  let host: PushHost | "checking" | null = "checking";
  let pending: { tap: Tap; received: number; session?: NativeSessionTransport } | null = null;
  let active: { session: NativeSessionTransport; controller: AbortController } | null = null;
  const seen = new Set<string>();

  async function deliver() {
    if (!pending || host === "checking") return;
    const next = pending;
    pending = null;
    if (!host || !host.session.isCurrent() || now() - next.received > 60_000 ||
      (next.session && next.session !== host.session)) return;
    const { session } = host;
    const controller = new AbortController();
    active?.controller.abort();
    active = { session, controller };
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      let path: string | undefined;
      const { tap } = next;
      if (tap.kind === "row") {
        const row = await resolvePushRow(session, tap.id, controller.signal);
        if (!row) return;
        path = row.url ?? tap.path ?? undefined;
      }
      if (controller.signal.aborted || !session.isCurrent() || !host || host.session !== session) return;
      const destination = host.resolve(path);
      if (!destination) return;
      host.navigate(destination);
      if (tap.kind === "row") await markInboxRead(session, { id: tap.id }, controller.signal);
    } catch {
      // The inbox continues to show the server's read state after a failed acknowledgement.
    } finally {
      clearTimeout(timer);
      if (active?.controller === controller) active = null;
    }
  }

  return {
    consume(response: ReminderResponse) {
      if (response.trigger !== "push") return false;
      const tap = parseTap(response.data);
      const age = now() - response.deliveredAt;
      if (!tap || response.actionIdentifier !== defaultAction || !Number.isFinite(age) || age < -60_000 || age > 86_400_000) return true;
      const identity = JSON.stringify([response.identifier, response.deliveredAt, tap.kind === "row" ? tap.id : null]);
      if (seen.has(identity)) return true;
      seen.add(identity);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      pending = { tap, received: now(), session: host && host !== "checking" ? host.session : undefined };
      void deliver();
      return true;
    },
    update(next: PushHost | "checking" | null) {
      if (active && (next === null || next === "checking" || next.session !== active.session)) active.controller.abort();
      host = next;
      void deliver();
    },
    close() {
      active?.controller.abort();
      pending = null;
      host = null;
    },
  };
}
