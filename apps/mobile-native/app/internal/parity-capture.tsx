import { Fragment } from "react";
import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { componentNames } from "../../../../packages/ui-parity/gallery";
import { publicCaptureSections } from "../../features/parity/historical-public";

export default function ParityCaptureMenu() {
  const router = useRouter();
  if (process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION !== "1") return <Redirect href="/" />;

  function option(group: string, name: string, href: Href) {
    const id = `parity-capture-${group}-${name}`;
    return (
      <Pressable key={id} testID={id} accessibilityRole="button"
        style={styles.option} onPress={() => router.replace(href)}>
        <Text style={styles.label}>{name}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.menu}>
        <Text accessibilityRole="header" style={styles.heading}>Komponen</Text>
        {componentNames.map(component => option("gallery", component, { pathname: "/gallery/[component]", params: { component } }))}
        {publicCaptureSections.map(section => <Fragment key={section.group}>
          <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
          {section.items.map(item => option(section.group, item.name, item.href))}
        </Fragment>)}
        {process.env.EXPO_PUBLIC_PARITY_WEBVIEW === "1" && (
          <>
            <Text accessibilityRole="header" style={styles.heading}>WebView</Text>
            {componentNames.map(component => option("webview", component, {
              pathname: "/internal/webview-reference/[component]", params: { component },
            }))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: nativeColors.light.background },
  menu: { paddingHorizontal: 16 },
  heading: { color: nativeColors.light.foreground, fontSize: 16, fontWeight: "700", marginTop: 12 },
  option: { minHeight: 44, justifyContent: "center" },
  label: { color: nativeColors.light.foreground, fontSize: 14 },
});
