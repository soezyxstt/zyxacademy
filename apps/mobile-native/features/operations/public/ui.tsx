import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import id from "../../../../../messages/id/marketing.json";
import en from "../../../../../messages/en/marketing.json";
import type {
  PublicClient,
  PublicLocale,
  PublicTheme,
} from "../../../../../packages/native-parity/operations/public-contract";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";

export type PublicFile = { name: string; size: number };
export type PublicArticleRenderer = (props: { markdown: string; origin: string; onLink: (href: string) => void }) => ReactNode;

export type PublicScreenProps = {
  href: string;
  origin: string;
  locale: PublicLocale;
  theme?: PublicTheme;
  client: PublicClient;
  brandEmail?: string;
  onNavigate: (href: string) => void;
  onBack?: (fallback: string) => void;
  onOpenExternal?: (url: string) => void | Promise<void>;
  pickFiles?: () => Promise<PublicFile[] | null>;
  renderArticle?: PublicArticleRenderer;
};

type PublicContextValue = PublicScreenProps & {
  theme: PublicTheme;
  colors: (typeof nativeColors)[PublicTheme];
  copy: typeof id | typeof en;
  openExternal: (href: string) => void;
};

export const PublicContext = createContext<PublicContextValue | null>(null);

export function usePublic() {
  const context = useContext(PublicContext);
  if (!context) throw new Error("PublicScreen is required");
  return context;
}

export function textWith(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key]));
}

export function Label({ children, tone = "body", style, numberOfLines, live }: {
  children: ReactNode;
  tone?: "display" | "heading" | "subheading" | "body" | "muted" | "meta" | "error" | "link" | "inlineLink";
  style?: TextStyle;
  numberOfLines?: number;
  live?: "polite" | "assertive";
}) {
  const { colors } = usePublic();
  const ink = tone === "error" ? colors.destructive :
    tone === "link" || tone === "inlineLink" ? colors.primary :
      tone === "meta" || tone === "muted" ? colors.mutedForeground : colors.foreground;
  return <Text
    accessibilityRole={["display", "heading", "subheading"].includes(tone) ? "header" : undefined}
    accessibilityLiveRegion={live}
    numberOfLines={numberOfLines}
    style={[styles[tone], { color: ink }, style]}
  >{children}</Text>;
}

export function Hero({ title, description, centered = false, compact = false, children }: {
  title: string;
  description?: string;
  centered?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.hero, centered && styles.centered]}>
      <Label tone={compact ? "heading" : "display"} style={centered ? styles.centerText : undefined}>{title}</Label>
      {!!description && <Label tone="muted" style={centered ? styles.centerText : undefined}>{description}</Label>}
      {children}
    </View>
  );
}

export function Action({ children, href, external, onPress, variant = "outline", disabled, loading, id, accessibilityLabel, selected }: {
  children: string; href?: string; external?: boolean; onPress?: () => void;
  variant?: "default" | "outline" | "destructive" | "link" | "ghost" | "secondary";
  disabled?: boolean; loading?: boolean; id?: string; accessibilityLabel?: string; selected?: boolean;
}) {
  const { onNavigate, openExternal, theme } = usePublic();
  return <Button
    theme={theme}
    size="marketing"
    variant={variant}
    style={{ minHeight: 44 }}
    accessibilityRole={href ? "link" : "button"}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={selected === undefined ? undefined : { selected }}
    testID={id}
    disabled={disabled}
    isLoading={loading}
    onPress={onPress ?? (href ? () => external ? openExternal(href) : onNavigate(href) : undefined)}
  >{children}</Button>;
}

export function RowLink({ children, href, onPress, id, label, active, style, role = "link" }: {
  children: ReactNode; href?: string; onPress?: () => void; id?: string; label?: string;
  active?: boolean; style?: ViewStyle; role?: "link" | "button" | "tab";
}) {
  const { onNavigate, colors } = usePublic();
  const [focused, setFocused] = useState(false);
  return <Pressable
    accessibilityRole={role}
    accessibilityLabel={label}
    accessibilityState={active === undefined ? undefined : { selected: active }}
    testID={id}
    onPress={onPress ?? (href ? () => onNavigate(href) : undefined)}
    onFocus={() => setFocused(true)}
    onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.rowLink, pressed && { backgroundColor: colors.muted + "55" },
      focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: 1 }, style]}
  >{children}</Pressable>;
}

export function Divider() {
  const { colors } = usePublic();
  return <View importantForAccessibility="no" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} />;
}

export function Figure({ source, title, style }: { source: string | null; title?: string; style?: ViewStyle }) {
  const { origin, colors } = usePublic();
  const [failed, setFailed] = useState<string | null>(null);
  const url = safePublicAsset(source, origin);
  if (!url) return null;
  return (
    <View style={[styles.figure, { backgroundColor: colors.muted }, style]}>
      {failed !== url ? <Image
        source={{ uri: url }}
        accessibilityLabel={title}
        accessible={Boolean(title)}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        onError={() => setFailed(url)}
      /> : <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
        <Path d="M2 2l20 20M10.41 10.41a2 2 0 1 1-2.83-2.83M13.5 13.5 6 21m12-9 3 3M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59M21 15V5a2 2 0 0 0-2-2H9" stroke={colors.mutedForeground} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>}
    </View>
  );
}

function safePublicAsset(source: string | null, origin: string) {
  if (!source) return null;
  try {
    const uri = new URL(source, origin);
    return uri.protocol === "https:" || (uri.protocol === "http:" && uri.origin === new URL(origin).origin) ? uri.toString() : null;
  } catch {
    return null;
  }
}

type Resource<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

export function usePublicResource<T>(
  key: string,
  client: PublicClient,
  read: (client: PublicClient, signal: AbortSignal) => Promise<T>,
) {
  const [retryCount, setRetryCount] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; client: PublicClient; retry: number; resource: Resource<T> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const store = (resource: Resource<T>) => {
      if (!controller.signal.aborted) setSnapshot({ key, client, retry: retryCount, resource });
    };
    void Promise.resolve().then(() => read(client, controller.signal)).then(
      (value) => store({ status: "ready", value }),
      () => store({ status: "error" }),
    );
    return () => controller.abort();
    // The route key includes all inputs specific to this read.
  }, [key, client, retryCount]);
  return {
    resource: snapshot && snapshot.key === key && snapshot.client === client && snapshot.retry === retryCount
      ? snapshot.resource : { status: "loading" } as const,
    retry: () => setRetryCount((count) => count + 1),
  };
}

export function StatePanel({ kind, title, description, retry }: {
  kind: "loading" | "error" | "empty";
  title?: string; description?: string; retry?: () => void;
}) {
  const { colors, copy, locale } = usePublic();
  const localized = locale === "id";
  return <View style={[styles.state, { borderColor: colors.border }]} accessibilityState={{ busy: kind === "loading" }}>
    {kind === "loading" && <ActivityIndicator testID="operations-loading" color={colors.primary} />}
    <Label tone={kind === "loading" ? "meta" : "subheading"} live={kind === "error" ? "assertive" : "polite"}>
      {title ?? (kind === "loading" ? (localized ? "Memuat…" : "Loading…") : localized ? "Halaman belum tersedia." : "This page is unavailable.")}
    </Label>
    {!!description && <Label tone="muted">{description}</Label>}
    {!!retry && <Action onPress={retry} id="public-retry">{copy.home.quizTryAgain}</Action>}
  </View>;
}

export const layout = StyleSheet.create({
  stack: { gap: 16 },
  section: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  item: { gap: 6, minWidth: 0, flexShrink: 1 },
  panel: { borderWidth: 1, padding: 16, borderRadius: nativeRadii.lg, gap: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
});

const styles = StyleSheet.create({
  display: { ...nativeTypography.headingBold, fontSize: 46, lineHeight: 52 },
  heading: { ...nativeTypography.headingBold, fontSize: 32, lineHeight: 38 },
  subheading: { ...nativeTypography.headingBold, fontSize: 20, lineHeight: 26 },
  body: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 24 },
  muted: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  error: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21 },
  link: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20 },
  inlineLink: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 24, textDecorationLine: "underline" },
  hero: { paddingVertical: 24, gap: 10 },
  centered: { alignItems: "center" },
  centerText: { textAlign: "center" },
  rowLink: { minHeight: 44, justifyContent: "center" },
  figure: { aspectRatio: 16 / 9, borderRadius: nativeRadii.lg, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  state: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 20, gap: 10, alignItems: "flex-start" },
});
