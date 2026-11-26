import { useEffect, useState } from "react";
import { Image, StyleSheet, Text } from "react-native";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useAssessment, useAssessmentColors, useAssessmentCopy } from "./ui";
import { assessmentMedia } from "./visual-markdown";

export function AssessmentImage({ raw, alt }: { raw: string; alt: string }) {
  const { session, openAssessmentImage, focused } = useAssessment();
  const { tx } = useAssessmentCopy();
  const { suspended, canInteract } = useProtectedInteraction();
  const colors = useAssessmentColors();
  const media = assessmentMedia(raw, session.origin);
  const path = media?.kind === "storage-image" ? media.path : undefined;
  const [resolved, setResolved] = useState<{ path: string; uri: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setResolved(undefined);
    setFailed(false);
    if (!path || !openAssessmentImage || suspended || focused === false || !canInteract()) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void openAssessmentImage(path, controller.signal).then(asset => {
      if (controller.signal.aborted) { asset.release(); return; }
      release = asset.release;
      setResolved({ path, uri: asset.uri });
    }, () => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); release?.(); };
  }, [path, openAssessmentImage, focused, suspended, canInteract]);

  const fallback = tx("Gambar belum dapat dimuat.", "The image could not be loaded.");
  const uri = media?.kind === "image" ? media.uri : resolved?.path === path && !suspended && focused !== false ? resolved?.uri : undefined;
  if (failed || !media || (path && !openAssessmentImage)) return <Text style={{ color: colors.mutedForeground }}>{alt ? `${alt}. ${fallback}` : fallback}</Text>;
  if (!uri) return <Text style={{ color: colors.mutedForeground }}>{alt || tx("Memuat gambar", "Loading image")}</Text>;
  return <Image accessible accessibilityRole="image" accessibilityLabel={alt || tx("Gambar soal", "Question image")}
    source={{ uri }} resizeMode="contain" onError={() => setFailed(true)} style={styles.image} />;
}

const styles = StyleSheet.create({
  image: { width: "100%", height: 192, marginVertical: 4 },
});
