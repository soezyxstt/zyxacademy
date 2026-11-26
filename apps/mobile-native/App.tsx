import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import ParityGallery from "./ParityGallery";
import { nativeFontSources } from "./typography";

export default function App() {
  const [fontsLoaded, fontError] = useFonts(nativeFontSources);

  if (fontError) {
    throw new Error("Font galeri tidak dapat dimuat.", { cause: fontError });
  }
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <ParityGallery />
    </SafeAreaProvider>
  );
}
