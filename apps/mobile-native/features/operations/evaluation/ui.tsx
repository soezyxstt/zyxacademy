import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { nativeTypography } from "../../../typography";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import type { EvaluationRequest } from "../../../../../packages/native-parity/operations/evaluation-contract";
import idEval from "../../../../../messages/id/adminEval.json";
import enEval from "../../../../../messages/en/adminEval.json";
import idOps from "../../../../../messages/id/adminOps.json";
import enOps from "../../../../../messages/en/adminOps.json";

export type Theme = keyof typeof nativeColors;
export type Locale = "id" | "en";
export type Presentation = {
  theme: Theme;
  locale: Locale;
  renderText?: (source: string, kind: "math" | "markdown") => ReactNode;
};

export const strings = (locale: Locale) => locale === "id" ? idEval : enEval;
export const inspectorStrings = (locale: Locale) => locale === "id" ? idOps : enOps;
export const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (token, key) => String(values[key] ?? token));
export const language = (locale: Locale, id: string, en: string) => locale === "id" ? id : en;

export function Heading({ children, theme }: { children: ReactNode; theme: Theme }) {
  return <Text accessibilityRole="header" style={[styles.heading, { color: nativeColors[theme].foreground }]}>{children}</Text>;
}

export function Copy({ children, theme, tone = "normal" }: { children: ReactNode; theme: Theme; tone?: "normal" | "muted" | "error" | "strong" }) {
  const colors = nativeColors[theme];
  const color = tone === "muted" ? colors.mutedForeground : tone === "error" ? colors.destructive : colors.foreground;
  return <Text style={[styles.copy, tone === "strong" && nativeTypography.bodySemibold, { color }]}>{children}</Text>;
}

export function Source({ source, kind = "math", presentation }: { source: string; kind?: "math" | "markdown"; presentation: Presentation }) {
  return presentation.renderText ? <>{presentation.renderText(source, kind)}</> : <Copy theme={presentation.theme}>{source}</Copy>;
}

export function Surface({ children, theme }: { children: ReactNode; theme: Theme }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.surface} style={{ backgroundColor: nativeColors[theme].background }}>{children}</ScrollView>;
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Section({ children, theme }: { children: ReactNode; theme: Theme }) {
  return <View style={[styles.section, { borderColor: nativeColors[theme].border }]}>{children}</View>;
}

export function Field({ label, theme, ...props }: React.ComponentProps<typeof Input> & { label: string; theme: Theme }) {
  return <View style={styles.field}><Copy theme={theme} tone="strong">{label}</Copy><Input {...props} theme={theme} accessibilityLabel={label} /></View>;
}

export function Choice<T extends string>({ label, options, value, onChange, theme }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  theme: Theme;
}) {
  const [open, setOpen] = useState(false);
  const name = options.find((item) => item.value === value)?.label ?? label;
  return (
    <View style={styles.field}>
      <Copy theme={theme} tone="strong">{label}</Copy>
      <Button theme={theme} variant="outline" disabled={options.length === 0} accessibilityLabel={label} accessibilityValue={{ text: name }} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}>{name}</Button>
      {open && <View style={styles.field}>
        {options.map((option) => <Button key={option.value} theme={theme} variant={value === option.value ? "default" : "ghost"} accessibilityState={{ selected: value === option.value }} onPress={() => { onChange(option.value); setOpen(false); }}>{option.label}</Button>)}
      </View>}
    </View>
  );
}

export const choices = <T extends { id: string; title: string }>(items: readonly T[]) =>
  items.map((item) => ({ value: item.id, label: item.title }));

export function Failure({ error, presentation, retry }: { error: unknown; presentation: Presentation; retry?: () => void }) {
  const { theme, locale } = presentation;
  const status = httpStatus(error);
  const message = status === 401 || status === 403
    ? language(locale, "Akses ditolak.", "Access denied.")
    : status === 404
      ? language(locale, "Halaman tidak ditemukan.", "Page not found.")
      : error instanceof Error && status === 400
        ? error.message
        : language(locale, "Permintaan gagal.", "The request failed.");
  return <View accessibilityLiveRegion="polite" style={styles.field}>
    <Copy theme={theme} tone="error">{message}</Copy>
    {retry && status !== 401 && status !== 403 && status !== 404 &&
      <Button theme={theme} variant="outline" onPress={retry}>{language(locale, "Coba lagi", "Try again")}</Button>}
  </View>;
}

export function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return;
  return typeof error.status === "number" ? error.status : undefined;
}

export type Resource<T> = { data?: T; error?: unknown; retry: () => void };

export function useRead<T>(request: EvaluationRequest, endpoint?: string): Resource<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ endpoint: string; attempt: number; request: EvaluationRequest; data?: T; error?: unknown }>();
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    let active = true;
    request<T>(endpoint, { signal: controller.signal }).then(
      (data) => { if (active) setResult({ endpoint, attempt, request, data }); },
      (error: unknown) => { if (active) setResult({ endpoint, attempt, request, error }); },
    );
    return () => { active = false; controller.abort(); };
  }, [request, endpoint, attempt]);
  const retry = () => setAttempt((value) => value + 1);
  return result?.endpoint === endpoint && result?.attempt === attempt && result?.request === request
    ? { data: result.data, error: result.error, retry }
    : { retry };
}

export function Load<T>({ resource, presentation, children }: { resource: Resource<T>; presentation: Presentation; children: (data: T) => ReactNode }) {
  if (resource.error) return <Failure error={resource.error} presentation={presentation} retry={resource.retry} />;
  if (resource.data === undefined) return <ActivityIndicator accessibilityLabel={language(presentation.locale, "Memuat", "Loading")} color={nativeColors[presentation.theme].primary} />;
  return <>{children(resource.data)}</>;
}

const styles = StyleSheet.create({
  surface: { gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  heading: { ...nativeTypography.headingBold, fontSize: 22, lineHeight: 28 },
  copy: { ...nativeTypography.bodyRegular, flexShrink: 1, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 8 },
  field: { gap: 4 },
});
