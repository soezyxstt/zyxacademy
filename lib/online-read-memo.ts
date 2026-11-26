/** Bounded process-local memo for server projections whose callers own access checks. */
export function createOnlineReadMemo<T>(freshMs: number, maxEntries: number) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();

  return function read(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = entries.get(key);
    if (existing && now < existing.expires) return existing.value;
    entries.delete(key);

    const entry = {
      expires: now + freshMs,
      value: Promise.resolve().then(load),
    };
    entries.set(key, entry);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    void entry.value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.value;
  };
}
