import { useMemo } from "react";
import { Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { buildReadingContentHtml, savedReadingContent, type ReadingContent, type ReadingDocumentProps } from "./reading-document";
import { readingKatexCss } from "./reading-katex.generated";

const initialPage = "about:blank";

export function ReadingDocument(props: ReadingDocumentProps) {
  const { saved, locale, section } = props;
  const content = useMemo(() => savedReadingContent({ saved, locale, section }), [saved, locale, section]);
  return <ReadingContentDocument key={JSON.stringify([saved.summary.key, saved.summary.revision, section])} content={content} />;
}

export function ReadingContentDocument({ content, testID = "offline-reading-document" }: { content: ReadingContent; testID?: string }) {
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

  return <WebView
    testID={testID}
    accessibilityLabel={title}
    style={{ flex: 1, backgroundColor: nativeColors[theme].background }}
    source={source}
    originWhitelist={["*"]}
    onShouldStartLoadWithRequest={request => request.url === initialPage}
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
