import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("successful discussion reads refresh the mounted bell and stale responses cannot restore its badge", async () => {
 const source = readFileSync("components/notifications/notification-bell.tsx", "utf8");
 const start = source.indexOf("  const [open, setOpen]");
 const end = source.indexOf("  // Fetch only unread count", start);
 expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
 const window = new EventTarget();
 const requests: Array<{ url: string; resolve: (response: unknown) => void }> = [];
 const effects: Array<() => void> = [];
 const unread: number[] = [];
 const exports: Record<string, any> = {};
 const code = ts.transpileModule(`exports.boot = () => { ${source.slice(start, end)} return { fetchUnreadCount, currentIdentity }; };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
 runInNewContext(code, { exports, session: { user: { id: "same-user" } }, demo: false, window,
  getDefaultHomeLinkForRole: () => "/dashboard",
  ZYX_NOTIFICATIONS_CHANGED: "zyx:notifications-changed",
  DISCUSSION_COUNTS_CHANGED: "zyx:discussion-counts-changed",
  ZYX_LIFECYCLE_REFRESH_EVENT: "zyx:lifecycle-refresh",
  fetch: (url: string) => new Promise(resolve => requests.push({ url, resolve })),
  useState: (initial: unknown) => [initial, (value: number) => { if (typeof initial === "number") unread.push(value); }],
  useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => () => void) => { effects.push(effect()); },
 });
 const instance = exports.boot();
 const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
 const respond = async (index: number, count: number) => { requests[index].resolve({ ok: true, json: async () => ({ unreadCount: count }) }); await flush(); };
 window.dispatchEvent(new Event("zyx:discussion-counts-changed"));
 expect(requests[0].url).toContain("countOnly=true");
 await respond(0, 0);
 expect(unread).toEqual([0]);
 const older = instance.fetchUnreadCount(), newer = instance.fetchUnreadCount();
 await respond(2, 1); await respond(1, 8); await Promise.all([older, newer]);
 expect(unread).toEqual([0, 1]);
 const previousIdentity = instance.fetchUnreadCount();
 instance.currentIdentity.current = "different-user";
 await respond(3, 99); await previousIdentity;
 expect(unread).toEqual([0, 1]);
 instance.currentIdentity.current = "same-user";
 window.dispatchEvent(new Event("zyx:lifecycle-refresh"));
 expect(requests).toHaveLength(5);
 expect(requests[4].url).toContain("countOnly=true");
 await respond(4, 3);
 expect(unread).toEqual([0, 1, 3]);
 effects.forEach(cleanup => cleanup?.());
 window.dispatchEvent(new Event("zyx:discussion-counts-changed"));
 window.dispatchEvent(new Event("zyx:lifecycle-refresh"));
 expect(requests).toHaveLength(5);
});
