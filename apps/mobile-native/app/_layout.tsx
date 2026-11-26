import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { NativeAccountContextProvider } from "../auth/use-account-context";
import { NativeSessionProvider } from "../auth/session-provider";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { startNativeFileCacheLifecycle } from "../device/files";
import { NotificationsProvider } from "../device/notifications-provider";
import { LocalReminderLifecycle } from "../device/reminder-lifecycle";
import { OfflineMetadataProvider } from "../offline/lifecycle-provider";
import { nativeFontSources } from "../typography";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(nativeFontSources);
  useEffect(startNativeFileCacheLifecycle, []);

  if (fontError) {
    throw new Error("Font galeri tidak dapat dimuat.", { cause: fontError });
  }
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <NativeSessionProvider origin={NATIVE_STAGING_ORIGIN}>
        <NativeAccountContextProvider>
          <LocalReminderLifecycle />
          <NotificationsProvider>
            <OfflineMetadataProvider>
              <Stack screenOptions={{ headerShown: false, animation: "none" }} />
            </OfflineMetadataProvider>
          </NotificationsProvider>
        </NativeAccountContextProvider>
      </NativeSessionProvider>
    </SafeAreaProvider>
  );
}
