import { DEFAULT_APPEARANCE_PREFERENCES, parseAppearancePreferences, type AppearancePreferences } from "../../../lib/appearance-preferences";

export type NativeDeviceTheme = "light" | "dark" | "system";
type AppearanceOverride = "light" | "dark" | "auto";

export function createDevicePreferences({
  readTheme, saveTheme, applyAppearance, readHaptics, saveHaptics, readDisplay, saveDisplay,
}: {
  readDisplay?(): string | null;
  saveDisplay?(settings: string): void;
  readTheme(): string | null;
  saveTheme(theme: NativeDeviceTheme): void;
  applyAppearance(theme: AppearanceOverride): void;
  readHaptics(): boolean;
  saveHaptics(enabled: boolean): void;
}) {
  let theme: NativeDeviceTheme = "system";
  try {
    const stored = readTheme();
    if (stored === "light" || stored === "dark") theme = stored;
  } catch {
    // Follow the system if the device store is unavailable.
  }
  let appearance = DEFAULT_APPEARANCE_PREFERENCES;
  try { appearance = parseAppearancePreferences(readDisplay?.() ?? null); } catch { /* Use device defaults. */ }
  let snapshot = { theme, haptics: readHaptics(), appearance };
  const listeners = new Set<() => void>();

  function applyTheme() {
    applyAppearance(snapshot.theme === "system" ? "auto" : snapshot.theme);
  }

  function publish(next: typeof snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function saveAppearance(next: AppearancePreferences) {
    try { saveDisplay?.(JSON.stringify(next)); } catch { /* Honor this choice in memory. */ }
    publish({ ...snapshot, appearance: next });
  }
  return {
    applyTheme,
    setAppearance<K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]) {
      if (snapshot.appearance[key] !== value) saveAppearance({ ...snapshot.appearance, [key]: value });
    },
    restoreDisplay() {
      try { saveTheme("system"); } catch { /* Honor this choice in memory. */ }
      const next = { ...DEFAULT_APPEARANCE_PREFERENCES, toastPosition: snapshot.appearance.toastPosition };
      try { saveDisplay?.(JSON.stringify(next)); } catch { /* Honor this choice in memory. */ }
      publish({ ...snapshot, theme: "system", appearance: next });
      applyTheme();
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setTheme(value: NativeDeviceTheme) {
      if (value === snapshot.theme) return;
      try {
        saveTheme(value);
      } catch {
        // The app can honor the choice until it restarts.
      }
      publish({ ...snapshot, theme: value });
      applyTheme();
    },
    setHaptics(enabled: boolean) {
      if (enabled === snapshot.haptics) return;
      saveHaptics(enabled);
      publish({ ...snapshot, haptics: enabled });
    },
  };
}
