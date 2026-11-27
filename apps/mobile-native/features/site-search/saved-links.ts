import type { NativeAccountContext } from "../../../../packages/native-session/context";
import type { NativeRouteNode } from "../../auth/login-intent";
import { normalizeExpoRouteHistory } from "../../routing/route-history";
import { publicWebsiteUrl } from "../../routing/public-website";

export type SearchLink = { title: string; href: string };
export type SavedLinks = { recent: SearchLink[]; favorites: SearchLink[] };

export function searchStorageKey(origin: string, account: NativeAccountContext) {
  return JSON.stringify(["native-site-search-v1", origin, account.accountId, [...account.roles].sort()]);
}

export function allowSavedLink(href: string, account: NativeAccountContext, sitemap: NativeRouteNode | null) {
  if (publicWebsiteUrl(href)) return !/[?#]/.test(href) && href.startsWith("/") && !/^\/(?:f|meet|forms|unsubscribe)(?:\/|$)/.test(href);
  return normalizeExpoRouteHistory(href, account, sitemap) === href;
}

export function readSavedLinks(raw: string | null, allowed: (href: string) => boolean): SavedLinks {
  const empty = { recent: [], favorites: [] };
  if (!raw) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("recent" in value) || !("favorites" in value)) return empty;
    function read(items: unknown): SearchLink[] {
      if (!Array.isArray(items)) return [];
      return items.flatMap(item => {
        if (!item || typeof item.title !== "string" || typeof item.href !== "string" || !allowed(item.href)) return [];
        return [{ title: item.title, href: item.href }];
      });
    }
    return { recent: read(value.recent).slice(0, 8), favorites: read(value.favorites) };
  } catch { return empty; }
}

export function updateSavedLinks(state: SavedLinks, action: "visit" | "forget" | "favorite", item: SearchLink): SavedLinks {
  const { href, title } = item;
  if (action === "favorite") {
    const rest = state.favorites.filter(link => link.href !== href);
    return { ...state, favorites: rest.length === state.favorites.length ? [{ href, title }, ...rest] : rest };
  }
  const rest = state.recent.filter(link => link.href !== href);
  return { ...state, recent: action === "visit" ? [{ href, title }, ...rest].slice(0, 8) : rest };
}
