import * as SecureStore from "expo-secure-store";
import { fetch } from "expo/fetch";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { createExpoNativeTransport } from "../network/expo-transport";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN } from "./session-api";
import { createNativeSessionController } from "./session-controller";

const STORE_KEY = "zyx.staging.expo-session.v1";
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const session = createNativeSessionController({
  origin: NATIVE_STAGING_ORIGIN,
  api: createNativeSessionApi(NATIVE_STAGING_ORIGIN, fetch),
  dataTransport: createExpoNativeTransport(NATIVE_STAGING_ORIGIN),
  store: {
    read: () => SecureStore.getItemAsync(STORE_KEY, storeOptions),
    write: value => SecureStore.setItemAsync(STORE_KEY, value, storeOptions),
    remove: () => SecureStore.deleteItemAsync(STORE_KEY, storeOptions),
  },
});

const SessionContext = createContext<typeof session | null>(null);
const serverSnapshot = { state: { status: "loading" }, transport: null } as const;
const getServerSnapshot = () => serverSnapshot;

export function NativeSessionProvider({ children, origin }: { children: ReactNode; origin: string }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    void session.refresh();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void session.refresh();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (snapshot.state.status !== "signed-in") return;
    const delay = Math.min(2_147_483_647, Math.max(0, snapshot.state.expiresAt - Date.now()));
    const timeout = setTimeout(() => void session.refresh(), delay);
    return () => clearTimeout(timeout);
  }, [snapshot.state]);

  if (origin !== NATIVE_STAGING_ORIGIN) throw new Error("Origin sesi Expo tidak didukung.");
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useNativeSession() {
  const controller = useContext(SessionContext);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, getServerSnapshot);
  if (!controller) throw new Error("Provider sesi Expo belum dipasang.");
  return {
    ...snapshot,
    acceptLogin: controller.acceptLogin,
    logout: controller.logout,
    refresh: controller.refresh,
    subscribeBeforeLogout: controller.subscribeBeforeLogout,
  };
}
