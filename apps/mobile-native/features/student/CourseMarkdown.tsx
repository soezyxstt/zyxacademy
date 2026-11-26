import { useMemo, useState } from "react";
import { Image, Platform, StyleSheet, Text, View, useColorScheme, type TextStyle } from "react-native";
import { EnrichedMarkdownText, type MarkdownImageOccurrence, type MarkdownStyle } from "react-native-enriched-markdown";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { nativeTypography } from "../../typography";
import type { StudentServices } from "./contracts";
import { prepareCourseMarkdown, safeCourseMarkdownLink, safeInlineCourseImage } from "./course-markdown-model";

type Props = {
  source: string;
  services: Pick<StudentServices, "session" | "openExternal" | "devicePreferences">;
  centered?: boolean;
  muted?: boolean;
  paragraphStyle?: TextStyle;
  allowLinks?: boolean;
};

const flags = { latexMath: true, hardSoftBreaks: true };
function resolveImageSource({ url }: MarkdownImageOccurrence) {
  // Returning undefined makes the library request the authored URL.
  return { uri: safeInlineCourseImage(url) ?? "" };
}

function CourseImage({ uri, alt, label, style }: { uri?: string; alt: string; label: string; style: TextStyle }) {
  const [failed, setFailed] = useState(false);
  const fallback = alt ? `${label}. ${alt}` : label;
  if (!uri || failed) return <Text style={style}>{fallback}</Text>;
  return <Image source={{ uri }} accessibilityLabel={alt || label} resizeMode="contain" style={styles.image} onError={() => setFailed(true)} />;
}

/** Learner prose, formulas and code share a renderer. Raw authored input stays in the model. */
export function CourseMarkdown({ source, services, centered, muted, paragraphStyle, allowLinks = true }: Props) {
  const { canInteract } = useProtectedInteraction();
  const system = useColorScheme() ?? "light";
  const preferred = services.devicePreferences?.theme;
  const colors = nativeColors[preferred && preferred !== "system" ? preferred : system];
  const en = /^en(?:-|$)/i.test(services.session.locale);
  const { markdown, rich } = useMemo(() => prepareCourseMarkdown(source), [source]);
  const fontFamily = paragraphStyle?.fontFamily ?? nativeTypography.bodyRegular.fontFamily;
  const fontWeight = String(paragraphStyle?.fontWeight ?? nativeTypography.bodyRegular.fontWeight);
  const fontSize = paragraphStyle?.fontSize ?? 16;
  const lineHeight = paragraphStyle?.lineHeight ?? 23;
  const color = muted ? colors.mutedForeground : colors.foreground;
  const textAlign = centered ? "center" : "left";
  const plainStyle = useMemo<TextStyle>(() => ({
    ...paragraphStyle, fontFamily, fontSize, lineHeight, color, textAlign, includeFontPadding: false,
  }), [paragraphStyle, fontFamily, fontSize, lineHeight, color, textAlign]);
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const base = { color, fontSize, fontFamily, fontWeight, lineHeight };
    const heading = { ...base, fontFamily: nativeTypography.headingBold.fontFamily, fontWeight: "700", textAlign };
    return {
      paragraph: { ...base, textAlign, marginTop: 0, marginBottom: 8 },
      h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
      math: { color, fontSize, textAlign, backgroundColor: "transparent", marginTop: 4, marginBottom: 4, padding: 0 },
      inlineMath: { color }, link: { color: allowLinks ? colors.primary : color, underline: allowLinks },
      code: { color, backgroundColor: colors.muted },
      codeBlock: { ...base, fontFamily: nativeTypography.mono.fontFamily, backgroundColor: colors.muted, borderColor: colors.border,
        borderRadius: nativeRadii.md, borderWidth: 1, padding: 8 },
      blockquote: { ...base, borderColor: colors.border, backgroundColor: colors.muted },
      table: { ...base, headerBackgroundColor: colors.muted, headerTextColor: color,
        rowEvenBackgroundColor: colors.background, rowOddBackgroundColor: colors.muted, borderColor: colors.border },
    };
  }, [allowLinks, color, colors, fontSize, fontFamily, fontWeight, lineHeight, textAlign]);
  const renderers = useMemo(() => ({
    image: ({ url, altText }: { url: string; altText: string }) => <CourseImage key={url} uri={safeInlineCourseImage(url)}
      alt={altText} label={en ? "Image unavailable" : "Gambar belum dapat dimuat"} style={plainStyle} />,
    video: () => <Text style={plainStyle}>{en ? "Open the lesson on the web to view this video." : "Buka materi di web untuk melihat video ini."}</Text>,
  }), [en, plainStyle]);

  if (!rich || (Platform.OS !== "ios" && Platform.OS !== "android")) return <Text style={plainStyle}>{source}</Text>;
  return <View style={styles.body}>
    <EnrichedMarkdownText testID="student-rich-markdown" markdown={markdown} markdownStyle={markdownStyle} flavor="github"
      md4cFlags={flags} selectable={false} enableTaskListItemToggle={false} enableLinkPreview={false}
      renderers={renderers} resolveImageSource={resolveImageSource} onLinkPress={({ url }) => {
        if (!allowLinks || !services.openExternal || !canInteract()) return;
        const path = safeCourseMarkdownLink(url, services.session.origin);
        if (path) services.openExternal(path);
      }} />
  </View>;
}

const styles = StyleSheet.create({
  body: { width: "100%", minWidth: 0 },
  image: { width: "100%", height: 172, alignSelf: "center", marginVertical: 4 },
});
