import { expect, test } from "bun:test";
import { loadInbox, markInboxRead } from "../../apps/mobile-native/features/notification-inbox/client";
import { hasVerifiedInboxAccess, inboxDestination, staffInboxPushAction } from "../../apps/mobile-native/features/notification-inbox/access";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import type { NativeRequestInit, NativeSessionTransport } from "../../apps/mobile-native/network/transport";

const id = "ed441c04-7cae-4ccb-98fb-802fbf041e65";
const row = { id, title: "Jadwal", body: "Kelas dimulai.", type: "tutor_booking", read: false, createdAt: "2026-01-02T09:00:00Z", metadata: { url: "/dashboard/schedule" } };

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
  expect(page.rows[0]).toMatchObject({ id, href: "/dashboard/schedule", read: false, type: "tutor_booking" });
  const counter = inboxSession({ unreadCount: 3, notifications: [] });
  expect(await loadInbox(counter.session, false, counter.signal)).toEqual({ unread: 3, rows: [] });
  expect(inbox.calls[0].path).toBe("/api/notifications/history?limit=20");
  expect(counter.calls[0].path).toBe("/api/notifications/history?countOnly=true");
  expect(inbox.disposed()).toBe(1);
});

test("older notification records use the default icon when their type is absent", async () => {
  const inbox = inboxSession({ unreadCount: 1, notifications: [{ ...row, type: undefined }] });
  const page = await loadInbox(inbox.session, true, inbox.signal);
  expect(page.rows[0]?.type).toBeNull();
});

test("only a matching current session and verified surface role can mount the inbox", () => {
  const { session } = inboxSession({});
  const identity = { accountId: session.scope.accountId, sessionId: session.scope.sessionId, locale: "en" } as const;
  const admin = { ...identity, dashboard: "/admin", roles: ["admin", "tutor"] } as const;
  const tutor = { ...identity, dashboard: "/tutor", roles: ["tutor"] } as const;
  const student = { ...identity, dashboard: "/dashboard", roles: ["murid"] } as const;
  expect(hasVerifiedInboxAccess("admin", admin, session)).toBe(true);
  expect(hasVerifiedInboxAccess("tutor", admin, session)).toBe(true);
  expect(hasVerifiedInboxAccess("tutor", tutor, session)).toBe(true);
  expect(hasVerifiedInboxAccess("student", student, session)).toBe(true);
  expect(hasVerifiedInboxAccess("student", admin, session)).toBe(false);
  expect(hasVerifiedInboxAccess("admin", tutor, session)).toBe(false);
  expect(hasVerifiedInboxAccess("tutor", { ...tutor, accountId: "someone-else" }, session)).toBe(false);
  expect(hasVerifiedInboxAccess("tutor", { ...tutor, sessionId: "replaced" }, session)).toBe(false);
  expect(hasVerifiedInboxAccess("admin", admin, inboxSession({}, 200, false).session)).toBe(false);
});

test("only an open, verified staff inbox on a supported build shows a permission action", () => {
  const prompt = { status: "prompt", canAskAgain: true } as const;
  const { session } = inboxSession({});
  const tutor = { accountId: session.scope.accountId, sessionId: session.scope.sessionId, locale: "en",
    dashboard: "/tutor", roles: ["tutor"] } as const;
  expect(staffInboxPushAction("admin", true, true, prompt)).toBe("request");
  expect(staffInboxPushAction("tutor", true, hasVerifiedInboxAccess("tutor", tutor, session), prompt)).toBe("request");
  expect(staffInboxPushAction("tutor", true,
    hasVerifiedInboxAccess("tutor", { ...tutor, sessionId: "old" }, session), prompt)).toBeNull();
  expect(staffInboxPushAction("tutor", false, true, prompt)).toBeNull();
  expect(staffInboxPushAction("student", true, true, prompt)).toBeNull();
  expect(staffInboxPushAction("admin", true, true, null)).toBeNull();
  expect(staffInboxPushAction("admin", true, true, { status: "unsupported", canAskAgain: false })).toBeNull();
  expect(staffInboxPushAction("admin", true, true, { status: "denied", canAskAgain: true })).toBe("request");
  expect(staffInboxPushAction("admin", true, true, { status: "denied", canAskAgain: false })).toBe("settings");
  expect(staffInboxPushAction("tutor", true, true, { status: "granted", canAskAgain: true })).toBe("settings");
});

test("staff inbox resolves role-neutral discussion URLs through installed scoped routes", () => {
  const { session } = inboxSession({});
  const identity = { accountId: session.scope.accountId, sessionId: session.scope.sessionId, locale: "en" } as const;
  const admin = { ...identity, dashboard: "/admin", roles: ["admin", "tutor"] } as const;
  const tutor = { ...identity, dashboard: "/tutor", roles: ["tutor"] } as const;
  const student = { ...identity, dashboard: "/dashboard", roles: ["murid"] } as const;
  const paths = ["/admin", "/tutor", "/dashboard", "/admin/discussions", "/tutor/discussions", "/dashboard/discussions"];
  const sitemap: NativeRouteNode = {
    href: "/", contextKey: "./_layout.tsx", isGenerated: false, isInternal: false,
    children: paths.map(href => ({ href, contextKey: `.${href}.tsx`, isGenerated: false, isInternal: false, children: [] })),
  };
  expect(inboxDestination("/discussions?discussionTab=reports", admin, sitemap)).toBe("/admin/discussions?discussionTab=reports");
  expect(inboxDestination("/discussions?thread=topic&message=reply", tutor, sitemap)).toBe("/tutor/discussions?thread=topic&message=reply");
  expect(inboxDestination("/discussions?thread=topic", student, sitemap)).toBe("/dashboard/discussions?thread=topic");
  expect(inboxDestination("/admin/discussions", tutor, sitemap)).toBe("/tutor");
  expect(inboxDestination("//other.example/discussions", tutor, sitemap)).toBe("/tutor");
  expect(inboxDestination("/discussions?thread=topic", tutor, { ...sitemap, children: sitemap.children.slice(0, 3) })).toBe("/tutor");
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
