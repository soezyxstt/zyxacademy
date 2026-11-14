import { addDemoEvent, emptyOverlay, overlayKey, parseOverlay, type DemoEvent, type DemoOverlay } from "@/lib/demo/session-overlay";

type Scope = { courseId: string; revision: string };
type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Change = { kind: "update" | "reset" | "invalidate"; keys: readonly string[] | null };

/** One instance per browser tab, never shared by server requests. */
export function createDemoOverlayStore(storage: StorageAccess) {
  const overlays = new Map<string, DemoOverlay>();
  // Keep local changes if storage is unavailable, including a failed reset.
  const dirty = new Set<string>();
  const stale = new Set<string>();
  const listeners = new Set<(change: Change) => void>();
  const notify = (change: Change) => listeners.forEach(listener => listener(change));

  function read(scope: Scope): DemoOverlay {
    const key = overlayKey(scope.courseId, scope.revision);
    const cached = overlays.get(key);
    if (cached && (dirty.has(key) || !stale.has(key))) return cached;
    let value: DemoOverlay;
    try { value = parseOverlay(storage().getItem(key)); } catch { return cached ?? emptyOverlay(); }
    stale.delete(key);
    overlays.set(key, value);
    return value;
  }

  function record(scope: Scope, event: DemoEvent): void {
    const key = overlayKey(scope.courseId, scope.revision);
    if (!dirty.has(key)) stale.add(key);
    const current = read(scope);
    const next = addDemoEvent(current, event);
    if (next === current) return;
    stale.delete(key);
    overlays.set(key, next);
    try { storage().setItem(key, JSON.stringify(next)); dirty.delete(key); } catch { dirty.add(key); }
    notify({ kind: "update", keys: [key] });
  }

  function reset(scopes: readonly Scope[]): void {
    const keys = scopes.map(scope => overlayKey(scope.courseId, scope.revision));
    for (const key of keys) {
      stale.delete(key);
      overlays.set(key, emptyOverlay());
      try { storage().removeItem(key); dirty.delete(key); } catch { dirty.add(key); }
    }
    notify({ kind: "reset", keys });
  }

  function invalidate(key: string | null): void {
    const keys = key === null ? [...overlays.keys()] : [key];
    for (const item of keys) if (!dirty.has(item)) stale.add(item);
    notify({ kind: "invalidate", keys: key === null ? null : [key] });
  }

  return {
    read, record, reset, invalidate,
    subscribe(listener: (change: Change) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

type DemoOverlayStore = ReturnType<typeof createDemoOverlayStore>;
let browserStore: DemoOverlayStore | undefined;

export function getBrowserDemoOverlayStore(): DemoOverlayStore {
  if (typeof window === "undefined") throw new Error("Demo overlay store requires a browser");
  if (!browserStore) {
    const store = createDemoOverlayStore(() => window.localStorage);
    window.addEventListener("storage", event => {
      try {
        if (event.storageArea === window.localStorage && (event.key === null || event.key.startsWith("zyx-demo:1:"))) store.invalidate(event.key);
      } catch { /* Storage may be unavailable. */ }
    });
    window.addEventListener("pageshow", event => {
      if (event.persisted) store.invalidate(null);
    });
    browserStore = store;
  }
  return browserStore;
}
