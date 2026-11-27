import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import { NativePageOrnaments } from "../shared-ui/page-ornaments";

type Theme = keyof typeof nativeColors;

export function PublicFormPageFrame({ theme, insideSafeArea, ornamentOpacity, children }: {
  theme: Theme; insideSafeArea?: boolean; ornamentOpacity?: number; children: ReactNode;
}) {
  return <SafeAreaView edges={insideSafeArea ? [] : undefined} style={[styles.frame, { backgroundColor: nativeColors[theme].background }]}>
    <View style={styles.frame}>
      <NativePageOrnaments variant="plans" theme={theme} opacityScale={ornamentOpacity} />
      {children}
    </View>
  </SafeAreaView>;
}

type FormStatus = {
  theme: Theme; title: string; description: string; home: string; onHome(): void; notice?: ReactNode;
} & (
  | { kind: "missing" }
  | { kind: "closed"; label: string; recheck?: { label: string; run(): void } }
);

export function PublicFormStatus(props: FormStatus) {
  const { theme, title, description, home, onHome, notice } = props;
  const { width } = useWindowDimensions();
  const gutter = width >= 1024 ? 32 : width >= 640 ? 24 : 16;
  const colors = nativeColors[theme];
  const heading = <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>;
  const detail = <Text style={[styles.body, { color: colors.mutedForeground }]}>{description}</Text>;
  return <ScrollView style={styles.viewport} contentContainerStyle={[styles.centered, { paddingHorizontal: gutter }]}>
    <View style={[styles.group, props.kind === "closed" ? styles.closed : styles.missing]}>
      {notice}
      {props.kind === "closed" ? <>
        <View style={styles.badge}>
          <Text accessible accessibilityLabel={props.label} style={styles.badgeLabel}>{props.label}</Text>
        </View>
        {heading}
        <View style={[styles.policy, { borderColor: `${colors.border}66` }]}>{detail}</View>
      </> : <>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.destructive} strokeWidth={2} strokeLinecap="round">
            <Circle cx={12} cy={12} r={10} />
            <Path d="M12 8v4m0 4h.01" />
          </Svg>
        </View>
        <View style={styles.message}>{heading}{detail}</View>
      </>}
      <View style={styles.actions}>
        <Button variant="outline" accessibilityRole="link" testID="public-form-home" wrapLabel style={styles.action} onPress={onHome}>{home}</Button>
        {props.kind === "closed" && props.recheck &&
          <Button variant="ghost" testID="public-form-recheck" wrapLabel style={styles.action} onPress={props.recheck.run}>{props.recheck.label}</Button>}
      </View>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden" },
  viewport: { flex: 1 },
  centered: { flexGrow: 1, paddingVertical: 24, alignItems: "center", justifyContent: "center" },
  group: { alignItems: "center", width: "100%", gap: 16 },
  closed: { maxWidth: 512 },
  missing: { maxWidth: 448 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  message: { width: "100%", gap: 6 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 32, includeFontPadding: false, textAlign: "center" },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, includeFontPadding: false, textAlign: "center" },
  badge: { maxWidth: "100%", alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: nativeRadii.md, backgroundColor: `${nativeLinkInks.warning}1a` },
  badgeLabel: { ...nativeTypography.bodySemibold, fontSize: 10, lineHeight: 14, letterSpacing: 0.5, includeFontPadding: false, color: nativeLinkInks.warning, textAlign: "center", textTransform: "uppercase" },
  policy: { width: "100%", borderTopWidth: 1, paddingTop: 16 },
  actions: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  action: { height: "auto", minHeight: 32, paddingVertical: 5, maxWidth: "100%" },
});
