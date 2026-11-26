import * as SecureStore from "expo-secure-store";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { fetch } from "expo/fetch";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { createNativeConnectivity, initialConnectivity } from "../device/connectivity";
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

export const nativeConnectivity: ReturnType<typeof createNativeConnectivity> = createNativeConnectivity({
  reverify(reason) {
    const snapshot = session.getSnapshot();
    if (reason === "first-online" && !snapshot.revalidating &&
      snapshot.state.status !== "loading" && snapshot.state.status !== "unavailable") return;
    void session.refreshAfterRecovery(() => {
      const { foreground, online } = nativeConnectivity.getSnapshot();
      return foreground && online === true;
    });
  },
});
const getServerConnectivity = () => initialConnectivity;

export function useNativeConnectivity() {
  return useSyncExternalStore(nativeConnectivity.subscribe, nativeConnectivity.getSnapshot, getServerConnectivity);
}

const SessionContext = createContext<typeof session | null>(null);
const serverSnapshot: ReturnType<typeof session.getSnapshot> = {
  state: { status: "loading" }, transport: null, revalidating: false,
};
const getServerSnapshot = () => serverSnapshot;

export function NativeSessionProvider({ children, origin }: { children: ReactNode; origin: string }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    let active = true;
    let networkChanged = false;
    const network = addNetworkStateListener(state => {
      if (!active) return;
      networkChanged = true;
      nativeConnectivity.updateNetwork(state);
    });
    const app = AppState.addEventListener("change", state => nativeConnectivity.updateForeground(state === "active"));
    nativeConnectivity.updateForeground(!AppState.currentState || AppState.currentState === "active");
    void getNetworkStateAsync().then(state => {
      if (active && !networkChanged) nativeConnectivity.updateNetwork(state);
    }).catch(() => {});
    return () => {
      active = false;
      app.remove();
      network.remove();
      nativeConnectivity.updateForeground(false);
    };
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
    getSnapshot: controller.getSnapshot,
    getPendingRefresh: controller.getPendingRefresh,
    subscribeSession: controller.subscribe,
    acceptLogin: controller.acceptLogin,
    listSavedAccounts: controller.listSavedAccounts,
    switchSavedAccount: controller.switchSavedAccount,
    removeSavedAccount: controller.removeSavedAccount,
    acceptAdditionalLogin: controller.acceptAdditionalLogin,
    clearLoginIntent: controller.clearLoginIntent,
    rememberAccountAccess: controller.rememberAccountAccess,
    logout: controller.logout,
    refresh: controller.refresh,
    subscribeBeforeLogout: controller.subscribeBeforeLogout,
    subscribeBeforeLocalLogout: controller.subscribeBeforeLocalLogout,
  };
}
