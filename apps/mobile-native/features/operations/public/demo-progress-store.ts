import Storage from "expo-sqlite/kv-store";
import {
  addDemoEvent, emptyOverlay, overlayKey, parseOverlay, type DemoEvent, type DemoOverlay,
} from "../../../../../lib/demo/session-overlay";

const overlays = new Map<string, DemoOverlay>();

export function readNativeDemoProgress(courseId: string, revision: string) {
  const key = overlayKey(courseId, revision);
  const cached = overlays.get(key);
  if (cached) return cached;
  let overlay = emptyOverlay();
  try {
    overlay = parseOverlay(Storage.getItemSync(key));
  } catch {
    // The current demo session can continue if device storage is unavailable.
  }
  overlays.set(key, overlay);
  return overlay;
}

function saveNativeDemoProgress(courseId: string, revision: string, overlay: DemoOverlay) {
  const key = overlayKey(courseId, revision);
  overlays.set(key, overlay);
  try {
    Storage.setItemSync(key, JSON.stringify(overlay));
  } catch {
    // Keep progress available for the current session.
  }
  return overlay;
}

export function recordNativeDemoProgress(courseId: string, revision: string, event: DemoEvent) {
  const current = readNativeDemoProgress(courseId, revision);
  const next = addDemoEvent(current, event);
  return next === current ? current : saveNativeDemoProgress(courseId, revision, next);
}

export function resetNativeDemoProgress(courseId: string, revision: string) {
  return saveNativeDemoProgress(courseId, revision, emptyOverlay());
}
