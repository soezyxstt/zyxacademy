import Storage from "expo-sqlite/kv-store";
import { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Appearance, Platform } from "react-native";

import { getHapticsEnabled, setHapticsEnabled } from "./haptics";
import { createDevicePreferences } from "./preferences";

import { NativeAppearance } from "./appearance";
import { APPEARANCE_STORAGE_KEY } from "../../../lib/appearance-preferences";

const themeKey = "zyx-native-theme";
const PreferencesContext = createContext<ReturnType<typeof createDevicePreferences> | null>(null);

export function DevicePreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences] = useState(() => createDevicePreferences({
    readDisplay: () => Storage.getItemSync(APPEARANCE_STORAGE_KEY),
    saveDisplay: value => Storage.setItemSync(APPEARANCE_STORAGE_KEY, value),
    readTheme: () => Storage.getItemSync(themeKey),
    saveTheme: theme => Storage.setItemSync(themeKey, theme),
    applyAppearance: theme => {
      if (Platform.OS === "android" || Platform.OS === "ios") Appearance.setColorScheme(theme);
    },
    readHaptics: getHapticsEnabled,
    saveHaptics: setHapticsEnabled,
  }));
  useLayoutEffect(preferences.applyTheme, [preferences]);
  const snapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot);
  return <PreferencesContext.Provider value={preferences}><NativeAppearance.Provider value={snapshot.appearance}>{children}</NativeAppearance.Provider></PreferencesContext.Provider>;
}

export function useDevicePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("Provider preferensi perangkat belum dipasang.");
  const snapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot);
  return useMemo(() => ({ ...snapshot, setTheme: preferences.setTheme, setHaptics: preferences.setHaptics, setAppearance: preferences.setAppearance, restoreDisplay: preferences.restoreDisplay }), [preferences, snapshot]);
}
