import type { SearchCategory } from "../../../../lib/search/contracts";
import { parseSearchQueryString } from "../../../../lib/search/parser";
import { STATIC_PAGES, LANDING_SUBJECTS, getSiteSearchShortcutIds } from "../../../../lib/site-search-index";
import { getSearchRelevanceScore, rankSearchDocuments } from "../../../../lib/search/ranking";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "../../auth/login-intent";
import type { NativeSessionTransport } from "../../network/transport";
import { publicWebsiteUrl } from "../../routing/public-website";

export const searchCategories = [
  ["Course & Modul", "courseModules"], ["Materi & Artikel", "materialsArticles"], ["Kuis & Evaluasi", "quizzesEvaluations"],
  ["Navigasi", "navigation"], ["Administrasi", "administration"],
] as const satisfies ReadonlyArray<readonly [SearchCategory, string]>;

export type SearchHit = { href: string; title: string; subtitle?: string; category: SearchCategory };
type SearchAccount = Pick<NativeAccountContext, "roles" | "locale">;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function searchDestination(path: unknown, account: SearchAccount, sitemap: NativeRouteNode | null) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
  const href = path === "/" ? "/" + account.locale : path;
  if (publicWebsiteUrl(href)) return href;
  return resolveNativeProtectedDestination(href, account, sitemap)?.href ?? null;
}

export async function readSearchHits(transport: NativeSessionTransport, query: string, account: SearchAccount,
  sitemap: NativeRouteNode | null, signal: AbortSignal): Promise<SearchHit[]> {
  const response = await transport.request("/api/search?" + new URLSearchParams({ q: query }), { signal });
  try {
    if (!response.ok) throw new Error("Search unavailable");
    const data = await response.json();
    transport.assertCurrent();
    if (!record(data) || data.query !== query || !record(data.grouped)) throw new Error("Invalid search response");
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const [category] of searchCategories) {
      const entries = data.grouped[category];
      if (!Array.isArray(entries)) throw new Error("Invalid search group");
      for (const entry of entries) {
        if (!record(entry) || !record(entry.metadata)) continue;
        const { title, subtitle } = entry.metadata;
        const href = searchDestination(entry.metadata.href, account, sitemap);
        if (!href || seen.has(href) || typeof title !== "string" || !title.trim()) continue;
        seen.add(href);
        hits.push({ category, href, title, subtitle: typeof subtitle === "string" ? subtitle : undefined });
      }
    }
    return rankSearchDocuments(parseSearchQueryString(query).cleanQuery || query, hits);
  } finally {
    response.dispose();
  }
}

export type SearchPerson = { href: string; title: string };

export function canSearchStudents(account: SearchAccount) {
  return account.roles.includes("murid") && !account.roles.includes("admin") && !account.roles.includes("tutor");
}

export function searchShortcuts(account: SearchAccount, sitemap: NativeRouteNode | null) {
  const ids = getSiteSearchShortcutIds();
  return STATIC_PAGES.flatMap((item, index) => {
    if (!ids.includes(`page:${index}:${item.href}`)) return [];
    const href = searchDestination(item.href, account, sitemap);
    return href ? [{ href, title: item.title, subtitle: item.subtitle }] : [];
  });
}

export function localSearchHits(raw: string, account: SearchAccount, sitemap: NativeRouteNode | null): SearchHit[] {
  const { cleanQuery, isScoped, entityType } = parseSearchQueryString(raw);
  if (!cleanQuery || raw === "?") return [];
  const matches = [...STATIC_PAGES, ...LANDING_SUBJECTS].flatMap(doc => {
    if (isScoped && (!entityType || !doc.href.includes(entityType))) return [];
    const score = getSearchRelevanceScore(cleanQuery, doc);
    if (score <= 0) return [];
    const href = searchDestination(doc.href, account, sitemap);
    if (!href) return [];
    const category: SearchCategory = doc.group.includes("Topik") ? "Course & Modul" : "Navigasi";
    return [{ href, category, title: doc.title, subtitle: doc.subtitle, score }];
  });
  const seen = new Set<string>();
  return matches.sort((left, right) => right.score - left.score).filter(item => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function studentPeopleQuery(raw: string, account: SearchAccount) {
  if (!canSearchStudents(account)) return null;
  const query = parseSearchQueryString(raw);
  if (query.isScoped && query.prefixType !== "user") return null;
  const term = query.cleanQuery;
  return term.length >= 2 && term.length <= 80 ? term : null;
}

export async function readSearchPeople(transport: NativeSessionTransport, term: string, account: SearchAccount,
  sitemap: NativeRouteNode | null, signal: AbortSignal): Promise<SearchPerson[]> {
  const query = studentPeopleQuery(term, account);
  if (!query) return [];
  const response = await transport.request("/api/native/student/community/people?" + new URLSearchParams({ search: query }), { signal });
  try {
    if (!response.ok) return [];
    const data = await response.json();
    transport.assertCurrent();
    if (!Array.isArray(data)) return [];
    return data.flatMap(person => {
      if (!record(person) || typeof person.publicId !== "string" || !/^[A-Za-z0-9_-]+$/.test(person.publicId)
        || typeof person.displayName !== "string" || !person.displayName.trim()) return [];
      const href = searchDestination("/students/" + person.publicId, account, sitemap);
      return href ? [{ href, title: person.displayName }] : [];
    });
  } finally {
    response.dispose();
  }
}
