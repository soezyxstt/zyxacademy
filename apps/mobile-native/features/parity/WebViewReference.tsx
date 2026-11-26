import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";

export const referenceOrigin = "http://127.0.0.1:3211";

export function Reference({ uri, injectedJavaScript, onMessage, onFailed }: {
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
