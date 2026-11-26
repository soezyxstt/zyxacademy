import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { nativeFontSources } from "../typography";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(nativeFontSources);

  if (fontError) {
    throw new Error("Font galeri tidak dapat dimuat.", { cause: fontError });
  }
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </SafeAreaProvider>
  );
}
