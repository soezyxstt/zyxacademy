import { useMemo } from "react";
import { Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { buildReadingDocumentHtml, type ReadingDocumentProps } from "./reading-document";
import { readingKatexCss } from "./reading-katex.generated";

const initialPage = "about:blank";

export function ReadingDocument(props: ReadingDocumentProps) {
  const { saved, locale, section } = props;
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const html = useMemo(() => {
    try { return buildReadingDocumentHtml({ saved, locale, section }, readingKatexCss, theme); }
    catch { return null; }
  }, [saved, locale, section, theme]);
  const source = useMemo(() => html ? { html, baseUrl: initialPage } : undefined, [html]);
  const unavailable = () => <View style={{ flex: 1, padding: 16 }}>
    <Text accessibilityRole="alert" style={{ color: nativeColors[theme].foreground }}>
      {locale === "id" ? "Bacaan tersimpan tidak dapat ditampilkan." : "This saved reading cannot be displayed."}
    </Text>
  </View>;
  if (!source) return unavailable();

  return <WebView
    key={JSON.stringify([saved.summary.key, saved.summary.revision, section])}
    testID="offline-reading-document"
    accessibilityLabel={saved.summary.title}
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
