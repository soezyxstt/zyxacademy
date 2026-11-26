import * as Haptics from "expo-haptics";
import Storage from "expo-sqlite/kv-store";

const preference = "zyx-haptics-enabled";
let enabled: boolean | undefined;
let lastSelection = -Infinity;

export function getHapticsEnabled(): boolean {
  if (enabled === undefined) {
    try {
      const stored = Storage.getItemSync(preference)?.trim().toLowerCase();
      enabled = stored !== "false" && stored !== "0";
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

export function setHapticsEnabled(value: boolean) {
  enabled = value;
  try {
    Storage.setItemSync(preference, String(value));
  } catch {
    // Keep honoring the current session preference when the device store is unavailable.
  }
}

export async function hapticSelection(): Promise<boolean> {
  const now = performance.now();
  if (!getHapticsEnabled() || now - lastSelection < 80) return false;
  lastSelection = now;
  try {
    await Haptics.selectionAsync();
    return true;
  } catch {
    return false;
  }
}
