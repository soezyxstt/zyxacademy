import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { createNativeIntentRedirect } from "../../apps/mobile-native/routing/consent-intent";
import { createWebsiteIntake, publicWebsiteUrl, websiteIntake } from "../../apps/mobile-native/routing/public-website";

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
