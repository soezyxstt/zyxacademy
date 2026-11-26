import { isAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { normalizeLocale } from "@/lib/i18n/locale";
import type { OfflineLocale } from "./sync-contract";

export interface OfflineCacheScope {
  userId: string;
  environment: string;
  locale: OfflineLocale;
  scopeKey: string;
}
export interface OfflineScopeToken { scope: OfflineCacheScope; generation: number }
const ACTIVE_SCOPE_KEY = "zyx:offline-active-scope:v2";
let current: OfflineCacheScope | null | undefined;
let generation = 0;
const listeners = new Set<() => void>();

export function createOfflineScope(userId: string, environment: string, locale: OfflineLocale): OfflineCacheScope {
  return { userId, environment, locale, scopeKey: JSON.stringify([environment, userId, locale]) };
}
export function browserOfflineScope(userId: string): OfflineCacheScope {
  return createOfflineScope(userId, typeof window !== "undefined" ? window.location?.origin ?? "" : "", normalizeLocale(typeof document !== "undefined" ? document.documentElement?.lang ?? "id" : "id") ?? "id");
}
export function setOfflineAccount(userId: string | null, locale?: OfflineLocale): void {
  const next = userId ? { ...browserOfflineScope(userId), ...(locale ? { locale } : {}) } : null;
  setOfflineScope(next ? createOfflineScope(next.userId, next.environment, next.locale) : null);
}
export function setOfflineScope(scope: OfflineCacheScope | null): void {
  if (current?.scopeKey === scope?.scopeKey && current !== undefined) return;
  current = scope;
  generation += 1;
  try {
    if (scope) window.localStorage.setItem(ACTIVE_SCOPE_KEY, JSON.stringify(scope));
    else window.localStorage.removeItem(ACTIVE_SCOPE_KEY);
  } catch { /* Storage may be unavailable. */ }
  for (const listener of listeners) listener();
}
export function getOfflineScope(userId?: string): OfflineCacheScope | null {
  if (current !== undefined) return current && (!userId || current.userId === userId) ? current : null;
  if (userId) return browserOfflineScope(userId);
  // A cold offline launch may use only the last verified account, never all users.
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(ACTIVE_SCOPE_KEY) ?? "null");
    if (raw && typeof raw === "object" && "userId" in raw && typeof raw.userId === "string" && "environment" in raw && raw.environment === window.location.origin && "locale" in raw && (raw.locale === "id" || raw.locale === "en")) {
      return createOfflineScope(raw.userId, raw.environment, raw.locale);
    }
  } catch { /* No previously verified scope. */ }
  return null;
}
export function captureOfflineScope(userId: string): OfflineScopeToken | null {
  const scope = getOfflineScope(userId);
  return scope ? { scope, generation } : null;
}
export function isOfflineScopeCurrent(token: OfflineScopeToken): boolean {
  return !isAccountTransitionPending() && token.generation === generation && getOfflineScope(token.scope.userId)?.scopeKey === token.scope.scopeKey;
}
export function subscribeOfflineScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function scopedReadingKey(scope: OfflineCacheScope, courseId: string, materialId: string): string {
  return `${scope.userId}::${encodeURIComponent(scope.environment)}::${scope.locale}::${courseId}::${materialId}`;
}

export function isOfflineAccountKnown(): boolean { return current !== undefined; }
