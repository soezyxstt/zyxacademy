import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { previewExternalHref, previewMedia, type MarkdownPreviewAudience, type MarkdownPreviewMedia } from "../../../../packages/native-parity/operations/admin-markdown-media";
import { splitMarkdownPreview, type MarkdownPreviewBlock } from "../../../../packages/native-parity/operations/admin-markdown-preview";
import { Button } from "../../components/Button";
import { scopedFiles } from "../../device/files";
import type { NativeSessionTransport } from "../../network/transport";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { nativeTypography } from "../../typography";
import { CourseVideoDialog } from "../course-video/CourseVideoDialog";
import { CourseMarkdown } from "../student/CourseMarkdown";
import { AdminMarkdownDiagram } from "./AdminMarkdownDiagram";
import { SharedDialog } from "./overlays";

const labels = {
  en: {
    image: "View image", video: "Play video", youtube: "Play YouTube video", source: "Source",
    missing: "This media cannot be opened.", failed: "The image could not be loaded.", retry: "Try again",
    close: "Close", loading: "Loading image", diagram: "Diagram", unsupported: "This diagram cannot be drawn in the app.",
    more: "Show more of the document",
  },
  id: {
    image: "Lihat gambar", video: "Putar video", youtube: "Putar video YouTube", source: "Sumber",
    missing: "Media ini tidak dapat dibuka.", failed: "Gambar belum dapat dimuat.", retry: "Coba lagi",
    close: "Tutup", loading: "Memuat gambar", diagram: "Diagram", unsupported: "Diagram ini belum dapat digambar di aplikasi.",
    more: "Tampilkan bagian berikutnya",
  },
} as const;
const pageSize = 12;

type PreviewProps = {
  source: string;
  previewBlocks?: readonly MarkdownPreviewBlock[];
  audience: MarkdownPreviewAudience;
  origin: string;
  theme: keyof typeof nativeColors;
  locale: "en" | "id";
  session?: NativeSessionTransport | null;
  openExternal?: (url: string) => void | Promise<void>;
};

type Selection = { source: string; media: MarkdownPreviewMedia; title: string };

export function AdminMarkdownPreview({ source, previewBlocks, audience, origin, locale, theme, session, openExternal }: PreviewProps) {
  const { canInteract, suspended } = useProtectedInteraction();
  const focused = useIsFocused();
  const [visible, setVisible] = useState(pageSize);
  const [selected, setSelected] = useState<Selection | null>(null);
  const active = focused && !suspended;
  const current = useCallback(() => active && canInteract() && session?.isCurrent() === true, [active, canInteract, session]);
  const blocks = useMemo(() => previewBlocks ?? splitMarkdownPreview(source), [previewBlocks, source]);
  const t = labels[locale];
  const colors = nativeColors[theme];
  const tone = [styles.caption, { color: colors.mutedForeground }];

  useEffect(() => {
    if (!active || session?.isCurrent() === false) setSelected(null);
  }, [active, session]);

  const open = useCallback((url: string) => {
    if (!session || !current()) return;
    const target = previewExternalHref(url, origin);
    if (target) void Promise.resolve(openExternal ? openExternal(target) : Linking.openURL(target)).catch(() => {});
  }, [current, openExternal, origin, session]);

  const renderMedia = useCallback((raw: string, caption?: string, imageOnly = false) => {
    const media = previewMedia(raw, origin, audience, imageOnly);
    if (!media || !session) return <Text style={tone}>{t.missing}</Text>;
    const label = media.kind === "youtube" ? t.youtube : media.kind === "video" ? t.video : t.image;
    return <Button theme={theme} variant="outline" testID={`admin-markdown-${media.kind}`} accessibilityLabel={caption ? `${label}, ${caption}` : label}
      onPress={() => { if (current()) setSelected({ source, media, title: caption || label }); }}>{label}</Button>;
  }, [audience, colors.mutedForeground, current, origin, session, source, t, theme]);

  const renderImage = useCallback(({ url, altText }: { url: string; altText: string }) => <View style={styles.media}>
    {renderMedia(url, altText, true)}
    {altText ? <Text style={[styles.caption, { color: colors.mutedForeground }]}>{altText}</Text> : null}
  </View>, [colors.mutedForeground, renderMedia]);

  function markdown(text: string) {
    return <CourseMarkdown source={text} theme={theme} services={{ session: { origin, locale }, openExternal: open }}
      renderPreviewImage={renderImage} />;
  }

  return <View style={styles.stack} testID="admin-markdown-preview">
    {blocks.slice(0, visible).map((block, index) => <View key={index} style={styles.stack}>
      {block.type === "markdown" ? markdown(block.source) : block.type === "media" ? <View style={styles.media}>
        {renderMedia(block.media.src, block.media.caption)}
        {block.media.caption ? <Text style={tone}>{block.media.caption}</Text> : null}
        {block.media.sourceLabel ? (
          block.media.sourceUrl && previewExternalHref(block.media.sourceUrl, origin)
            ? <Button variant="link" theme={theme} wrapLabel style={styles.sourceButton}
              onPress={() => open(block.media.sourceUrl ?? "")}>{`${t.source} · ${block.media.sourceLabel}`}</Button>
            : <Text style={tone}>{t.source} · {block.media.sourceLabel}</Text>
        ) : null}
      </View> : <>
        {block.title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{block.title}</Text> : null}
        {block.diagram ? <AdminMarkdownDiagram diagram={block.diagram} title={block.title || t.diagram} theme={theme} locale={locale} />
          : <><Text accessibilityRole="alert" style={tone}>{t.unsupported}</Text>{markdown(block.source)}</>}
        {block.caption ? <Text style={tone}>{block.caption}</Text> : null}
      </>}
    </View>)}
    {blocks.length > visible ? <Button theme={theme} variant="outline" onPress={() => setVisible(count => count + pageSize)}>{t.more}</Button> : null}
    {active && selected?.source === source ? <MediaPreview selection={selected} {...{ audience, origin, theme, locale, session, current }}
      close={() => setSelected(null)} /> : null}
  </View>;
}

function MediaPreview({ selection, audience, origin, theme, locale, session, current, close }: {
  selection: Selection; audience: MarkdownPreviewAudience; origin: string; theme: keyof typeof nativeColors;
  locale: "en" | "id"; session?: NativeSessionTransport | null; current(): boolean; close(): void;
}) {
  const { media, title } = selection;
  const videoUrl = media.kind === "video" || media.kind === "youtube" ? media.url : undefined;
  const load = useCallback(async () => {
    if (!videoUrl || !current()) throw new Error();
    return { url: videoUrl };
  }, [current, videoUrl]);
  if (videoUrl) return <CourseVideoDialog title={title} locale={locale} theme={theme} origin={origin} load={load} close={close} />;
  return <ImagePreview media={media} audience={audience} theme={theme} title={title} locale={locale} session={session} current={current} close={close} />;
}

function ImagePreview({ media, audience, theme, locale, title, session, current, close }: {
  media: MarkdownPreviewMedia; audience: MarkdownPreviewAudience; theme: keyof typeof nativeColors; locale: "en" | "id";
  title: string; session?: NativeSessionTransport | null; current(): boolean; close(): void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ uri?: string; error?: true }>();
  const t = labels[locale];
  const colors = nativeColors[theme];

  useEffect(() => {
    if (!current()) return;
    if (media.kind === "image") { setResult({ uri: media.uri }); return; }
    if (media.kind !== "storage-image" || !session) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const isCurrent = () => !controller.signal.aborted && current();
    scopedFiles.prepareAdminMarkdownImage(session, media.path, audience, controller.signal, isCurrent).then(image => {
      if (!isCurrent()) { image.release(); return; }
      release = image.release;
      setResult({ uri: image.uri });
    }).catch(() => {
      if (isCurrent()) setResult({ error: true });
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [attempt, audience, current, media, session]);

  return <SharedDialog open title={title} closeLabel={t.close} theme={theme} onDismiss={close} testID="admin-markdown-image-preview">
    {result?.error ? <>
      <Text accessibilityRole="alert" style={[styles.caption, { color: colors.destructive }]}>{t.failed}</Text>
      <Button theme={theme} variant="outline" onPress={() => { setResult(undefined); setAttempt(count => count + 1); }}>{t.retry}</Button>
    </> : result?.uri ? <Image key={attempt} source={{ uri: result.uri }} accessibilityLabel={title} resizeMode="contain"
      onError={() => setResult({ error: true })} style={styles.image} />
      : <ActivityIndicator accessibilityLabel={t.loading} color={colors.primary} />}
  </SharedDialog>;
}

const styles = StyleSheet.create({
  stack: { gap: 12, minWidth: 0 },
  media: { gap: 8, alignItems: "flex-start" },
  title: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  sourceButton: { height: "auto", minHeight: 36, maxWidth: "100%" },
  image: { width: "100%", aspectRatio: 1 },
});
