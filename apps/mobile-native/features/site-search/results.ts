import type { SearchCategory } from "../../../../lib/search/contracts";
import { parseSearchQueryString } from "../../../../lib/search/parser";
import { rankSearchDocuments } from "../../../../lib/search/ranking";
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
