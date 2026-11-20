type Count = { unreadThreads: number; activeThreads: number };
export type DiscussionCounts = { total: Count; scopes: Record<"global" | "course" | "technical" | "academic", Count>; course: Count | null; channels?: Record<string, Count> };

const entries = new Map<string, { fingerprint: string; value: DiscussionCounts; expiresAt: number }>();
const ttl = 5 * 60 * 1000;
const limit = 256;

export function getCachedDiscussionCounts(key: string, fingerprint = key): DiscussionCounts | undefined {
 const entry = entries.get(key);
 if (!entry) return undefined;
 if (entry.expiresAt <= Date.now()) { entries.delete(key); return undefined; }
 if (entry.fingerprint !== fingerprint) return undefined;
 return structuredClone(entry.value);
}

export function cacheDiscussionCounts(key: string, value: DiscussionCounts, fingerprint = key) {
 for (const [existingKey, entry] of entries) if (entry.expiresAt <= Date.now()) entries.delete(existingKey);
 // shortcut: excess keys bypass admission until expiry, use a shared cache if process-local reuse is insufficient.
 if (!entries.has(key) && entries.size >= limit) return;
 entries.set(key, { fingerprint, value: structuredClone(value), expiresAt: Date.now() + ttl });
}
