import { useMemo, type ComponentProps } from "react";
import { Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { buildReadingContentHtml, savedReadingContent, type ReadingContent, type ReadingDocumentProps } from "./reading-document";
import { readingKatexCss } from "./reading-katex.generated";

const initialPage = "about:blank";
type ReadingScrollEvent = { nativeEvent: {
  layoutMeasurement: { height: number }; contentSize: { height: number }; contentOffset: { y: number };
} };

export function ReadingDocument(props: ReadingDocumentProps) {
  const { saved, locale, section } = props;
  const content = useMemo(() => savedReadingContent({ saved, locale, section }), [saved, locale, section]);
  return <ReadingContentDocument key={JSON.stringify([saved.summary.key, saved.summary.revision, section])} content={content} />;
}

export function ReadingContentDocument({ content, testID = "offline-reading-document", onProgress }: {
  content: ReadingContent; testID?: string; onProgress?: (percent: number) => void;
}) {
  const { title, locale } = content;
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const html = useMemo(() => {
    try { return buildReadingContentHtml(content, readingKatexCss, theme); }
    catch { return null; }
  }, [content, theme]);
  const source = useMemo(() => html ? { html, baseUrl: initialPage } : undefined, [html]);
  const unavailable = () => <View style={{ flex: 1, padding: 16 }}>
    <Text accessibilityRole="alert" style={{ color: nativeColors[theme].foreground }}>
      {locale === "id" ? "Dokumen tidak dapat ditampilkan." : "This document cannot be displayed."}
    </Text>
  </View>;
  if (!source) return unavailable();
  const scroll: ComponentProps<typeof WebView>["onScroll"] = onProgress ? ({ nativeEvent }: ReadingScrollEvent) => {
    const visible = nativeEvent.layoutMeasurement?.height ?? 0;
    const total = nativeEvent.contentSize?.height ?? 0;
    if (visible > 0 && total > 0) onProgress(Math.min(100, Math.round((Math.max(0, nativeEvent.contentOffset.y) + visible) * 100 / total)));
  } : undefined;

  return <WebView
    testID={testID}
    accessibilityLabel={title}
    style={{ flex: 1, backgroundColor: nativeColors[theme].background }}
    source={source}
    originWhitelist={["*"]}
    onShouldStartLoadWithRequest={request => request.url === initialPage}
    onScroll={scroll}
    javaScriptEnabled={false}
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
