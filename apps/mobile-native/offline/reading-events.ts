const listeners = new Set<() => void>();

export function subscribeOfflineReadingChanges(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyOfflineReadingChanges() {
  for (const listener of listeners) listener();
}
