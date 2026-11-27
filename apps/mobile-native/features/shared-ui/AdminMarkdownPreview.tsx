import { fetch } from "expo/fetch";
import { inlineAssessmentRaster } from "../../device/assessment-raster";
import { useIsFocused } from "expo-router";
import { setStringAsync } from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from "react-native";
import { parseEmbeddedVisual } from "../../../../lib/materials/embedded-visuals";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { previewExternalHref, previewMedia, type MarkdownPreviewAudience, type MarkdownPreviewMedia } from "../../../../packages/native-parity/operations/admin-markdown-media";
import { splitMarkdownPreview, type MarkdownPreviewBlock } from "../../../../packages/native-parity/operations/admin-markdown-preview";
import { evaluationPreviewTable, evaluationPreviewVisual } from "../../../../packages/native-parity/operations/evaluation-ast-preview";
import { Button } from "../../components/Button";
import { scopedFiles } from "../../device/files";
import type { NativeSessionTransport } from "../../network/transport";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { nativeTypography } from "../../typography";
import { CourseVideoDialog } from "../course-video/CourseVideoDialog";
import { SolutionVisualPreview } from "../solutions/SolutionVisualPreview";
import { CourseMarkdown } from "../student/CourseMarkdown";
import { CanvasPlot } from "../student/zyra/CanvasPlot";
import { AdminInteractiveGraph } from "./AdminInteractiveGraph";
import { graphEntryLimit, initialGraphEntries } from "./admin-interactive-graph-model";
import { AdminMarkdownDiagram } from "./AdminMarkdownDiagram";
import { AdminPreviewChart } from "./AdminPreviewChart";
import { SharedDialog } from "./overlays";

const labels = {
  en: {
    image: "View image", video: "Play video", youtube: "Play YouTube video", source: "Source",
    missing: "This media cannot be opened.", failed: "The image could not be loaded.", retry: "Try again",
    close: "Close", loading: "Loading image", diagram: "Diagram", unsupported: "This diagram cannot be drawn in the app.",
    visualUnavailable: "This visual cannot be drawn in the app.",
    more: "Show more of the document",
  },
  id: {
    image: "Lihat gambar", video: "Putar video", youtube: "Putar video YouTube", source: "Sumber",
    missing: "Media ini tidak dapat dibuka.", failed: "Gambar belum dapat dimuat.", retry: "Coba lagi",
    close: "Tutup", loading: "Memuat gambar", diagram: "Diagram", unsupported: "Diagram ini belum dapat digambar di aplikasi.",
    visualUnavailable: "Visual ini belum dapat digambar di aplikasi.",
    more: "Tampilkan bagian berikutnya",
  },
} as const;
const pageSize = 12;

type PreviewProps = {
  source: string;
  previewBlocks?: readonly MarkdownPreviewBlock[];
  thumbnail?: { url: string; alt: string };
  audience: MarkdownPreviewAudience;
  questionRole?: "tutor" | "admin";
  origin: string;
  theme: keyof typeof nativeColors;
  locale: "en" | "id";
  session?: NativeSessionTransport | null;
  openExternal?: (url: string) => void | Promise<void>;
};

type Selection = { source: string; thumbnailUrl?: string; media: MarkdownPreviewMedia; title: string };

export function AdminMarkdownPreview({ source, previewBlocks, thumbnail, audience, questionRole, origin, locale, theme, session, openExternal }: PreviewProps) {
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
      onPress={() => { if (current()) setSelected({ source, thumbnailUrl: thumbnail?.url, media, title: caption || label }); }}>{label}</Button>;
  }, [audience, colors.mutedForeground, current, origin, session, source, t, theme, thumbnail?.url]);

  const renderImage = useCallback(({ url, altText }: { url: string; altText: string }) => <View style={styles.media}>
    {renderMedia(url, altText, true)}
    {altText ? <Text style={[styles.caption, { color: colors.mutedForeground }]}>{altText}</Text> : null}
  </View>, [colors.mutedForeground, renderMedia]);

  function markdown(text: string) {
    return <CourseMarkdown source={text} theme={theme} services={{ session: { origin, locale }, openExternal: open }}
      renderPreviewImage={renderImage} />;
  }

  function renderBlock(block: MarkdownPreviewBlock) {
    switch (block.type) {
      case "markdown": return markdown(block.source);
      case "code": return <CodePreview key={block.source} content={block.content} theme={theme} locale={locale} current={current}>
        {markdown(block.source)}
      </CodePreview>;
      case "media": return <View style={styles.media}>
        {renderMedia(block.media.src, block.media.caption)}
        {block.media.caption ? markdown(block.media.caption) : null}
        {block.media.sourceLabel ? (
          block.media.sourceUrl && previewExternalHref(block.media.sourceUrl, origin)
            ? <Button variant="link" theme={theme} wrapLabel style={styles.sourceButton}
              onPress={() => open(block.media.sourceUrl ?? "")}>{`${t.source} · ${block.media.sourceLabel}`}</Button>
            : <Text style={tone}>{t.source} · {block.media.sourceLabel}</Text>
        ) : null}
      </View>;
      case "diagram": return <>
        {block.title ? markdown(`### ${block.title}`) : null}
        {block.diagram ? <AdminMarkdownDiagram diagram={block.diagram} title={block.title || t.diagram} theme={theme} locale={locale} />
          : unavailable(block.source, t.unsupported)}
        {block.caption ? markdown(block.caption) : null}
      </>;
      case "visual": {
        const { title, caption } = block.visual;
        const visual = evaluationPreviewVisual(block.visual, locale);
        return <>
          {title ? markdown(`### ${title}`) : null}
          {visual?.kind === "chart" ? <AdminPreviewChart chart={visual.chart} title={title} theme={theme} locale={locale} renderText={markdown} /> :
            visual?.kind === "graph" ? plot(visual.spec) : unavailable(block.source)}
          {caption ? markdown(caption) : null}
        </>;
      }
      case "function-widget": {
        if (block.content.length > 12_000) return unavailable(block.source);
        const entries = initialGraphEntries(block.content);
        return entries.length <= graphEntryLimit
          ? <AdminInteractiveGraph key={block.source} entries={entries} theme={theme} locale={locale} current={current} />
          : unavailable(block.source);
      }
      case "embedded-visual": {
        const visual = parseEmbeddedVisual(block.content);
        if (!visual) return unavailable(block.source);
        if (visual.kind === "source_figure") return <>
          {markdown(`### ${visual.label}`)}
          {markdown(visual.description)}
          <Text style={tone}>{t.missing}</Text>
          {visual.captionMarkdown ? markdown(visual.captionMarkdown) : null}
          {markdown(visual.staticFallback.summary)}
          {markdown(visual.staticFallback.type === "table"
            ? evaluationPreviewTable(visual.staticFallback.headers, visual.staticFallback.rows)
            : visual.staticFallback.content)}
        </>;
        return <SolutionVisualPreview value={visual} origin={origin} locale={locale} theme={theme} />;
      }
    }
  }

  function unavailable(raw: string, message: string = t.visualUnavailable) {
    return <>
      <Text accessibilityRole="alert" style={tone}>{message}</Text>
      <Text selectable style={[styles.source, { color: colors.foreground, backgroundColor: colors.muted }]}>{raw}</Text>
    </>;
  }

  function plot(spec: Parameters<typeof CanvasPlot>[0]["spec"]) {
    return <CanvasPlot spec={spec} locale={locale} theme={theme}
      renderValues={table => markdown(evaluationPreviewTable(table.columns.map(column => column.label), table.rows))} />;
  }

  return <View style={styles.stack} testID="admin-markdown-preview">
    {thumbnail ? renderMedia(thumbnail.url, thumbnail.alt, true) : null}
    {blocks.slice(0, visible).map((block, index) => <View key={index} style={styles.stack}>{renderBlock(block)}</View>)}
    {blocks.length > visible ? <Button theme={theme} variant="outline" onPress={() => setVisible(count => count + pageSize)}>{t.more}</Button> : null}
    {active && selected?.source === source && selected.thumbnailUrl === thumbnail?.url ? <MediaPreview selection={selected} {...{ audience, questionRole, origin, theme, locale, session, current }}
      close={() => setSelected(null)} /> : null}
  </View>;
}

function CodePreview({ content, children, theme, locale, current }: {
  content: string; children: ReactNode; theme: PreviewProps["theme"]; locale: PreviewProps["locale"]; current(): boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const en = locale === "en";
  const label = en ? "Copy code" : "Salin kode";
  const message = status === "copied" ? (en ? "Code copied." : "Kode tersalin.")
    : status === "failed" ? (en ? "Code could not be copied. Try again." : "Kode belum dapat disalin. Coba lagi.") : null;

  async function copy() {
    if (!current() || status === "copying") return;
    setStatus("copying");
    const copied = await setStringAsync(content).catch(() => false);
    setStatus(current() && copied ? "copied" : "failed");
  }

  return <View style={styles.stack}>
    {children}
    {content ? <Button theme={theme} variant="outline" isLoading={status === "copying"}
      onPress={() => void copy()}>{label}</Button> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: nativeColors[theme].mutedForeground }]}>{message}</Text> : null}
  </View>;
}

function MediaPreview({ selection, audience, questionRole, origin, theme, locale, session, current, close }: {
  selection: Selection; audience: MarkdownPreviewAudience; questionRole?: PreviewProps["questionRole"]; origin: string; theme: keyof typeof nativeColors;
  locale: "en" | "id"; session?: NativeSessionTransport | null; current(): boolean; close(): void;
}) {
  const { media, title } = selection;
  const videoUrl = media.kind === "video" || media.kind === "youtube" ? media.url : undefined;
  const load = useCallback(async () => {
    if (!videoUrl || !current()) throw new Error();
    return { url: videoUrl };
  }, [current, videoUrl]);
  if (videoUrl) return <CourseVideoDialog title={title} locale={locale} theme={theme} origin={origin} load={load} close={close} />;
  return <ImagePreview media={media} audience={audience} questionRole={questionRole} theme={theme} title={title} locale={locale} session={session} current={current} close={close} />;
}

function ImagePreview({ media, audience, questionRole, theme, locale, title, session, current, close }: {
  media: MarkdownPreviewMedia; audience: MarkdownPreviewAudience; questionRole?: PreviewProps["questionRole"]; theme: keyof typeof nativeColors; locale: "en" | "id";
  title: string; session?: NativeSessionTransport | null; current(): boolean; close(): void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ uri?: string; error?: true }>();
  const t = labels[locale];
  const colors = nativeColors[theme];

  useEffect(() => {
    if (!session || !current()) return;
    if (media.kind !== "image" && media.kind !== "storage-image") return;
    if (media.kind === "image" && (!questionRole || media.uri.startsWith("data:"))) {
      setResult(!questionRole || inlineAssessmentRaster(media.uri) ? { uri: media.uri } : { error: true });
      return;
    }
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const isCurrent = () => !controller.signal.aborted && current();
    const pending = media.kind === "image"
      ? scopedFiles.preparePublicAssessmentImage(session, media.uri, controller.signal, isCurrent, fetch)
      : questionRole
        ? scopedFiles.prepareAssessmentImage(session, media.path, controller.signal, isCurrent, questionRole)
        : scopedFiles.prepareAdminMarkdownImage(session, media.path, audience, controller.signal, isCurrent);
    pending.then(image => {
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
  }, [attempt, audience, current, media, questionRole, session]);

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
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  source: { ...nativeTypography.mono, fontSize: 14, lineHeight: 20, padding: 8 },
  sourceButton: { height: "auto", minHeight: 36, maxWidth: "100%" },
  image: { width: "100%", aspectRatio: 1 },
});
