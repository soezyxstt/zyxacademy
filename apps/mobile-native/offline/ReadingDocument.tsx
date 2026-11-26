import type { InteractiveDocumentAssetKind } from "../../../lib/materials/interactive-document-path";
import type { InteractiveDocumentSpec } from "../../../lib/materials/interactive-document";
import { escapeHtml } from "../../../lib/offline/offline-snapshot-renderer";
import type { ReadingVisualLocation } from "../../../lib/offline/reading-sections";
import { useMemo, type ComponentProps } from "react";
import { Platform, Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { buildReadingContentHtml, readerCodingAction, savedReadingContent, type ReadingContent, type ReadingDocumentProps } from "./reading-document";
import { readingSelectionKeys, readerSelectionUsesContentEngine, type ReadingSelectionKey } from "./reading-selection";
import { readingKatexCss } from "./reading-katex.generated";

import { useNativeAppearance } from "../device/appearance";

const initialPage = "about:blank";
const visualActionRoot = "https://reading-visual.invalid/";
type VisualAction = { spec: InteractiveDocumentSpec; location: ReadingVisualLocation; kind: InteractiveDocumentAssetKind };
type NativeMenuEvent = { nativeEvent: { key: string; selectedText: string } };
type ReadingScrollEvent = { nativeEvent: {
  layoutMeasurement: { height: number }; contentSize: { height: number }; contentOffset: { y: number };
} };

export function ReadingDocument(props: ReadingDocumentProps) {
  const { saved, locale, section } = props;
  const content = useMemo(() => savedReadingContent({ saved, locale, section }), [saved, locale, section]);
  return <ReadingContentDocument key={JSON.stringify([saved.summary.key, saved.summary.revision, section])} content={content} />;
}

export function ReadingContentDocument({ content, testID = "offline-reading-document", onProgress, codingActions, onCodingAction, onVisualAction, onSelectedText }: {
  content: ReadingContent; testID?: string; onProgress?: (percent: number) => void;
  codingActions?: ReadonlyMap<string, string>; onCodingAction?: (id: string) => void;
  onSelectedText?: (key: ReadingSelectionKey, text: unknown) => void;
  onVisualAction?: (action: VisualAction) => void;
}) {
  const { title, locale } = content;
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const { fontSize, density } = useNativeAppearance();
  const canOpenVisuals = Boolean(onVisualAction);
  const nativeSelection = Boolean(onSelectedText) && (Platform.OS === "ios" || Platform.OS === "android");
  const menuItems = nativeSelection ? [
    { label: locale === "en" ? "Ask Zyra" : "Tanya Zyra", key: readingSelectionKeys.ask },
    { label: locale === "en" ? "Copy" : "Salin", key: readingSelectionKeys.copy },
  ] : undefined;
  const document = useMemo(() => {
    const visualActions = new Map<string, VisualAction>();
    try {
      const html = buildReadingContentHtml(content, readingKatexCss, theme, { fontSize, density }, codingActions, canOpenVisuals ? (spec, location) => {
        const link = (kind: InteractiveDocumentAssetKind, label: string) => {
          const url = visualActionRoot + visualActions.size;
          visualActions.set(url, { spec, location, kind });
          return `<a class="reader-coding-action" href="${url}" aria-label="${escapeHtml(label + ": " + spec.label)}">${escapeHtml(label)}</a>`;
        };
        return link("document", locale === "id" ? "Buka visual" : "Open visual") + " " +
          link("print", locale === "id" ? "Lihat gambar" : "View image");
      } : undefined);
      return html ? { source: { html, baseUrl: initialPage }, visualActions } : undefined;
    } catch { return undefined; }
  }, [content, theme, fontSize, density, codingActions, canOpenVisuals, locale]);
  const unavailable = () => <View style={{ flex: 1, padding: 16 }}>
    <Text accessibilityRole="alert" style={{ color: nativeColors[theme].foreground }}>
      {locale === "id" ? "Dokumen tidak dapat ditampilkan." : "This document cannot be displayed."}
    </Text>
  </View>;
  if (!document) return unavailable();
  const scroll: ComponentProps<typeof WebView>["onScroll"] = onProgress ? ({ nativeEvent }: ReadingScrollEvent) => {
    const visible = nativeEvent.layoutMeasurement?.height ?? 0;
    const total = nativeEvent.contentSize?.height ?? 0;
    if (visible > 0 && total > 0) onProgress(Math.min(100, Math.round((Math.max(0, nativeEvent.contentOffset.y) + visible) * 100 / total)));
  } : undefined;

  return <WebView
    testID={testID}
    accessibilityLabel={title}
    style={{ flex: 1, backgroundColor: nativeColors[theme].background }}
    source={document.source}
    originWhitelist={["*"]}
    onShouldStartLoadWithRequest={request => {
      if (request.url === initialPage) return true;
      const visualAction = document.visualActions.get(request.url);
      if (visualAction) onVisualAction?.(visualAction);
      const action = readerCodingAction(request.url, codingActions);
      if (action !== undefined) onCodingAction?.(action);
      return false;
    }}
    onScroll={scroll}
    menuItems={menuItems}
    nativeConfig={nativeSelection ? { props: { onCustomMenuSelection: ({ nativeEvent }: NativeMenuEvent) => {
      const { key, selectedText } = nativeEvent;
      if (key === readingSelectionKeys.ask || key === readingSelectionKeys.copy) onSelectedText?.(key, selectedText);
    } } } : undefined}
    javaScriptEnabled={readerSelectionUsesContentEngine(Platform.OS, nativeSelection)}
    domStorageEnabled={false}
    incognito
    cacheEnabled={false}
    allowFileAccess={false}
    allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false}
    mixedContentMode="never"
    setSupportMultipleWindows={false}
    thirdPartyCookiesEnabled={false}
    sharedCookiesEnabled={false}
    allowsLinkPreview={false}
    automaticallyAdjustContentInsets={false}
    contentInsetAdjustmentBehavior="never"
    renderError={unavailable}
  />;
}
