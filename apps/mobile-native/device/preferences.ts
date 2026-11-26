export type NativeDeviceTheme = "light" | "dark" | "system";
type AppearanceOverride = "light" | "dark" | "auto";

export function createDevicePreferences({
  readTheme, saveTheme, applyAppearance, readHaptics, saveHaptics,
}: {
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
  let snapshot = { theme, haptics: readHaptics() };
  const listeners = new Set<() => void>();

  function applyTheme() {
    applyAppearance(snapshot.theme === "system" ? "auto" : snapshot.theme);
  }

  function publish(next: typeof snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    applyTheme,
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
