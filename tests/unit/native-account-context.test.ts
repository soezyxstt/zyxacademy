import { expect, test } from "bun:test";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { loadNativeAccountContext, NativeAccountAccessDenied } from "../../apps/mobile-native/network/account-context";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { accountMenuEntries } from "../../apps/mobile-native/routing/account-menu-model";

const origin = "https://staging.zyxacademy.com";
const context = { accountId: "student", sessionId: "one", roles: ["tutor", "murid"], dashboard: "/tutor", locale: "id" } as const;
function run(payload: unknown, status = 200) {
  const transport = createNativeTransport({ origin, fetcher: async url => {
    expect(url).toBe(origin + "/api/native/context");
    return Response.json(payload, { status });
  } });
  const session = transport.setSession({ origin, accountId: "student", sessionId: "one", readCookie: () => "session=fixture" });
  return loadNativeAccountContext(session);
}

test("returns the current user's scoped roles, locale and role dashboard", async () => {
  expect(await run(context)).toEqual(context);
});
test("accepts optional display identity only inside the current session", async () => {
  const display = { name: "Preview account", email: "preview@example.test" };
  expect(await run({ ...context, display })).toEqual({ ...context, display });
  await expect(run({ ...context, display: { ...display, email: null } })).rejects.toThrow();
  await expect(run({ ...context, display, sessionId: "previous" })).rejects.toThrow();
});
test("rejects cross-session data and inconsistent memberships or locale", async () => {
  for (const invalid of [{ sessionId: "previous" }, { accountId: "other" }, { locale: "xx" }, { roles: [] },
    { roles: ["teacher"] }, { dashboard: "/admin" }]) {
    await expect(run({ ...context, ...invalid })).rejects.toThrow();
  }
});
test("does not provide access on an expired or unauthorized session", async () => {
  for (const status of [401, 403]) await expect(run(context, status)).rejects.toBeInstanceOf(NativeAccountAccessDenied);
});

test("a temporary data service failure does not revoke previous local schedules", async () => {
  await expect(run(context, 503)).rejects.toThrow("Konteks akun belum tersedia.");
});

test("account menus expose only mounted destinations authorized for the current roles", () => {
  const node = (href: string): NativeRouteNode => ({ href, contextKey: href + ".tsx", isGenerated: false, isInternal: false, children: [] });
  const sitemap = { ...node("/"), children: ["/profile", "/settings", "/dashboard", "/tutor", "/admin"].map(node) };
  expect(accountMenuEntries(context, sitemap).map(item => item.href)).toEqual(["/profile", "/settings", "/dashboard", "/tutor"]);
  expect(accountMenuEntries({ ...context, roles: ["admin"], dashboard: "/admin", locale: "en" }, sitemap)).toEqual([
    { id: "profile", href: "/profile", label: "Profile" },
    { id: "preferences", href: "/settings", label: "Preferences" },
    { id: "adminPanel", href: "/admin", label: "Admin panel" },
  ]);
  expect(accountMenuEntries(context, { ...sitemap, children: [node("/profile")] }).map(item => item.href)).toEqual(["/profile"]);
  expect(accountMenuEntries(context, { ...sitemap, children: [node("/mcp/connections")] }).map(item => item.href)).toEqual(["/mcp/connections"]);
  expect(accountMenuEntries(context, null)).toEqual([]);
});
