import { useIsFocused } from "expo-router";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import Pdf from "react-native-pdf";
import { adminMediaDownloadPolicy, adminMediaFilePath, adminMediaPreviewPolicy } from "../../../../../packages/native-parity/operations/media-content";
import type { MediaFile } from "../../../../../packages/native-parity/operations/management-contract";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles } from "../../../device/files";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { VideoSurface } from "../../course-video/CourseVideoDialog";
import { SharedDialog } from "../../shared-ui/overlays";
import { Action, Copy, styles, useManagement } from "./ui";

export function MediaContentPreview({ file, close }: { file: MediaFile; close(): void }) {
  const { colors, theme, locale, openExternal, renderMarkdown } = useManagement();
  const { transport, getSnapshot } = useNativeSession();
  const { suspended, canInteract } = useProtectedInteraction();
  const focused = useIsFocused();
  const { kind, mimeTypes } = adminMediaPreviewPolicy(file.key);
  const sessionScope = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ uri: string; text?: string }>();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const exportPending = useRef(false);
  const active = focused && !suspended;
  const en = locale === "en";
  const path = adminMediaFilePath(file.key);

  const current = (controller: AbortController) => !controller.signal.aborted && sessionScope.current === controller &&
    transport?.isCurrent() === true && getSnapshot().transport === transport && canInteract();

  useEffect(() => {
    setResult(undefined);
    setFailed(false);
    setSaving(false);
    setSaveError(false);
    exportPending.current = false;
    if (!active || !transport || !path) return;

    const controller = new AbortController();
    sessionScope.current = controller;
    const isCurrent = () => current(controller);
    if (mimeTypes.length) {
      let release: (() => void) | undefined;
      async function load() {
        if (!transport) return;
        const asset = await scopedFiles.prepareAdminMedia(transport, file.key, controller.signal, isCurrent);
        release = asset.release;
        if (!isCurrent()) { release(); return; }
        const text = kind === "text" || kind === "markdown" ? await new File(asset.uri).text() : undefined;
        if (isCurrent()) setResult({ uri: asset.uri, text });
      }
      void load().catch(() => { if (isCurrent()) setFailed(true); });
      return () => { controller.abort(); sessionScope.current = null; release?.(); };
    }
    return () => { controller.abort(); sessionScope.current = null; };
  }, [active, attempt, file.key, kind, mimeTypes.length, path, transport]);

  async function save() {
    const controller = sessionScope.current;
    if (!transport || !controller || !current(controller) || exportPending.current) return;
    exportPending.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const output = await scopedFiles.shareAuthorizedDownload({
        target: { kind: "admin-media", key: file.key }, session: transport, isTargetCurrent: () => current(controller),
        policy: adminMediaDownloadPolicy, signal: controller.signal, fileName: file.name,
      });
      if (current(controller) && output.status !== "finished" && output.status !== "cancelled" && output.status !== "stale") setSaveError(true);
    } catch {
      if (current(controller)) setSaveError(true);
    } finally {
      if (sessionScope.current === controller) {
        exportPending.current = false;
        setSaving(false);
      }
    }
  }
  const preview = result && !failed ? (() => {
    if (kind === "image") return <Image source={{ uri: result.uri }} accessibilityLabel={file.name} resizeMode="contain"
      onError={() => setFailed(true)} style={{ width: "100%", aspectRatio: 1 }} />;
    if (kind === "pdf") return <Pdf source={{ uri: result.uri, cache: false }} trustAllCerts={false}
      onError={() => setFailed(true)} onPressLink={() => {}} style={{ width: "100%", height: 360 }} />;
    if (kind === "video" || kind === "audio") return <VideoSurface uri={result.uri} title={file.name} fail={() => setFailed(true)} />;
    if (kind === "markdown" && result.text && renderMarkdown) return renderMarkdown(result.text);
    return <Text selectable style={[styles.copy, { color: colors.foreground }]}>{result.text}</Text>;
  })() : null;

  return <SharedDialog open={active} onDismiss={close} closeLabel={en ? "Close" : "Tutup"} theme={theme} title={file.name} testID="admin-media-preview">
    {preview}
    {!preview && (failed || !mimeTypes.length || !transport || !path ? <>
      <Copy muted>{en ? "Preview unavailable." : "Pratinjau belum tersedia."}</Copy>
      {failed && <Action onPress={() => setAttempt(attempt + 1)}>{en ? "Retry preview" : "Muat ulang pratinjau"}</Action>}
    </> : <ActivityIndicator color={colors.primary} accessibilityLabel={en ? "Loading preview" : "Memuat pratinjau"} />)}
    <View style={styles.row}>
      {transport && path && <Action busy={saving} onPress={() => void save()} testID="admin-media-download">{en ? "Download file" : "Unduh berkas"}</Action>}
      {path && openExternal && <Action onPress={() => openExternal(path)}>{en ? "Open in browser" : "Buka di browser"}</Action>}
    </View>
    {saveError && <Copy status="error">{en ? "Download unavailable. Try again or open the file in your browser." : "Berkas belum dapat diunduh. Coba lagi atau buka di browser."}</Copy>}
  </SharedDialog>;
}
