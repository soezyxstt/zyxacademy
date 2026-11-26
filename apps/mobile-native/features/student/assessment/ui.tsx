import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View, type TextStyle } from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../../../typography";
import { useHasStudentCourseNavbar } from "../../../routing/student-course-chrome-context";
import { Button } from "../../../components/Button";
import { CourseMarkdown } from "../CourseMarkdown";
import type { StudentScreenProps } from "../contracts";
import { StudentListRow } from "../ListRow";
import id from "../../../../../messages/id/learning.json";
import en from "../../../../../messages/en/learning.json";
import idCourse from "../../../../../messages/id/studentCourse.json";
import enCourse from "../../../../../messages/en/studentCourse.json";

export { Button };
export const AssessmentContext = createContext<StudentScreenProps | null>(null);
export function useAssessment() {
  const props = useContext(AssessmentContext);
  if (!props) throw new Error("Missing assessment context");
  return props;
}

export function useAssessmentCopy() {
  const { session } = useAssessment();
  const english = session.locale.toLowerCase().startsWith("en");
  const messages = english ? en : id;
  const tryout = english ? enCourse.tryout : idCourse.tryout;
  const tx = (indonesian: string, englishText: string) => english ? englishText : indonesian;
  const date = (value: string | null) => value ? new Date(value).toLocaleString(english ? "en" : "id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";
  return { messages, tryout, tx, date };
}

export const useAssessmentColors = () => nativeColors[useColorScheme() === "dark" ? "dark" : "light"];

export function fill(template: string, fields: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => key in fields ? String(fields[key]) : all);
}

export function Body({ children, tone = "normal", style }: { children: ReactNode; tone?: "normal" | "muted" | "error" | "primary"; style?: TextStyle }) {
  const colors = useAssessmentColors();
  const color = { normal: colors.foreground, muted: colors.mutedForeground, error: colors.destructive, primary: colors.primary }[tone];
  return <Text style={[styles.body, { color }, style]}>{children}</Text>;
}

export function Heading({ children, level = 2 }: { children: ReactNode; level?: 1 | 2 | 3 }) {
  const colors = useAssessmentColors();
  return <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }, level === 1 ? styles.pageHeading : level === 3 ? styles.smallHeading : undefined]}>{children}</Text>;
}

export function Frame({ title, subtitle, children, onBack, compactCourseHeader }: { title: string; subtitle?: string; children: ReactNode; onBack?: () => void; compactCourseHeader?: boolean }) {
  const props = useAssessment();
  const colors = useAssessmentColors();
  const { tx } = useAssessmentCopy();
  const courseNavbar = useHasStudentCourseNavbar();
  return <ScrollView keyboardShouldPersistTaps="handled" contentOffset={{ x: 0, y: props.initialScrollY }}
    onScroll={(event) => props.onScrollY(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32}
    style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    {compactCourseHeader && courseNavbar ? <Text accessibilityRole="header" style={[styles.compactTitle, { color: colors.foreground }]}>{title}</Text> : <>
      <Button variant="ghost" size="sm" style={styles.back} accessibilityLabel={tx("Kembali", "Back")} onPress={onBack ?? props.back}>{tx("‹ Kembali", "‹ Back")}</Button>
      <View style={styles.title}><Heading level={1}>{title}</Heading>{subtitle ? <Body tone="muted">{subtitle}</Body> : null}</View>
    </>}
    {children}
  </ScrollView>;
}

export function Section({ children, border = false }: { children: ReactNode; border?: boolean }) {
  const { border: color } = useAssessmentColors();
  return <View style={[styles.section, border && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color, paddingTop: 12 }]}>{children}</View>;
}

export function ButtonRow({ children }: { children: ReactNode }) { return <View style={styles.buttonRow}>{children}</View>; }

export function Row({ title, description, trailing, onPress, testID }: { title: string; description?: string; trailing?: string; onPress: () => void; testID?: string }) {
  return (
    <StudentListRow title={title} subtitle={description} testID={testID} titleRole="header"
      metadata={trailing ? [{ id: "status", label: "", value: trailing }] : undefined}
      primary={{ onPress, role: "link" }} />
  );
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  const colors = useAssessmentColors();
  return <View style={[styles.fact, { borderBottomColor: colors.border }]}><Body tone="muted" style={styles.factLabel}>{label}</Body><Body style={styles.value}>{value}</Body></View>;
}

export function Message({ title, detail, action, onPress, error = false }: { title: string; detail?: string; action?: string; onPress?: () => void; error?: boolean }) {
  return <View accessibilityLiveRegion={error ? "assertive" : "polite"} style={styles.section}>
    <Heading>{title}</Heading>
    {detail ? <Body tone={error ? "error" : "muted"}>{detail}</Body> : null}
    {action && onPress ? <Button size="sm" variant="outline" style={styles.back} onPress={onPress}>{action}</Button> : null}
  </View>;
}

export function Busy() {
  const colors = useAssessmentColors();
  const { tx } = useAssessmentCopy();
  return <ActivityIndicator accessibilityLabel={tx("Memuat", "Loading")} style={styles.busy} color={colors.primary} />;
}

export function Markdown({ value, allowLinks }: { value: string; allowLinks?: boolean }) {
  const props = useAssessment();
  return props.renderAssessmentMarkdown?.(value, props.route.params.id) ??
    <CourseMarkdown source={value} services={props} paragraphStyle={styles.body} allowLinks={allowLinks} />;
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 16 },
  title: { gap: 4 },
  compactTitle: { ...nativeTypography.headingSemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  back: { alignSelf: "flex-start" },
  section: { gap: 9 },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, includeFontPadding: false },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 23, includeFontPadding: false },
  pageHeading: { fontSize: 22, lineHeight: 29 },
  smallHeading: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 17 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  fact: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  factLabel: { flex: 1 },
  value: { flexShrink: 1, textAlign: "right", ...nativeTypography.bodySemibold },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  busy: { paddingVertical: 24 },
  option: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: nativeRadii.md },
  questionNumber: { width: 36, minHeight: 38, borderWidth: 1, borderRadius: nativeRadii.sm, alignItems: "center", justifyContent: "center" },
});
