import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { interactiveDocumentPath, type InteractiveDocumentAssetKind } from "../../../../lib/materials/interactive-document-path";
import { Button } from "../../components/Button";
import { verifyExpoOfflineReadingAsset } from "../../offline/reading-expo";
import { readingAssetDataUrl } from "../../offline/reading-document";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { isInteractiveDocumentNavigation, interactiveFrameHtml, loadInteractiveDocument, type VisualSource } from "./interactive-document";
import type { StudentRequest } from "./contracts";

type Selection = VisualSource & { kind: InteractiveDocumentAssetKind };

export function InteractiveVisual({ source, request, locale, disabled, showFallback = true }: {
  source: VisualSource; request: StudentRequest; locale: string; disabled?: boolean; showFallback?: boolean;
}) {
  const { spec } = source;
  const [kind, setKind] = useState<InteractiveDocumentAssetKind>();
  const { canInteract } = useProtectedInteraction();
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const id = locale === "id";
  const colors = nativeColors[theme];
  const available = Boolean(interactiveDocumentPath(source.scope, spec));
  return <View style={{ gap: 6 }}>
    {showFallback && <>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontWeight: "600" }}>{spec.label}</Text>
      <Text style={{ color: colors.mutedForeground }}>{spec.description}</Text>
      <Text style={{ color: colors.foreground }}>{spec.staticFallback.content}</Text>
    </>}
    {available && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Button size="sm" theme={theme} disabled={disabled} variant="outline" accessibilityLabel={`${id ? "Buka visual" : "Open visual"}: ${spec.label}`}
        onPress={() => { if (canInteract()) setKind("document"); }}>{id ? "Buka visual" : "Open visual"}</Button>
      <Button size="sm" theme={theme} disabled={disabled} variant="ghost" accessibilityLabel={`${id ? "Lihat gambar" : "View image"}: ${spec.label}`}
        onPress={() => { if (canInteract()) setKind("print"); }}>{id ? "Lihat gambar" : "View image"}</Button>
    </View>}
    {kind && available && <InteractiveDocumentModal key={interactiveDocumentPath(source.scope, spec, kind)}
      selection={{ ...source, kind }} request={request} locale={locale} onClose={() => setKind(undefined)} />}
  </View>;
}

export function InteractiveDocumentModal({ selection, request, locale, onClose }: {
  selection: Selection; request: StudentRequest; locale: string; onClose(): void;
}) {
  const { suspended } = useProtectedInteraction();
  if (suspended) return null;
  return <InteractiveDocumentVisible selection={selection} request={request} locale={locale} onClose={onClose} />;
}

function InteractiveDocumentVisible({ selection, request, locale, onClose }: {
  selection: Selection; request: StudentRequest; locale: string; onClose(): void;
}) {
  const { spec, scope } = selection;
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = nativeColors[theme];
  const id = locale === "id";
  const [asset, setAsset] = useState<string>();
  const [kindOverride, setKindOverride] = useState<InteractiveDocumentAssetKind>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const kind = kindOverride ?? selection.kind;
  const path = interactiveDocumentPath(scope, spec, kind);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setFailed(true);
    }, 15_000);
    setAsset(undefined);
    setFailed(false);
    void loadInteractiveDocument(request, { spec, scope }, kind, controller.signal, verifyExpoOfflineReadingAsset)
      .then(bytes => kind === "print"
        ? readingAssetDataUrl({ bytes, mime: "image/png" })
        : interactiveFrameHtml(new TextDecoder().decode(bytes), spec.label, theme))
      .then(value => { if (!controller.signal.aborted && value) setAsset(value); }, () => {
        if (!controller.signal.aborted) setFailed(true);
      }).finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
    // The exact canonical path contains the field, version, asset kind and digest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, path, request, retry, theme]);
  return <Modal animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
        <Text accessibilityRole="header" style={{ flex: 1, color: colors.foreground, fontWeight: "600" }}>{spec.label}</Text>
        <Button size="sm" theme={theme} variant="outline" onPress={onClose}>{id ? "Tutup" : "Close"}</Button>
      </View>
      {failed ? <View style={{ padding: 16, gap: 8 }}>
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{id ? "Visual tidak dapat dimuat." : "The visual could not be loaded."}</Text>
        <Text style={{ color: colors.foreground }}>{spec.staticFallback.content}</Text>
        <Button size="sm" theme={theme} variant="outline" onPress={() => setRetry(value => value + 1)}>{id ? "Coba lagi" : "Retry"}</Button>
        {kind === "document" && <Button size="sm" theme={theme} variant="ghost" onPress={() => setKindOverride("print")}>
          {id ? "Lihat gambar" : "View image"}
        </Button>}
      </View> : asset ? kind === "print"
        ? <View style={{ flex: 1, padding: 12, gap: 6 }}>
          <Image accessible accessibilityLabel={spec.label} source={{ uri: asset, cache: "reload" }} resizeMode="contain"
            onError={() => setFailed(true)} style={{ flex: 1, width: "100%" }} />
          <Text style={{ color: colors.mutedForeground }}>{spec.printCaption}</Text>
        </View>
        : <WebView testID="student-interactive-document-frame" source={{ html: asset, baseUrl: "about:blank" }} style={{ flex: 1 }}
          originWhitelist={["*"]} onShouldStartLoadWithRequest={navigation => isInteractiveDocumentNavigation(navigation.url)}
          onError={() => setFailed(true)} onContentProcessDidTerminate={() => setFailed(true)} onRenderProcessGone={() => setFailed(true)}
          javaScriptEnabled domStorageEnabled={false} incognito cacheEnabled={false}
          allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never" setSupportMultipleWindows={true} javaScriptCanOpenWindowsAutomatically={false}
          thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} allowsLinkPreview={false} geolocationEnabled={false}
          allowsInlineMediaPlayback={false} mediaPlaybackRequiresUserAction />
        : <ActivityIndicator accessibilityLabel={id ? "Memuat visual" : "Loading visual"} color={colors.primary} />}
    </SafeAreaView>
  </Modal>;
}
