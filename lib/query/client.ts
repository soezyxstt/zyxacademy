import { QueryClient, type QueryKey } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
        retry: false,
      },
      // Writes may grade an attempt, consume quota or add reading time. Never replay them automatically.
      mutations: { retry: false, networkMode: "always", gcTime: 0 },
    },
  });
}

let browserClient: QueryClient | undefined;
export function getQueryClient() {
  // Never share a server cache between requests. The browser instance survives initial suspension.
  if (typeof window === "undefined") return makeQueryClient();
  return browserClient ??= makeQueryClient();
}

export function isOtherAccountKey(key: QueryKey, userId: string | null): boolean {
  return key[0] === "zyx" && key[1] === "v1" && key[2] === "account" && key[3] !== userId;
}

export function removeOtherAccounts(client: QueryClient, userId: string | null) {
  // Removal cancels active queries. AbortSignal reaches fetch in every migrated query function.
  client.removeQueries({ predicate: (query) => isOtherAccountKey(query.queryKey, userId) });
}
