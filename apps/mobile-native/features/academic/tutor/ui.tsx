import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewProps } from "react-native";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NativeListRow, NativeStatusPanel } from "../../shared-ui";

export type TutorTheme = keyof typeof nativeColors;

export function Label({ theme, children, tone = "body", compactTitle = false }: {
  theme: TutorTheme;
  children: ReactNode;
  tone?: "body" | "title" | "heading" | "strong" | "muted" | "error";
  compactTitle?: boolean;
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
      compactTitle && styles.dashboardTitle,
      tone === "heading" && styles.heading,
      tone === "strong" && nativeTypography.bodySemibold,
      tone === "muted" && { color: colors.mutedForeground, fontSize: 13 },
      tone === "error" && { color: colors.destructive },
    ]}
  >{children}</Text>;
}

export function TutorPage({ theme, title, subtitle, onBack, children, dashboard = false, header, contentStyle }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack?: () => void; children: ReactNode; dashboard?: boolean;
  header?: ReactNode; contentStyle?: ViewProps["style"];
}) {
  const colors = nativeColors[theme];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, dashboard && styles.dashboardPage, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {header ?? <Header theme={theme} title={title} subtitle={subtitle} onBack={onBack} compact={dashboard} />}
      {children}
    </ScrollView>
  );
}

function Header({ theme, title, subtitle, onBack, compact = false }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack?: () => void; compact?: boolean;
}) {
  return <View style={styles.header}>
    {onBack ? (
      <Button
        theme={theme}
        variant="outline"
        size="icon-lg"
        accessibilityLabel="Kembali"
        testID="tutor-back"
        style={styles.back}
        onPress={onBack}
        renderIcon={(color) => <Text accessible={false} style={{ color, fontSize: 19 }}>←</Text>}
      />
    ) : null}
    <View style={{ flex: 1, gap: 2 }}>
      <Label theme={theme} tone="title" compactTitle={compact}>{title}</Label>
      {subtitle ? <Label theme={theme} tone="muted">{subtitle}</Label> : null}
    </View>
  </View>;
}

const dashboardIcons = {
  sessions: "M16 14v2.2l1.6 1M16 2v4M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M3 10h5M8 2v4M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  teaching: "M21.42 10.92a1 1 0 0 0-.02-1.84l-8.57-3.9a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  attention: "M22 17a2 2 0 0 1-2 2H6.8L3.2 21.8A.7.7 0 0 1 2 21.3V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM12 15h.01M12 7v4",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6h4",
  check: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM9 12l2 2 4-4",
  arrow: "M7 7h10v10M7 17 17 7",
  plus: "M5 12h14M12 5v14",
} as const;

function DashboardIcon({ name, color, size = 16 }: { name: keyof typeof dashboardIcons; color: string; size?: number }) {
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24">
    <Path d={dashboardIcons[name]} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function DashboardSection({ theme, icon, title, count, scheduleLink, children }: {
  theme: TutorTheme; icon: "sessions" | "teaching" | "attention"; title: string;
  count?: string; scheduleLink?: { label: string; onPress: () => void }; children: ReactNode;
}) {
  const colors = nativeColors[theme];
  const [linkFocused, setLinkFocused] = useState(false);
  const warning = icon === "attention";

  return <View>
    <View style={[styles.dashboardSectionHeader, { borderColor: `${colors.border}66` }]}>
      <View style={styles.dashboardHeading}>
        <View style={styles.dashboardHeadingTitle}>
          <DashboardIcon name={icon} color={colors.mutedForeground} />
          <Text accessibilityRole="header" style={[styles.dashboardHeadingText, { color: colors.foreground }]}>{title}</Text>
        </View>
        {count ? <View style={styles.dashboardCount}>
          {warning ? <View style={styles.dashboardWarning} /> : null}
          <Text style={[styles.dashboardMeta, styles.dashboardCountText, warning ? nativeTypography.bodySemibold : nativeTypography.bodyMedium,
            { color: warning ? colors.foreground : colors.mutedForeground }]}>{count}</Text>
        </View> : null}
      </View>
      {scheduleLink ? <Pressable accessibilityRole="button" accessibilityLabel={scheduleLink.label} hitSlop={4}
        onFocus={() => setLinkFocused(true)} onBlur={() => setLinkFocused(false)} onPress={scheduleLink.onPress}
        style={({ pressed }) => [styles.dashboardScheduleLink, pressed && { opacity: 0.7 },
          linkFocused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: 2 }]}>
        <Text style={[styles.dashboardMeta, nativeTypography.bodySemibold, { color: colors.mutedForeground }]}>Semua jadwal</Text>
        <DashboardIcon name="arrow" color={colors.mutedForeground} size={14} />
      </Pressable> : null}
    </View>
    {children}
  </View>;
}

export function DashboardRow({ theme, title, subtitle, date, time, courseCode, course = false, divider, onPress, testID }: {
  theme: TutorTheme; title: string; subtitle: string; date?: string; time?: string; courseCode?: string; course?: boolean;
  divider: boolean; onPress: () => void; testID?: string;
}) {
  const colors = nativeColors[theme];
  const metaColor = { color: colors.mutedForeground };

  return <Pressable accessibilityRole="button" testID={testID} onPress={onPress} style={({ pressed }) => [
    styles.dashboardRow,
    divider && { borderTopWidth: 1, borderColor: `${colors.border}4d` },
    pressed && { backgroundColor: `${colors.muted}50` },
  ]}>
    <View style={[styles.dashboardRowBody, course ? styles.dashboardCourseBody : !date && styles.dashboardTicketBody]}>
      <View style={styles.dashboardRowTitle}>
        <Text style={[styles.dashboardBody, course && nativeTypography.headingBold, { color: colors.foreground }]}>{title}</Text>
        {courseCode ? <Text style={[styles.dashboardMeta, styles.dashboardCourseCode, metaColor]}>{courseCode}</Text> : null}
      </View>
      <Text style={[styles.dashboardMeta, metaColor]}>{subtitle}</Text>
    </View>
    {date ? <View style={styles.dashboardDate}>
      <Text style={[styles.dashboardBody, styles.dashboardDateText, { color: colors.foreground }]}>{date}</Text>
      {time ? <Text style={[styles.dashboardMeta, styles.dashboardDateText, metaColor]}>{time}</Text> : null}
    </View> : null}
    {course ? <View style={styles.dashboardCourseArrow}><DashboardIcon name="arrow" color={`${colors.mutedForeground}99`} /></View> : null}
  </Pressable>;
}

export function DashboardEmpty({ theme, icon, title, description, onAddSlot }: {
  theme: TutorTheme; icon: "clock" | "teaching" | "check"; title: string; description?: string; onAddSlot?: () => void;
}) {
  const colors = nativeColors[theme];

  return <View style={styles.dashboardEmpty}>
    <View style={[styles.dashboardEmptyMessage, onAddSlot && styles.dashboardEmptyWithAction]}>
      <DashboardIcon name={icon} color={colors.mutedForeground} />
      <View style={styles.dashboardRowBody}>
        <Text style={[styles.dashboardBody, { color: colors.foreground }]}>{title}</Text>
        {description ? <Text style={[styles.dashboardMeta, styles.dashboardEmptyDescription, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
    </View>
    {onAddSlot ? <Button theme={theme} variant="outline" size="sm" style={styles.dashboardAddSlot}
      onPress={onAddSlot} renderIcon={(color, size) => <DashboardIcon name="plus" color={color} size={size} />}>
      Tambah slot
    </Button> : null}
  </View>;
}

export function TutorDetail({ theme, title, subtitle, onBack, children, footer }: {
  theme: TutorTheme; title: string; subtitle?: string; onBack: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const { suspended, canInteract } = useProtectedInteraction();
  const colors = nativeColors[theme];
  const close = () => { if (canInteract()) onBack(); };
  return <Modal visible={!suspended} animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView accessibilityViewIsModal testID="tutor-detail" style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.detailHeader, { borderColor: colors.border }]}>
        <Header theme={theme} title={title} subtitle={subtitle} onBack={close} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} style={{ flex: 1 }}>
          {children}
        </ScrollView>
        {footer ? <View style={[styles.footer, { borderColor: colors.border }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
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
  theme: TutorTheme; title: string; subtitle?: string; meta?: string;
  onPress?: () => void; children?: ReactNode; testID?: string;
}) {
  const colors = nativeColors[theme];
  if (onPress && !children && !meta) {
    return <NativeListRow layout="compact" theme={theme} title={title} subtitle={subtitle}
      primary={{ onPress, testID }} />;
  }
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

export function Choices<T extends string>({ theme, options, value, change, label, tabBar = false, disabled = false }: {
  theme: TutorTheme; options: readonly (readonly [T, string])[]; value: T; change: (value: T) => void; label: string; tabBar?: boolean; disabled?: boolean;
}) {
  const colors = nativeColors[theme];
  return <ScrollView
    horizontal
    accessibilityLabel={label}
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    style={tabBar ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : undefined}
    contentContainerStyle={{ gap: 4 }}
  >
    {options.map(([id, title]) => (
      <Button
        key={id}
        accessibilityRole="tab"
        accessibilityState={{ selected: id === value }}
        disabled={disabled}
        variant={!tabBar && id === value ? "outline" : "ghost"}
        theme={theme}
        style={[
          styles.action,
          tabBar && styles.tab,
          id === value && (tabBar ? { borderBottomColor: colors.primary } : { borderColor: colors.primary, backgroundColor: colors.primary + "15" }),
        ]}
        onPress={() => change(id)}
      >{title}</Button>
    ))}
  </ScrollView>;
}

export function Empty({ theme, title, description }: { theme: TutorTheme; title: string; description?: string }) {
  return <View style={[styles.empty, { borderTopColor: nativeColors[theme].border }]}>
    <NativeStatusPanel theme={theme} title={title} message={description} />
  </View>;
}

export const tutorLayout = StyleSheet.create({
  group: { gap: 8 },
  cluster: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  action: { height: "auto", minHeight: 44, paddingVertical: 8 },
  sectionLink: { height: "auto", minHeight: 44, alignSelf: "flex-start", paddingHorizontal: 0 },
  dashboardSections: { gap: 32 },
  tag: { borderRadius: nativeRadii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  input: { minHeight: 44 },
});

const styles = StyleSheet.create({
  ...tutorLayout,
  page: { width: "100%", maxWidth: 1000, alignSelf: "center", gap: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  dashboardPage: { paddingTop: 4, gap: 20 },
  header: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44 },
  back: { width: 44, height: 44, marginStart: -4 },
  detailHeader: { paddingHorizontal: 16, minHeight: 56, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, includeFontPadding: false },
  title: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  dashboardTitle: { fontSize: 14, lineHeight: 21, marginLeft: -4 },
  heading: { ...nativeTypography.headingBold, fontSize: 17, lineHeight: 23, flexShrink: 1 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 28 },
  dashboardSectionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 8, paddingBottom: 8, borderBottomWidth: 1, marginBottom: 12 },
  dashboardHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 10, rowGap: 4, flexShrink: 1 },
  dashboardHeadingTitle: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  dashboardHeadingText: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 26, includeFontPadding: false, flexShrink: 1 },
  dashboardMeta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18, includeFontPadding: false },
  dashboardCount: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  dashboardCountText: { flexShrink: 1, fontVariant: ["tabular-nums"] },
  dashboardWarning: { backgroundColor: nativeLinkInks.warning, width: 8, height: 8, borderRadius: 4 },
  dashboardScheduleLink: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 36 },
  dashboardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 12 },
  dashboardRowBody: { flex: 1, minWidth: 0 },
  dashboardCourseBody: { gap: 2 },
  dashboardTicketBody: { gap: 4 },
  dashboardRowTitle: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2 },
  dashboardBody: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 21, includeFontPadding: false, flexShrink: 1 },
  dashboardDate: { maxWidth: "50%", alignItems: "flex-end" },
  dashboardDateText: { ...nativeTypography.bodyMedium, textAlign: "right", fontVariant: ["tabular-nums"] },
  dashboardCourseCode: { ...nativeTypography.bodyMedium, textTransform: "uppercase", letterSpacing: 0.6 },
  dashboardCourseArrow: { alignSelf: "center" },
  dashboardEmpty: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, paddingVertical: 8 },
  dashboardEmptyMessage: { flexDirection: "row", flexGrow: 1, flexShrink: 1, alignItems: "flex-start", gap: 12 },
  dashboardEmptyWithAction: { alignItems: "center", flexBasis: 208 },
  dashboardEmptyDescription: { marginTop: 12 },
  dashboardAddSlot: { height: 36, paddingStart: 10, paddingEnd: 10, marginLeft: "auto" },
  row: { flexDirection: "row", alignItems: "flex-start", minHeight: 48, paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 4, minWidth: 0 },
  chevron: { fontSize: 19, lineHeight: 21 },
  tab: { borderRadius: 0, borderWidth: 0, borderBottomWidth: 2 },
  empty: { borderTopWidth: StyleSheet.hairlineWidth },
});
