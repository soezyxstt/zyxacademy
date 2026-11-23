/**
 * lib/native/haptics.ts
 *
 * Meaningful native haptic feedback for Zyx Academy (Capacitor Haptics),
 * gated by a persisted user preference toggle (enabled by default).
 * Reserve haptics for key confirmations (flashcard rating, discussion post,
 * quiz submission, bookmark/save), never generic taps or navigation.
 */

import { getCapacitor } from "./runtime";

export const HAPTICS_STORAGE_KEY = "zyx-haptics-enabled";
export const DEFAULT_HAPTICS_ENABLED = true;

export type HapticImpactStyle = "LIGHT" | "MEDIUM" | "HEAVY";
export type HapticNotificationType = "SUCCESS" | "WARNING" | "ERROR";

const subscribers = new Set<() => void>();
let cachedEnabled: boolean | undefined;

export function parseHapticsPreference(serialized: string | null): boolean {
  if (serialized === null || serialized === "") return DEFAULT_HAPTICS_ENABLED;
  const normalized = serialized.trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  if (normalized === "true" || normalized === "1") return true;
  try {
    const parsed = JSON.parse(serialized);
    if (typeof parsed === "boolean") return parsed;
  } catch {
    // Ignore malformed values and fall back to default.
  }
  return DEFAULT_HAPTICS_ENABLED;
}

function readStoredPreference(): boolean {
  if (typeof window === "undefined") return DEFAULT_HAPTICS_ENABLED;
  try {
    return parseHapticsPreference(window.localStorage.getItem(HAPTICS_STORAGE_KEY));
  } catch {
    return DEFAULT_HAPTICS_ENABLED;
  }
}

export function getHapticsEnabled(): boolean {
  if (typeof window === "undefined") return DEFAULT_HAPTICS_ENABLED;
  if (cachedEnabled === undefined) {
    cachedEnabled = readStoredPreference();
  }
  return cachedEnabled;
}

function notifySubscribers() {
  subscribers.forEach((listener) => listener());
}

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== HAPTICS_STORAGE_KEY && event.key !== null) return;
  if (typeof window !== "undefined" && event.storageArea === window.localStorage) {
    cachedEnabled = readStoredPreference();
    notifySubscribers();
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  cachedEnabled = enabled;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
    } catch {
      // In-memory state still applies when localStorage is unavailable.
    }
  }
  notifySubscribers();
}

/** Reset module cache (used in unit tests). */
export function resetHapticsPreferenceCache(): void {
  cachedEnabled = undefined;
}

export function subscribeHapticsPreference(listener: () => void): () => void {
  if (typeof window !== "undefined" && subscribers.size === 0) {
    window.addEventListener("storage", handleStorageEvent);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (typeof window !== "undefined" && subscribers.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

export function isHapticsSupported(): boolean {
  const plugin = getCapacitor()?.Plugins?.Haptics;
  return Boolean(plugin && (plugin.impact || plugin.notification || plugin.selectionChanged));
}

export async function triggerHapticImpact(style: HapticImpactStyle = "LIGHT"): Promise<boolean> {
  if (!getHapticsEnabled()) return false;
  const plugin = getCapacitor()?.Plugins?.Haptics;
  if (!plugin?.impact) return false;
  try {
    await plugin.impact({ style });
    return true;
  } catch {
    return false;
  }
}

export async function triggerHapticNotification(
  type: HapticNotificationType = "SUCCESS",
): Promise<boolean> {
  if (!getHapticsEnabled()) return false;
  const plugin = getCapacitor()?.Plugins?.Haptics;
  if (!plugin) return false;
  try {
    if (plugin.notification) {
      await plugin.notification({ type });
      return true;
    }
    if (plugin.impact) {
      await plugin.impact({ style: type === "ERROR" ? "MEDIUM" : "LIGHT" });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function triggerHapticSelection(): Promise<boolean> {
  if (!getHapticsEnabled()) return false;
  const plugin = getCapacitor()?.Plugins?.Haptics;
  if (!plugin) return false;
  try {
    if (plugin.selectionChanged) {
      await plugin.selectionChanged();
      return true;
    }
    if (plugin.impact) {
      await plugin.impact({ style: "LIGHT" });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Subtle confirmation haptic for key completions (quiz submit, flashcard grade, discussion post). */
export function hapticSuccess(): Promise<boolean> {
  return triggerHapticNotification("SUCCESS");
}

/** Subtle confirmation haptic for bookmark or preference toggles. */
export function hapticSelection(): Promise<boolean> {
  return triggerHapticSelection();
}
