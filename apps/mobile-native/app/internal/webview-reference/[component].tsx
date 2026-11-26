import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { componentNames } from "../../../../../packages/ui-parity/gallery";

const origin = "http://127.0.0.1:3211";

export default function WebViewReferenceRoute() {
  const { component } = useLocalSearchParams<{ component: string }>();
  const selected = componentNames.find(name => name === component);
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== "1" || !selected || (Platform.OS !== "android" && Platform.OS !== "ios")) {
    return <Redirect href="/" />;
  }
  return <Reference key={selected} component={selected} />;
}

function Reference({ component }: { component: (typeof componentNames)[number] }) {
  const [failed, setFailed] = useState(false);
  const uri = `${origin}/?mobile-reference=${encodeURIComponent(component)}`;
  return (
    <SafeAreaView style={styles.screen}>
      {failed ? (
        <View style={styles.error}>
          <Text testID="mobile-webview-reference-error">Fixture WebView gagal dimuat.</Text>
        </View>
      ) : (
        <WebView
          testID="mobile-webview-reference"
          source={{ uri }}
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={request => request.url === uri}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  error: { flex: 1, justifyContent: "center", alignItems: "center" },
});
