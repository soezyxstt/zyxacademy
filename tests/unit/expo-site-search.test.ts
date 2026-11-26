import { expect, test } from "bun:test";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { localSearchHits, readSearchHits, readSearchPeople, searchDestination, searchCategories, searchShortcuts, studentPeopleQuery } from "../../apps/mobile-native/features/site-search/results";
import type { NativeSessionTransport } from "../../apps/mobile-native/network/transport";

import { allowSavedLink, readSavedLinks, searchStorageKey, updateSavedLinks, type SavedLinks } from "../../apps/mobile-native/features/site-search/saved-links";

const account = { roles: ["murid"], locale: "id" } as const;
const sitemap: NativeRouteNode = { href: "/", contextKey: "", isInternal: false, isGenerated: false,
  children: ["/dashboard", "/courses/[id]", "/students/[publicId]", "/admin"].map(href => ({
    href, contextKey: href + ".tsx", isInternal: false, isGenerated: false, children: [],
  })) };

function setup(data: unknown, options: { status?: number; expired?: boolean } = {}) {
  let disposed = false;
  let path = "";
  const transport = {
    async request(url: string) {
      path = url;
      return { ok: (options.status ?? 200) === 200, json: async () => data, dispose: () => { disposed = true; } };
    },
    assertCurrent() { if (options.expired) throw new Error("Session ended"); },
  } as unknown as NativeSessionTransport;
  const read = () => readSearchHits(transport, "Kelas & A", account, sitemap, new AbortController().signal);
  return { read, get disposed() { return disposed; }, get path() { return path; } };
}

test("resolves only installed destinations permitted by the account or the intended public website", () => {
  expect(searchDestination("/courses/math", account, sitemap)).toBe("/courses/math");
  expect(searchDestination("/admin", account, sitemap)).toBeNull();
  expect(searchDestination("/settings", account, sitemap)).toBeNull();
  expect(searchDestination("/academic", account, sitemap)).toBeNull();
  expect(searchDestination("/meet/grup", account, sitemap)).toBe("/meet/grup");
  expect(searchDestination("/f/survei", account, sitemap)).toBe("/f/survei");
  expect(searchDestination("/", account, sitemap)).toBe("/id");
  for (const input of ["https://outside.invalid/", "//outside.invalid", "/api/native/session", "/blog/%2e%2e"]) {
    expect(searchDestination(input, account, sitemap)).toBeNull();
  }
});

test("uses the authenticated search endpoint, groups and deduplicates destinations, and disposes the response", async () => {
  const grouped = Object.fromEntries(searchCategories.map(([category]) => [category, [] as unknown[]]));
  grouped.Navigasi = [
    { metadata: { href: "/admin", title: "Admin" } },
    { metadata: { href: "/dashboard", title: "Ringkasan kelas" } },
    { metadata: { href: "/dashboard", title: "Duplikat" } },
  ];
  grouped["Course & Modul"] = [{ metadata: { href: "/courses/a", title: "Kelas & A", subtitle: "TPB" } }];
  const source = setup({ query: "Kelas & A", grouped });
  expect(await source.read()).toEqual([
    { href: "/courses/a", title: "Kelas & A", subtitle: "TPB", category: "Course & Modul" },
    { href: "/dashboard", title: "Ringkasan kelas", subtitle: undefined, category: "Navigasi" },
  ]);
  expect(new URL(source.path, "https://zyx.invalid").searchParams.get("q")).toBe("Kelas & A");
  expect(source.disposed).toBe(true);
});

test("discard account changes, malformed groups, stale query responses and unsuccessful reads", async () => {
  for (const source of [setup({}, { status: 403 }), setup({}, { expired: true }), setup({ query: "older", grouped: {} }),
    setup({ query: "Kelas & A", grouped: {} })]) {
    await expect(source.read()).rejects.toThrow();
    expect(source.disposed).toBe(true);
  }
});

test("person search binds visible profiles to a signed Student and honors scoped prefixes", async () => {
  const staff = { ...account, roles: ["murid", "tutor"] as const };
  expect(studentPeopleQuery("student: Ardi", account)).toBe("Ardi");
  expect(studentPeopleQuery("group: Ardi", account)).toBeNull();
  expect(studentPeopleQuery("Ardi", staff)).toBeNull();
  expect(studentPeopleQuery("x".repeat(81), account)).toBeNull();
  let released = false;
  const transport = {
    async request(path: string) {
      expect(path).toBe("/api/native/student/community/people?search=Ardi");
      return { ok: true, json: async () => [{ publicId: "allowed-id", displayName: "Ardi" },
        { publicId: "../admin", displayName: "Invalid" }], dispose: () => { released = true; } };
    }, assertCurrent() {},
  } as unknown as NativeSessionTransport;
  expect(await readSearchPeople(transport, "student: Ardi", account, sitemap, new AbortController().signal))
    .toEqual([{ title: "Ardi", href: "/students/allowed-id" }]);
  expect(released).toBe(true);
});

test("local search works before remote results and filters shortcuts by the installed destination", () => {
  const matches = localSearchHits("profil", account, sitemap);
  expect(matches.map(item => item.href)).toContain("/about");
  expect(matches.some(item => item.href.startsWith("/admin"))).toBe(false);
  const shortcuts = searchShortcuts(account, sitemap).map(item => item.href);
  expect(shortcuts).toContain("/id");
  expect(shortcuts).toContain("/plans");
  expect(shortcuts).not.toContain("/sign-in");
});

test("recent and favorite search links isolate accounts and omit sensitive handoffs", () => {
  const owner = { ...account, accountId: "a", sessionId: "s", dashboard: "/dashboard" } as const;
  const allowed = (href: string) => allowSavedLink(href, owner, sitemap);
  expect(allowed("/dashboard")).toBe(true);
  expect(allowed("/en/blog/news")).toBe(true);
  for (const path of ["/admin", "/forms/secret", "/meet/invite", "/unsubscribe?k=private", "/api/auth/session"]) expect(allowed(path)).toBe(false);
  expect(searchStorageKey("https://zyx.invalid", owner)).not.toBe(searchStorageKey("https://zyx.invalid", { ...owner, accountId: "b" }));
  let state: SavedLinks = { recent: [], favorites: [] };
  for (let i = 0; i < 10; i++) state = updateSavedLinks(state, "visit", { href: "/courses/" + i, title: String(i) });
  expect(state.recent).toHaveLength(8);
  const item = state.recent[1];
  state = updateSavedLinks(updateSavedLinks(state, "favorite", item), "visit", item);
  expect(state.recent[0]).toEqual(item);
  state = updateSavedLinks(state, "forget", item);
  expect(state.favorites).toEqual([item]);
  expect(updateSavedLinks(state, "favorite", item).favorites).toEqual([]);
  const raw = JSON.stringify({ ...state, recent: [{ title: "invalid", href: "/forms/private" }] });
  expect(readSavedLinks(raw, allowed)).toEqual({ recent: [], favorites: [item] });
});
