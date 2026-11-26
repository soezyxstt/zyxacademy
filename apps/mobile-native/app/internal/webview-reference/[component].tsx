import { Redirect, useLocalSearchParams } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { componentNames } from "../../../../../packages/ui-parity/gallery";
import { publicDirectoryReference } from "../../../features/parity/historical-public";
import { Reference, referenceOrigin } from "../../../features/parity/WebViewReference";

export default function WebViewReferenceRoute() {
  const { component } = useLocalSearchParams<{ component: string }>();
  const selected = componentNames.find(name => name === component);
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW !== "1" || (Platform.OS !== "android" && Platform.OS !== "ios")) {
    return <Redirect href="/" />;
  }
  if (selected) {
    const uri = `${referenceOrigin}/?mobile-reference=${encodeURIComponent(selected)}`;
    return (
      <SafeAreaView style={styles.screen}>
        <Reference key={selected} uri={uri} />
      </SafeAreaView>
    );
  }
  return publicDirectoryReference(component) ?? <Redirect href="/" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
});
