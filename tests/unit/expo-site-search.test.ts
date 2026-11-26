import { expect, test } from "bun:test";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { readSearchHits, searchDestination, searchCategories } from "../../apps/mobile-native/features/site-search/results";
import type { NativeSessionTransport } from "../../apps/mobile-native/network/transport";

const account = { roles: ["murid"], locale: "id" } as const;
const sitemap: NativeRouteNode = { href: "/", contextKey: "", isInternal: false, isGenerated: false,
  children: ["/dashboard", "/courses/[id]", "/admin"].map(href => ({
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
