import { expect, test } from "bun:test";
import { loadInbox, markInboxRead } from "../../apps/mobile-native/features/notification-inbox/client";
import type { NativeRequestInit, NativeSessionTransport } from "../../apps/mobile-native/network/transport";

const id = "ed441c04-7cae-4ccb-98fb-802fbf041e65";
const row = { id, title: "Jadwal", body: "Kelas dimulai.", read: false, createdAt: "2026-01-02T09:00:00Z", metadata: { url: "/dashboard/schedule" } };

function inboxSession(payload: unknown, status = 200, current = true) {
  const signal = new AbortController().signal;
  const calls: { path: string; init?: NativeRequestInit }[] = [];
  let disposed = 0;
  const session: NativeSessionTransport = {
    scope: { origin: "https://staging.zyxacademy.com", accountId: "my-account", sessionId: "current-session" }, signal,
    isCurrent: () => current, assertCurrent() { if (!current) throw new Error("session ended"); },
    async request(path, init) {
      calls.push({ path, init });
      return { status, ok: status === 200, headers: new Headers(), body: null,
        json: async () => payload, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0), dispose() { disposed++; } };
    },
  };
  return { session, signal, calls, disposed: () => disposed };
}

test("closed bell only reads the count; expanded history preserves the global unread total and destination", async () => {
  const inbox = inboxSession({ unreadCount: 26, notifications: [row] });
  const page = await loadInbox(inbox.session, true, inbox.signal);
  expect(page.unread).toBe(26);
  expect(page.rows[0]).toMatchObject({ id, href: "/dashboard/schedule", read: false });
  const counter = inboxSession({ unreadCount: 3, notifications: [] });
  expect(await loadInbox(counter.session, false, counter.signal)).toEqual({ unread: 3, rows: [] });
  expect(inbox.calls[0].path).toBe("/api/notifications/history?limit=20");
  expect(counter.calls[0].path).toBe("/api/notifications/history?countOnly=true");
  expect(inbox.disposed()).toBe(1);
});

test("read acknowledgement uses only the current session and the exact idempotent selection", async () => {
  const inbox = inboxSession({ success: true });
  await markInboxRead(inbox.session, { id }, inbox.signal);
  await markInboxRead(inbox.session, { all: true }, inbox.signal);
  expect(inbox.calls.map(call => [call.path, call.init?.method, JSON.parse(String(call.init?.body)), call.init?.retry]))
    .toEqual([["/api/notifications/read", "PATCH", { ids: [id] }, undefined], ["/api/notifications/read", "PATCH", { all: true }, undefined]]);
});

test("expired identities, denied requests, and invalid payloads never publish notification data or success", async () => {
  for (const inbox of [
    inboxSession({ unreadCount: 2, notifications: [row] }, 200, false),
    inboxSession({}, 403), inboxSession({ unreadCount: -1, notifications: [] }),
    inboxSession({ unreadCount: 1, notifications: [{ ...row, read: 1 }] }),
  ]) {
    await expect(loadInbox(inbox.session, true, inbox.signal)).rejects.toThrow();
    expect(inbox.disposed()).toBe(1);
  }
  for (const inbox of [inboxSession({ success: true }, 200, false), inboxSession({ success: false }), inboxSession({}, 401)]) {
    await expect(markInboxRead(inbox.session, { id }, inbox.signal)).rejects.toThrow();
    expect(inbox.disposed()).toBe(1);
  }
});
