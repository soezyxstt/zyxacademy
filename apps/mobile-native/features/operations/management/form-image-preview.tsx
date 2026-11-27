import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet } from "react-native";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles } from "../../../device/files";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { SharedDialog } from "../../shared-ui/overlays";
import { Action, Copy, useManagement } from "./ui";

export function FormImagePreview({ url, label }: { url: string; label: string }) {
  const { theme } = useManagement();
  const { transport, getSnapshot } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const focus = useRef(false);
  const active = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [attempt, retry] = useState(0);
  const [preview, setPreview] = useState<{ source: string; uri?: string; error?: boolean }>();

  useFocusEffect(useCallback(() => {
    focus.current = true;
    setOpen(false);
    return () => { focus.current = false; active.current?.abort(); active.current = null; };
  }, [transport]));

  useEffect(() => {
    if (!open || !transport || !focus.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPreview(undefined);
    const isCurrent = () => {
      const snapshot = getSnapshot();
      return active.current === controller && focus.current && !controller.signal.aborted && canInteract() &&
        snapshot.transport === transport && !snapshot.revalidating;
    };
    let release: (() => void) | undefined;
    scopedFiles.prepareFormQuestionImage(transport, url, controller.signal, isCurrent).then(image => {
      if (!isCurrent()) { image.release(); return; }
      release = image.release;
      setPreview({ source: url, uri: image.uri });
    }).catch(() => {
      if (isCurrent()) setPreview({ source: url, error: true });
    });
    return () => {
      controller.abort();
      if (active.current === controller) active.current = null;
      release?.();
    };
  }, [attempt, canInteract, getSnapshot, open, transport, url]);

  const current = preview?.source === url ? preview : undefined;
  return <>
    <Action onPress={() => { if (focus.current && transport && canInteract()) setOpen(true); }}>Pratinjau gambar</Action>
    {open ? <SharedDialog open title={label || "Gambar formulir"} closeLabel="Tutup" theme={theme} onDismiss={() => setOpen(false)}>
      {current?.error ? <>
        <Copy status="error">Gambar belum bisa dibuka.</Copy>
        <Action onPress={() => retry(value => value + 1)}>Coba lagi</Action>
      </> : current?.uri ? <Image source={{ uri: current.uri }} resizeMode="contain" style={styles.image}
        accessibilityLabel={label || "Gambar formulir"} onError={() => setPreview({ source: url, error: true })} /> : <Copy>Memuat gambar…</Copy>}
    </SharedDialog> : null}
  </>;
}

const styles = StyleSheet.create({ image: { width: "100%", aspectRatio: 1 } });
