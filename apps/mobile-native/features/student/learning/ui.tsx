import { useRef, type ComponentRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, useColorScheme, type TextStyle } from "react-native";
import idMessages from "../../../../../packages/native-parity/student/learning/messages-id.json";
import enMessages from "../../../../../packages/native-parity/student/learning/messages-en.json";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { useHasStudentCourseNavbar } from "../../../routing/student-course-chrome-context";
import type { StudentScreenProps } from "../contracts";
import { StudentListRow } from "../ListRow";

export type Translate = (key: string, values?: Record<string, string | number>) => string;
const bundles = { id: idMessages, en: enMessages };

export function english(locale: string) {
  return /^en(?:-|$)/i.test(locale);
}

export function translator(locale: string): Translate {
  const bundle = bundles[english(locale) ? "en" : "id"];
  return (key, values) => {
    let value: unknown = bundle;
    for (const segment of key.split(".")) {
      value = value && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined;
    }
    if (typeof value !== "string") return key;
    return value.replace(/\{(\w+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g, (whole, name, one, other) => {
      const amount = values?.[name];
      return typeof amount === "number" ? (amount === 1 ? one : other).replaceAll("#", String(amount)) : whole;
    }).replace(/\{(\w+)\}/g, (whole, name) => String(values?.[name] ?? whole));
  };
}

export function useLearningColors() {
  return nativeColors[useColorScheme() ?? "light"];
}

export function LearningPage({ props, title, children, footer, ready = true }: {
  props: StudentScreenProps; title: string; children: ReactNode; footer?: ReactNode; ready?: boolean;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const initialY = useRef(props.initialScrollY);
  const restored = useRef(initialY.current === 0);
  const colors = useLearningColors();
  const back = english(props.session.locale) ? "Back" : "Kembali";
  const courseNavbar = useHasStudentCourseNavbar();
  return (
    <View style={[styles.frame, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scroll}
        style={styles.frame}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!ready || restored.current) return;
          restored.current = true;
          scroll.current?.scrollTo({ y: initialY.current, animated: false });
        }}
        onScroll={(event) => { if (restored.current) props.onScrollY(event.nativeEvent.contentOffset.y); }}
        scrollEventThrottle={100}
      >
        <View style={styles.header}>
          {!courseNavbar && <Button onPress={props.back} variant="ghost" size="sm" style={{ alignSelf: "flex-start" }}>{back}</Button>}
          <Copy heading level={courseNavbar ? undefined : "title"}>{title}</Copy>
        </View>
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function Copy({ children, heading = false, muted = false, level, style }: {
  children: ReactNode; heading?: boolean; muted?: boolean; level?: "title"; style?: TextStyle;
}) {
  const colors = useLearningColors();
  return (
    <Text accessibilityRole={heading ? "header" : undefined} style={[
      styles.copy, nativeTypography.bodyRegular, { color: muted ? colors.mutedForeground : colors.foreground },
      heading && [nativeTypography.headingBold, styles.heading], level === "title" && styles.title, style,
    ]}>{children}</Text>
  );
}

export function Body({ source, centered = false, muted = false, paragraphStyle }: {
  source: string; centered?: boolean; muted?: boolean; paragraphStyle?: TextStyle;
}) {
  return (
    <View style={styles.body}>
      {source.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <Copy key={index} muted={muted}
        style={{ lineHeight: 23, textAlign: centered ? "center" : undefined, ...paragraphStyle }}>{paragraph}</Copy>)}
    </View>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={styles.section}>{title ? <Copy heading>{title}</Copy> : null}{children}</View>;
}

export function Row({ title, detail, value, onPress, children }: {
  title: string; detail?: string; value?: string; onPress?: () => void; children?: ReactNode;
}) {
  return (
    <StudentListRow title={title} subtitle={detail}
      metadata={value ? [{ id: "value", label: "", value }] : undefined}
      primary={onPress ? { onPress, role: "link" } : undefined}>
      {children}
    </StudentListRow>
  );
}

export function Message({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="alert" style={[styles.copy, nativeTypography.bodyRegular, { color: useLearningColors().mutedForeground }]}>{children}</Text>
      {action && onAction ? <Button variant="outline" onPress={onAction} style={styles.action}>{action}</Button> : null}
    </View>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const colors = useLearningColors();
  const amount = Math.min(100, Math.max(0, value));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: amount }}
    style={[styles.track, { backgroundColor: colors.muted }]}>
    <View style={[styles.track, { width: `${amount}%`, backgroundColor: colors.primary }]} />
  </View>;
}

export class RequestError extends Error {
  constructor(readonly status: number) { super(`Request failed (${status})`); }
}

export async function readJson<T>(request: StudentScreenProps["request"], path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  try {
    if (!response.ok) throw new RequestError(response.status);
    return await response.json() as T;
  } finally {
    response.dispose?.();
  }
}

export function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function formatDate(timestamp: string, locale: string) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(english(locale) ? "en" : "id", { dateStyle: "medium", timeStyle: "short" }).format(time)
    : "";
}

export function launchWeb(props: StudentScreenProps, path: string): boolean {
  if (!props.openExternal) return false;
  try {
    const origin = new URL(props.session.origin).origin;
    const url = new URL(path, origin);
    if (url.protocol !== "https:" && url.origin !== origin) return false;
    if (url.username || url.password) return false;
    props.openExternal(url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : url.href);
    return true;
  } catch {
    return false;
  }
}

export const styles = StyleSheet.create({
  frame: { flex: 1 },
  page: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32, gap: 20, width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { gap: 10 },
  copy: { flexShrink: 1, fontSize: 14, lineHeight: 21 },
  heading: { fontSize: 16, lineHeight: 23 },
  title: { fontSize: 23, lineHeight: 30 },
  section: { gap: 10 },
  body: { gap: 12 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11, gap: 8, minHeight: 44 },
  rowMain: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  action: { alignSelf: "flex-start", minHeight: 44 },
  field: { minHeight: 44 },
  track: { borderRadius: 4, height: 6 },
});
