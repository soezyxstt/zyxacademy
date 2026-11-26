import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { publicFormCases } from "../../../../packages/forms/parity-cases";
import { meetingCaseIds } from "../../../../packages/meet/parity-cases";
import { directoryCases } from "../../../../packages/public-links/fixtures";
import { componentNames } from "../../../../packages/ui-parity/gallery";

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
        <Text accessibilityRole="header" style={styles.heading}>Daftar tautan</Text>
        {Object.keys(directoryCases).map(caseId => option("directory", caseId, { pathname: "/internal/public-links/[caseId]", params: { caseId } }))}
        <Text accessibilityRole="header" style={styles.heading}>Formulir publik</Text>
        {Object.keys(publicFormCases).map(caseId => option("public-forms", caseId, {
          pathname: "/internal/public-forms/[caseId]", params: { caseId, frame: "1" },
        }))}
        <Text accessibilityRole="header" style={styles.heading}>Google Meet</Text>
        {meetingCaseIds.map(caseId => option("meet", caseId, { pathname: "/internal/meet/[caseId]", params: { caseId } }))}
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
