import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { PixelRatio, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewProps } from "react-native-webview";

import { directoryCases, directoryFrame } from "../../../../../packages/public-links/fixtures";
import { componentNames } from "../../../../../packages/ui-parity/gallery";
import { MarkedPageFrame } from "../../../features/parity/MarkedPageFrame";
import { directoryReadyScript } from "../../../features/parity/directory-ready";

const origin = "http://127.0.0.1:3211";
const directoryCaseIds = Object.keys(directoryCases) as (keyof typeof directoryCases)[];

export default function WebViewReferenceRoute() {
  const { component } = useLocalSearchParams<{ component: string }>();
  const selected = componentNames.find(name => name === component);
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== "1" || (Platform.OS !== "android" && Platform.OS !== "ios")) {
    return <Redirect href="/" />;
  }
  if (selected) {
    const uri = `${origin}/?mobile-reference=${encodeURIComponent(selected)}`;
    return (
      <SafeAreaView style={styles.screen}>
        <Reference key={selected} uri={uri} />
      </SafeAreaView>
    );
  }
  const directoryCase = directoryCaseIds.find(id => component === `directory-${id}`);
  if (Platform.OS === "android" && directoryCase && PixelRatio.get() === 1 && PixelRatio.getFontScale() === 1) {
    return <DirectoryReference key={directoryCase} caseId={directoryCase} />;
  }
  return <Redirect href="/" />;
}

function DirectoryReference({ caseId }: { caseId: keyof typeof directoryCases }) {
  const [ready, setReady] = useState(false);
  const uri = `${origin}/tautan/${caseId}`;
  const message = `directory-ready:${caseId}`;
  return (
    <MarkedPageFrame
      frame={directoryFrame}
      index={directoryCaseIds.indexOf(caseId)}
      markerColor={ready ? "#00f292" : "transparent"}
    >
      <Reference
        uri={uri}
        injectedJavaScript={directoryReadyScript(uri, caseId, message)}
        onMessage={({ nativeEvent }) => {
          // Android can report either the bridge's source origin or the full page URL.
          if ((nativeEvent.url === origin || nativeEvent.url === uri) && nativeEvent.data === message) setReady(true);
        }}
        onFailed={() => setReady(false)}
      />
    </MarkedPageFrame>
  );
}

function Reference({ uri, injectedJavaScript, onMessage, onFailed }: {
  uri: string;
  injectedJavaScript?: WebViewProps["injectedJavaScript"];
  onMessage?: WebViewProps["onMessage"];
  onFailed?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const fail = () => {
    setFailed(true);
    onFailed?.();
  };
  return failed ? (
    <View style={styles.error}>
      <Text testID="mobile-webview-reference-error">Fixture WebView gagal dimuat.</Text>
    </View>
  ) : (
    <WebView
      testID="mobile-webview-reference"
      source={{ uri }}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={request => request.url === uri}
      onError={fail}
      onHttpError={fail}
      injectedJavaScript={injectedJavaScript}
      onMessage={onMessage}
      incognito
      cacheEnabled={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      textZoom={100}
      scrollEnabled={false}
      style={styles.screen}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  error: { flex: 1, justifyContent: "center", alignItems: "center" },
});
