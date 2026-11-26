import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { authEntryHref, parseNativeLoginIntent, readAuthReturnTo, resolveNativeLoginReturn, type NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { createNativeIntentRedirect } from "../../apps/mobile-native/routing/consent-intent";
import { productNavigationHref } from "../../apps/mobile-native/routing/product-location";
import { createWebsiteIntake, publicWebsiteUrl, websiteIntake } from "../../apps/mobile-native/routing/public-website";
import { createWebsiteHandoff, type WebsiteHandoffStatus } from "../../apps/mobile-native/routing/website-handoff";

test("public website paths preserve form, meeting, locale, slug and query semantics", () => {
  for (const path of [
    "/f/collision?locale=id&tag=a&tag=b", "/forms/aljabar?next=%2Fcourses%3Fx%3D1",
    "/meet/office-hours", "/tautan", "/en", "/id/blog/catatan%20mingguan#bagian-2",
    "/blog/50%2525", "/en/demo/flashcards?course=satu", "/privacy", "/unsubscribe?token=a%2Bb%3D",
  ]) {
    const url = NATIVE_STAGING_ORIGIN + path;
    for (const input of [path, url, "zyx-native-parity://" + path.slice(1), "zyx-native-parity://" + path]) {
      expect(publicWebsiteUrl(input)).toBe(url);
    }
  }
  expect(publicWebsiteUrl(NATIVE_STAGING_ORIGIN + "/")).toBe(NATIVE_STAGING_ORIGIN + "/");
  for (const path of ["/", "/admin/forms", "/admin/meet", "/courses/x/material/42", "/mcp/authorize",
    "/auth/native-finish", "/sign-in", "/en/admin", "/f/a%2Fb", "/blog/%2e%2e", "/f/%E0%A4",
    "//other.example/forms/1", "https://other.example/en/blog", NATIVE_STAGING_ORIGIN + ".example/f/test",
    "zyx-native-parity:////other.example/f/test"]) expect(publicWebsiteUrl(path)).toBeNull();
});

test("the Expo system-intent handler opens a browser handoff without writing the original URL to route params", async () => {
  const redirect = createNativeIntentRedirect(async () => "website-test");
  for (const initial of [true, false]) {
    const path = "/unsubscribe?token=synthetic%2Bvalue&choice=a&choice=b";
    const route = await redirect({ initial, path });
    expect(route).toBe("/website?link=website-test");
    expect(websiteIntake.resolve("website-test")).toBe(NATIVE_STAGING_ORIGIN + path);
    websiteIntake.release("website-test");
    expect(websiteIntake.resolve("website-test")).toBeNull();
    expect(await redirect({ initial, path: "/admin/forms" })).toBe("/admin/forms");
  }
});

test("expired or unavailable handoffs do not recover a different destination", async () => {
  let now = 0;
  const store = createWebsiteIntake(() => now);
  expect(await store.capture("/f/a", async () => "a")).toBe("/website?link=a");
  now = 300_000;
  expect(store.resolve("a")).toBeNull();
  expect(await store.capture("/blog", async () => { throw Error(); })).toBe("/website");
  expect(store.capture("/courses", async () => "x")).toBeNull();
});

test("product navigation and public login continuation give Expo only an opaque link and preserve the exact href", () => {
  const raw = "/en/blog/he%6Clo?slug=other&flag&tag=a&x=%2f&tag=b#plus+%2A";
  const account = { dashboard: "/admin", roles: ["admin"] } as const;
  const node = (href: string): NativeRouteNode => ({ href, contextKey: href + ".tsx", isInternal: false, isGenerated: false, children: [] });
  const sitemap = { ...node("/"), children: [node("/website"), node("/admin")] };
  const intent = { entry: "sign-in", locale: "en", next: raw } as const;
  const decoded = readAuthReturnTo(authEntryHref(intent).params.returnTo);
  expect(decoded).toBe(raw);
  expect(parseNativeLoginIntent(intent)).toEqual(intent);
  expect(resolveNativeLoginReturn(decoded, account, node("/admin"))).toEqual({ status: "unavailable", dashboard: "/admin" });
  const continuation = resolveNativeLoginReturn(decoded, account, sitemap);
  expect(continuation).toEqual({ status: "ready", href: raw });
  for (const [index, href] of [raw, NATIVE_STAGING_ORIGIN + raw, continuation.status === "ready" ? continuation.href : ""].entries()) {
    const key = `opaque-${index}`;
    expect(productNavigationHref(href, () => key)).toEqual({ website: true, href: `/website?link=${key}` });
    expect(websiteIntake.resolve(key)).toBe(NATIVE_STAGING_ORIGIN + raw);
    websiteIntake.release(key);
  }
  expect(productNavigationHref("/admin/blog?sort=created", () => { throw Error(); }))
    .toEqual({ website: false, href: "/admin/blog?sort=created" });
  expect(productNavigationHref("https://other.example/blog", () => "bad")).toBeNull();
});

test("browser lock and rejection preserve the handoff until explicit Retry or Back", async () => {
  const store = createWebsiteIntake();
  const url = NATIVE_STAGING_ORIGIN + "/f/alias?flag&a=%2f";
  const statuses: WebsiteHandoffStatus[] = [];
  const opened: string[] = [];
  const returned: string[] = [];
  const answers = ["locked", "reject", "opened"];
  store.capture(url, () => "retry");
  const screen = createWebsiteHandoff({
    resolve: () => store.resolve("retry"), release: () => store.release("retry"),
    async open(target) {
      opened.push(target);
      const type = answers.shift()!;
      if (type === "reject") throw Error();
      return { type };
    },
    isFocused: () => true, leave: () => returned.push("back"), setStatus: status => statuses.push(status),
  });
  await screen.focus();
  expect(statuses).toEqual(["opening", "failed"]);
  expect(store.resolve("retry")).toBe(url);
  await screen.focus();
  expect(opened).toEqual([url]);
  await screen.retry();
  expect(statuses.at(-1)).toBe("failed");
  expect(store.resolve("retry")).toBe(url);
  await screen.retry();
  expect(opened).toEqual([url, url, url]);
  expect(returned).toEqual(["back"]);
  expect(store.resolve("retry")).toBeNull();

  const pending = Promise.withResolvers<{ type: string }>();
  store.capture(url, () => "leave");
  const leaving = createWebsiteHandoff({
    resolve: () => store.resolve("leave"), release: () => store.release("leave"), open: () => pending.promise,
    isFocused: () => true, leave: () => returned.push("pressed-back"), setStatus: status => statuses.push(status),
  });
  const launch = leaving.focus();
  leaving.back();
  expect(store.resolve("leave")).toBeNull();
  pending.resolve({ type: "locked" });
  await launch;
  expect(statuses.at(-1)).toBe("opening");
  expect(returned).toEqual(["back", "pressed-back"]);
});

test("canonical product route files for public pages only hand off to the website", () => {
  const root = new URL("../../apps/mobile-native/app/", import.meta.url);
  for (const path of ["about", "blog", "blog/[slug]", "demo", "demo/[view]", "download", "forms-playground", "plans",
    "privacy", "tautan", "terms", "testimonial", "unsubscribe", "forms/[id]", "f/[slug]", "meet/[slug]"]) {
    expect(readFileSync(new URL(path + ".tsx", root), "utf8")).toContain('export default publicWebRoute("/' + path + '")');
  }
  for (const path of ["admin/forms", "admin/meet", "admin/blog", "courses", "tutor"]) {
    expect(readFileSync(new URL(path + ".tsx", root), "utf8")).toContain("productRoute(");
  }
});


test("launching the public website is a local interaction outside MCP", () => {
  expect(operationsCatalog.find(row => row.source === "apps/mobile-native/routing/PublicWebsiteRoute.tsx"))
    .toMatchObject({ actions: ["open"], tools: [], status: "excluded" });
});
