export type CacheNamespace = "shared:" | "user:" | "session:";

class FakeCacheAdapter {
  private store = new Map<string, unknown>();

  public reset(): void {
    this.store.clear();
  }

  public async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    return item !== undefined ? (item as T) : null;
  }

  public async put(key: string, value: unknown, _ttlSeconds?: number): Promise<void> {
    this.store.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public has(key: string): boolean {
    return this.store.has(key);
  }
}

export const fakeCache = new FakeCacheAdapter();

export function assertNoStudentTextInSharedCache(
  key: string,
  value: unknown,
  studentIdentifiers: string[]
): void {
  if (!key.startsWith("shared:") && !key.startsWith("tutor:")) {
    // If explicit namespace check, pass unless key is intended to be shared
  }

  const rawPayload = JSON.stringify(value ?? {}).toLowerCase();
  const rawKey = key.toLowerCase();

  for (const identifier of studentIdentifiers) {
    if (!identifier) continue;
    const lowerIdentifier = identifier.toLowerCase();
    if (rawKey.includes(lowerIdentifier)) {
      throw new Error(`SHARED_CACHE_LEAK: Student identifier "${identifier}" found in shared cache key "${key}".`);
    }
    if (rawPayload.includes(lowerIdentifier)) {
      throw new Error(`SHARED_CACHE_LEAK: Student identifier "${identifier}" found in shared cache payload for key "${key}".`);
    }
  }
}
