import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import marketingEn from "../../../../messages/en/marketing.json";
import marketingId from "../../../../messages/id/marketing.json";
import { DEFAULT_ICON, linkColor } from "../../../../lib/links";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { groupPublicLinks, type PublicLink } from "../../../../packages/public-links/directory";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import { openPublicLink } from "./client";
import { BrandSymbol } from "../shared-ui/navigation-icons";

export type DirectoryState = { status: "loading" | "error" } | { status: "ready"; links: PublicLink[] };
const recovery = {
  id: { load: "Daftar tautan gagal dimuat.", open: "Tautan gagal dibuka.", retry: "Coba lagi" },
  en: { load: "Could not load links.", open: "Could not open the link.", retry: "Try again" },
};

function DirectoryRow({ link, theme, errorText }: { link: PublicLink; theme: keyof typeof nativeColors; errorText: string }) {
  const colors = nativeColors[theme];
  const key = linkColor(link.color).key;
  const ink = key === "neutral" ? colors.mutedForeground : key === "brand" ? colors.brandPrimary : nativeLinkInks[key];
  const [failed, setFailed] = useState(false);
  return <View style={{ borderBottomWidth: 1, borderColor: colors.border + "99" }}>
    <Pressable accessibilityRole="link" accessibilityLabel={[link.title, link.description].filter(Boolean).join(". ")}
      onPress={async () => setFailed(!await openPublicLink(link.url, Linking.openURL))}
      style={styles.row}>
      <View style={[styles.tile, { backgroundColor: key === "neutral" ? colors.muted : ink + "1a", borderColor: ink + "26" }]}>
        <Text accessible={false} style={{ fontSize: 20, color: ink }}>{link.icon || DEFAULT_ICON}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.text, nativeTypography.bodySemibold, { color: colors.foreground }]}>{link.title}</Text>
        {!!link.description && <Text style={[styles.small, styles.description, { color: colors.mutedForeground }]}>{link.description}</Text>}
        {failed && <Text accessibilityRole="alert" style={[styles.small, { color: colors.destructive }]}>{errorText}</Text>}
      </View>
      <Svg accessible={false} width={16} height={16} viewBox="0 0 24 24" style={{ marginTop: 4 }}>
        <Path d="M7 17 17 7M7 7h10v10" fill="none" stroke={colors.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  </View>;
}

export function PublicDirectory({ state, retry, locale, theme: preference, insideSafeArea = false }: {
  insideSafeArea?: boolean; state: DirectoryState; retry(): void; locale: "id" | "en"; theme?: keyof typeof nativeColors;
}) {
  const systemTheme = useColorScheme();
  const theme = preference ?? (systemTheme === "dark" ? "dark" : "light");
  const colors = nativeColors[theme];
  const copy = (locale === "en" ? marketingEn : marketingId).tautan;
  const muted = { color: colors.mutedForeground };
  const fg = { color: colors.foreground };
  const groups = state.status === "ready" ? groupPublicLinks(state.links) : [];

  return <SafeAreaView edges={insideSafeArea ? [] : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Svg accessibilityRole="image" accessibilityLabel="Zyx Academy" width={54.4} height={32} viewBox="0 0 34 20">
            <BrandSymbol color={theme === "dark" ? "#F3F4F5" : "#2A3C6A"} />
          </Svg>
          <Text accessibilityRole="header" style={[styles.title, fg]}>{copy.title}</Text>
          <Text style={[styles.intro, muted]}>{copy.description}</Text>
        </View>
        {state.status === "loading" && <ActivityIndicator style={styles.section} color={colors.mutedForeground} />}
        {state.status === "error" && <View style={styles.empty}>
          <Text accessibilityRole="alert" style={[styles.text, fg]}>{recovery[locale].load}</Text>
          <Button onPress={retry} theme={theme}>{recovery[locale].retry}</Button>
        </View>}
        {state.status === "ready" && !groups.length && <View style={styles.empty}>
          <Svg accessible={false} width={20} height={20} viewBox="0 0 24 24">
            <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71m2.25 5.82a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke={colors.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text accessibilityRole="header" style={[styles.heading, fg]}>{copy.emptyTitle}</Text>
          <Text style={[styles.intro, { maxWidth: 320, marginTop: 0 }, muted]}>{copy.emptyDescription}</Text>
        </View>}
        {groups.map(group => <View key={group.label} style={styles.section}>
          {groups.length > 1 && <Text accessibilityRole="header" style={[styles.heading, { marginBottom: 12 }, fg]}>{group.label}</Text>}
          <View style={{ borderTopWidth: 1, borderColor: colors.border + "99" }}>
            {group.links.map(link => <DirectoryRow key={link.id} link={link} theme={theme} errorText={recovery[locale].open} />)}
          </View>
        </View>)}
        <Text style={[styles.small, styles.footer, muted]}>Zyx Academy</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center" },
  page: { width: "100%", maxWidth: 576, paddingHorizontal: 16, paddingVertical: 32 },
  header: { alignItems: "center" },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 32, marginTop: 12, textAlign: "center" },
  intro: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 384, textAlign: "center" },
  section: { marginTop: 32 }, empty: { paddingVertical: 32, alignItems: "center", gap: 8 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 24 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 12 },
  tile: { borderRadius: nativeRadii.lg, marginTop: 2, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  rowBody: { flex: 1, minWidth: 0 }, text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  small: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16 }, description: { marginTop: 2, lineHeight: 18 },
  footer: { marginTop: 24, paddingVertical: 12, textAlign: "center" },
});
