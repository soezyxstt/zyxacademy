import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { View } from "react-native";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { publishedFormLinks, respondentLink } from "./links";
import { Action, Copy, styles, useManagement } from "./ui";

export function FormClipboardActions({ actions }: { actions: ReadonlyArray<{ label: string; text: string }> }) {
  const { canInteract } = useProtectedInteraction();
  const scope = useRef<symbol | null>(null);
  const inProgress = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  useFocusEffect(useCallback(() => {
    scope.current = Symbol();
    inProgress.current = false;
    setBusy(null);
    setFeedback(null);
    return () => { scope.current = null; };
  }, []));

  async function copy({ label, text }: { label: string; text: string }) {
    const current = scope.current;
    if (!current || inProgress.current || !canInteract()) return;
    inProgress.current = true;
    setBusy(label);
    setFeedback(null);
    let result = false;
    try { result = await Clipboard.setStringAsync(text); }
    catch { result = false; }
    if (scope.current !== current || !canInteract()) return;
    inProgress.current = false;
    setBusy(null);
    setFeedback(result ? "success" : "error");
  }

  if (!actions.length) return null;
  return <View style={styles.field}>
    <View style={styles.row}>{actions.map(action => (
      <Action key={action.label} busy={busy === action.label} disabled={busy !== null} onPress={() => void copy(action)}>{action.label}</Action>
    ))}</View>
    {feedback && <Copy status={feedback}>{feedback === "success" ? "Disalin." : "Belum dapat disalin. Coba lagi."}</Copy>}
  </View>;
}

export function PublishedFormActions({ id, slug }: { id: string; slug: string }) {
  const { navigate, origin } = useManagement();
  const { canInteract } = useProtectedInteraction();
  const respondent = respondentLink(slug);
  const links = publishedFormLinks(id, slug, origin);
  const actions = [
    ...(links.short ? [{ label: "Salin tautan pendek", text: links.short }] : []),
    ...(links.full ? [{ label: "Salin tautan lengkap", text: links.full }] : []),
  ];
  return <View style={styles.field}>
    {respondent && <Action onPress={() => { if (canInteract()) navigate(respondent); }}>Buka formulir</Action>}
    <FormClipboardActions actions={actions} />
  </View>;
}
