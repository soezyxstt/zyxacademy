import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Label } from "../../components/Label";
import { scopedFiles, type DocumentDraftRequest, type DraftDocument, type ShareFileResult } from "../../device/files";
import { sharePublicLink, type PublicLinkResult } from "../../device/share";
import { nativeTypography } from "../../typography";

const target = { route: "/internal/files", locale: "id", draftId: "internal-pdf" } as const;
const pdf = { mimeTypes: ["application/pdf"], maxBytes: 50 * 1024 * 1024 } as const;

function shareMessage(result: ShareFileResult | PublicLinkResult): string | null {
  if (result.status === "finished") return null;
  if (result.status === "cancelled") return "Dibatalkan.";
  if (result.status === "unavailable") return "Berbagi tidak tersedia di perangkat ini.";
  if (result.status !== "error") return null;
  if (result.issue === "unauthorized") return "Akun ini tidak memiliki akses unduhan.";
  if (result.issue === "not-found") return "Berkas tidak tersedia.";
  if (result.issue === "size") return "Berkas melebihi 50 MB.";
  if (result.issue === "type") return "Pilih berkas PDF.";
  if (result.issue === "invalid-target") return "Periksa ID mata kuliah dan diktat.";
  return "Berkas tidak dapat dibuka. Coba lagi.";
}

export default function InternalFilesRoute() {
  const router = useRouter();
  const { transport, revalidating } = useNativeSession();
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const focused = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const picked = useRef<DraftDocument | null>(null);
  const [document, setDocument] = useState<DraftDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [diktatId, setDiktatId] = useState("");

  const release = useCallback(() => {
    picked.current?.release();
    picked.current = null;
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(operation.current !== null);
    setDocument(null);
    return () => {
      focused.current = false;
      operation.current?.abort();
      release();
    };
  }, [release]));

  useEffect(() => {
    release();
    setDocument(null);
  }, [release, transport]);

  const draft = (): DocumentDraftRequest | null => transport
    ? { session: transport, target, policy: pdf, isDraftCurrent: () => focused.current }
    : null;

  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (!focused.current || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      await work(controller.signal);
    } finally {
      operation.current = null;
      if (focused.current) setBusy(false);
    }
  };

  const pick = () => run(async signal => {
    const request = draft();
    if (!request) return;
    const result = await scopedFiles.pickDocument({ ...request, signal });
    if (result.status === "ready") {
      if (signal.aborted || !scopedFiles.belongsToDocumentDraft(result.document, request)) {
        result.document.release();
        return;
      }
      release();
      picked.current = result.document;
      setDocument(result.document);
    } else if (!signal.aborted) {
      setMessage(shareMessage(result));
    }
  });

  const sharePicked = () => run(async signal => {
    const request = draft();
    if (!request || !picked.current) return;
    const result = await scopedFiles.shareDocument(picked.current, { ...request, signal });
    if (!signal.aborted) setMessage(shareMessage(result));
  });

  const download = () => run(async signal => {
    if (!transport) return;
    const result = await scopedFiles.shareAuthorizedDownload({
      session: transport, target: { kind: "diktat-pdf", courseId: courseId.trim(), diktatId: diktatId.trim() }, policy: pdf, signal,
    });
    if (!signal.aborted) setMessage(shareMessage(result));
  });

  const shareLink = () => run(async signal => {
    const result = await sharePublicLink({ url: NATIVE_STAGING_ORIGIN, title: "Zyx Academy" });
    if (!signal.aborted) setMessage(shareMessage(result));
  });

  const disabled = busy || revalidating;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Berkas dan tautan</Text>
        {transport ? (
          <>
            <View style={styles.actions}>
              <Button disabled={disabled} onPress={() => void pick()}>Pilih PDF</Button>
              {document && <Button disabled={disabled} variant="outline" onPress={() => void sharePicked()}>Bagikan PDF pilihan</Button>}
            </View>
            {document && (
              <View style={styles.actions}>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{document.name} · {Math.ceil(document.size / 1024)} KiB</Text>
                <Button size="sm" variant="ghost" onPress={() => { release(); setDocument(null); }}>Lepaskan berkas</Button>
              </View>
            )}
            <Label>ID mata kuliah</Label>
            <Input accessibilityLabel="ID mata kuliah" autoCapitalize="none" autoCorrect={false} value={courseId} onChangeText={setCourseId} />
            <Label>ID diktat</Label>
            <Input accessibilityLabel="ID diktat" autoCapitalize="none" autoCorrect={false} value={diktatId} onChangeText={setDiktatId} />
            <Button disabled={disabled || !courseId.trim() || !diktatId.trim()} variant="outline" onPress={() => void download()}>Simpan atau bagikan diktat</Button>
          </>
        ) : (
          <Button onPress={() => router.push("/internal/session")}>Masuk ke akun staging</Button>
        )}
        <Button disabled={busy} variant="outline" onPress={() => void shareLink()}>Bagikan tautan Zyx</Button>
        {busy && (
          <Button variant="ghost" onPress={() => { operation.current?.abort(); setMessage("Dibatalkan."); }}>Batalkan</Button>
        )}
        {message && <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: colors.foreground }]}>{message}</Text>}
        <Button variant="ghost" onPress={() => router.replace("/")}>Kembali ke galeri</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 20, paddingVertical: 24 },
  heading: { ...nativeTypography.headingBold, fontSize: 24 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16 },
});
