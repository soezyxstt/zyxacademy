import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";

export type TutorTheme = keyof typeof nativeColors;

export function Label({ theme, children, tone = "body" }: {
  theme: TutorTheme;
  children: ReactNode;
  tone?: "body" | "title" | "heading" | "strong" | "muted" | "error";
}) {
  const colors = nativeColors[theme];
  const heading = tone === "title" || tone === "heading";
  return <Text
    accessibilityRole={heading ? "header" : undefined}
    accessibilityLiveRegion={tone === "error" ? "polite" : undefined}
    style={[
      styles.text,
      { color: colors.foreground },
      tone === "title" && styles.title,
      tone === "heading" && styles.heading,
      tone === "strong" && nativeTypography.bodySemibold,
      tone === "muted" && { color: colors.mutedForeground, fontSize: 13 },
      tone === "error" && { color: colors.destructive },
    ]}
  >{children}</Text>;
}

export function TutorPage({ theme, title, subtitle, onBack, children }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack?: () => void; children: ReactNode;
}) {
  const colors = nativeColors[theme];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Header theme={theme} title={title} subtitle={subtitle} onBack={onBack} />
      {children}
    </ScrollView>
  );
}

function Header({ theme, title, subtitle, onBack }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack?: () => void;
}) {
  return <View style={styles.header}>
    {onBack ? (
      <Button
        theme={theme}
        variant="ghost"
        size="icon-lg"
        accessibilityLabel="Kembali"
        testID="tutor-back"
        style={styles.back}
        onPress={onBack}
        renderIcon={(color) => <Text accessible={false} style={{ color, fontSize: 25 }}>‹</Text>}
      />
    ) : null}
    <View style={{ flex: 1, gap: 2 }}>
      <Label theme={theme} tone="title">{title}</Label>
      {subtitle ? <Label theme={theme} tone="muted">{subtitle}</Label> : null}
    </View>
  </View>;
}

export function TutorDetail({ theme, title, subtitle, onBack, children, footer }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const colors = nativeColors[theme];
  return <Modal animationType="none" presentationStyle="fullScreen" onRequestClose={onBack}>
    <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.detailHeader, { borderColor: colors.border }]}>
        <Header theme={theme} title={title} subtitle={subtitle} onBack={onBack} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} style={{ flex: 1 }}>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderColor: colors.border }]}>{footer}</View> : null}
    </SafeAreaView>
  </Modal>;
}

export function Heading({ theme, title, count }: { theme: TutorTheme; title: string; count?: string }) {
  return <View style={styles.headingRow}>
    <Label theme={theme} tone="heading">{title}</Label>
    {count ? <Label theme={theme} tone="muted">{count}</Label> : null}
  </View>;
}

export function Row({ theme, title, subtitle, meta, onPress, children, testID }: {
  theme: TutorTheme; title: string; subtitle?: string; meta?: string; onPress?: () => void; children?: ReactNode; testID?: string;
}) {
  const colors = nativeColors[theme];
  const content = <>
    <View style={styles.rowText}>
      <Label theme={theme} tone="strong">{title}</Label>
      {subtitle ? <Label theme={theme} tone="muted">{subtitle}</Label> : null}
      {children}
    </View>
    {meta ? <Label theme={theme} tone="muted">{meta}</Label> : null}
    {onPress ? <Text accessible={false} style={[styles.chevron, { color: colors.mutedForeground }]}>›</Text> : null}
  </>;
  const style = [styles.row, { borderBottomColor: colors.border }];
  return onPress ? (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={({ pressed }) => [
      style,
      pressed && { backgroundColor: colors.muted + "50" },
    ]}>{content}</Pressable>
  ) : <View testID={testID} style={style}>{content}</View>;
}

export function Choices<T extends string>({ theme, options, value, change, label }: {
  theme: TutorTheme; options: readonly (readonly [T, string])[]; value: T; change: (value: T) => void; label: string;
}) {
  const colors = nativeColors[theme];
  return <ScrollView
    horizontal
    accessibilityLabel={label}
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ gap: 4 }}
  >
    {options.map(([id, title]) => (
      <Button
        key={id}
        accessibilityRole="tab"
        accessibilityState={{ selected: id === value }}
        variant={id === value ? "outline" : "ghost"}
        theme={theme}
        style={[
          styles.action,
          id === value && { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
        ]}
        onPress={() => change(id)}
      >{title}</Button>
    ))}
  </ScrollView>;
}

export function Empty({ theme, title, description }: { theme: TutorTheme; title: string; description?: string }) {
  return <View style={[styles.empty, { borderTopColor: nativeColors[theme].border }]}>
    <Label theme={theme} tone="strong">{title}</Label>
    {description ? <Label theme={theme} tone="muted">{description}</Label> : null}
  </View>;
}

export const tutorLayout = StyleSheet.create({
  group: { gap: 8 },
  cluster: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  action: { height: "auto", minHeight: 44, paddingVertical: 8 },
  tag: { borderRadius: nativeRadii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  input: { minHeight: 44 },
});

const styles = StyleSheet.create({
  ...tutorLayout,
  page: { width: "100%", maxWidth: 1000, alignSelf: "center", gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44 },
  back: { width: 44, height: 44, marginStart: -4 },
  detailHeader: { paddingHorizontal: 16, minHeight: 56, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, includeFontPadding: false },
  title: { ...nativeTypography.headingBold, fontSize: 23, lineHeight: 29 },
  heading: { ...nativeTypography.headingBold, fontSize: 17, lineHeight: 23, flexShrink: 1 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 28 },
  row: { flexDirection: "row", alignItems: "flex-start", minHeight: 48, paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 4, minWidth: 0 },
  chevron: { fontSize: 19, lineHeight: 21 },
  empty: { paddingTop: 20, paddingBottom: 14, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
});
