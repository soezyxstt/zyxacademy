/** One origin-scoped database owns reading packages and metadata snapshots. */
export const OFFLINE_DB_NAME = "zyx-offline-readings-v1";
export const OFFLINE_DB_VERSION = 2;
export const READING_STORE = "readings";
const STATE_STORE = "state";
export function isOfflineStorageSupported(): boolean { return typeof window !== "undefined" && typeof indexedDB !== "undefined"; }
export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isOfflineStorageSupported()) { reject(new Error("indexeddb_unavailable")); return; }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(READING_STORE)) {
        const store = db.createObjectStore(READING_STORE, { keyPath: "key" });
        store.createIndex("by_user", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}
export async function readOfflineState<T>(key: string): Promise<T | null> {
  if (!isOfflineStorageSupported()) return null;
  const db = await openOfflineDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STATE_STORE, "readonly").objectStore(STATE_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function writeOfflineState(key: string, value: unknown, isCurrent: () => boolean = () => true): Promise<boolean> {
  if (!isOfflineStorageSupported() || !isCurrent()) return false;
  const db = await openOfflineDb();
  try {
    if (!isCurrent()) return false;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, "readwrite");
      tx.objectStore(STATE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } finally { db.close(); }
}
export async function clearOfflineStateExcept(scopeKey: string | null): Promise<void> {
  if (!isOfflineStorageSupported()) return;
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STATE_STORE, "readwrite");
      const store = tx.objectStore(STATE_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!scopeKey || !String(cursor.key).endsWith(`:${scopeKey}`)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
