import { environmentManager, QueryClient } from "@tanstack/react-query";
import { retryQuery } from "./http";
import { queryAccountId } from "./keys";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: retryQuery,
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

/** Server requests never share a cache; browser renders retain one client. */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return createQueryClient();
  return browserClient ??= createQueryClient();
}

const accounts = new WeakMap<QueryClient, string | null>();
const accountListeners = new WeakMap<QueryClient, Set<() => void>>();

export function subscribeQueryAccount(client: QueryClient, listener: () => void): () => void {
  const listeners = accountListeners.get(client) ?? new Set<() => void>();
  accountListeners.set(client, listeners);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Call only for a confirmed session result, never a transient pending state. */
export function syncQueryAccount(client: QueryClient, userId: string | null): void {
  if (accounts.has(client) && accounts.get(client) === userId) return;
  accounts.set(client, userId);
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) => {
      const owner = queryAccountId(query.queryKey);
      return owner !== undefined && owner !== userId;
    },
  };
  void client.cancelQueries(filters);
  client.removeQueries(filters);
  for (const mutation of client.getMutationCache().getAll()) {
    const owner = queryAccountId(mutation.options.mutationKey ?? []);
    if (owner !== undefined && owner !== userId) client.getMutationCache().remove(mutation);
  }
  if (typeof window !== "undefined" && (userId !== null || navigator.onLine !== false)) {
    void import("@/lib/offline/reading-cache")
      .then(({ clearOfflineReadingsForOtherUsers }) => clearOfflineReadingsForOtherUsers(userId))
      .catch(() => {});
  }
  for (const listener of accountListeners.get(client) ?? []) listener();
}

export function isQueryAccountCurrent(client: QueryClient, userId: string): boolean {
  return !accounts.has(client) || accounts.get(client) === userId;
}
