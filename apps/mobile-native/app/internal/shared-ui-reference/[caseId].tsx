import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { PixelRatio, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { sharedUiRelativeCases } from "../../../../../packages/native-parity/shared-ui/relative-cases";
import { Reference, referenceOrigin } from "../../../features/parity/WebViewReference";
import { sharedUiReferenceScript } from "../../../features/shared-ui/reference-ready";

export default function SharedUiReferenceRoute() {
  const { caseId, capture } = useLocalSearchParams<{ caseId: string; capture?: string }>();
  const fixture = sharedUiRelativeCases.find(item => item.id === caseId);
  const dimensions = typeof capture === "string" ? /^(\d{2,4})x(\d{2,4})\.([0-9a-f]{40})$/.exec(capture) : null;
  if (process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION !== "1" || process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== "1"
    || Platform.OS !== "android" || PixelRatio.get() !== 1 || PixelRatio.getFontScale() !== 1
    || !fixture || !dimensions) return <Redirect href="/" />;
  return <SharedUiReference key={JSON.stringify([caseId, capture])} fixture={fixture} build={dimensions[3]}
    width={Number(dimensions[1])} height={Number(dimensions[2])} />;
}

function SharedUiReference({ fixture, build, width, height }: {
  fixture: (typeof sharedUiRelativeCases)[number]; build: string; width: number; height: number;
}) {
  const [ready, setReady] = useState(false);
  const uri = `${referenceOrigin}/${fixture.id}`;
  return <SafeAreaView style={styles.screen}>
    <Reference uri={uri} injectedJavaScript={sharedUiReferenceScript(fixture, uri, build, width, height)}
      onFailed={() => setReady(false)}
      onMessage={({ nativeEvent }) => {
        if ((nativeEvent.url === uri || nativeEvent.url === referenceOrigin)
          && nativeEvent.data === `shared-ui-ready:${fixture.id}`) setReady(true);
      }} />
    {ready && <View accessible collapsable={false} pointerEvents="none" style={styles.marker}
      testID={`shared-ui-webview-ready-${fixture.id}-${width}x${height}`} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  marker: { position: "absolute", left: 24, top: 48, width: 2, height: 2 },
});
