import { randomUUID } from "expo-crypto";
import { useContext, useEffect, useRef, useState } from "react";
import { isMetadataSuggestion, isMetadataValues, type DocumentSource, type MetadataSuggestion, type MetadataValues } from "../../../../../packages/native-parity/academic/courses/document-suggestion";
import { TextDocumentTransport } from "./document-transport";
import { Action, CourseStatus, Ink } from "./ui";

type Props = {
  slug: string; id: string; source: DocumentSource; values: MetadataValues; disabled: boolean;
  onSuggested(value: MetadataSuggestion): void;
};

export function DocumentSuggestion({ slug, id, source, values, disabled, onSuggested }: Props) {
  const transport = useContext(TextDocumentTransport);
  const pending = useRef<AbortController | null>(null);
  const [result, setResult] = useState<MetadataSuggestion | "loading" | "error" | null>(null);
  const input = JSON.stringify([slug, id, source, values.title, values.category, values.subcategory, values.year, disabled]);
  useEffect(() => {
    setResult(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [transport, input]);
  if (!transport?.command) return null;
  const command = transport.command;
  async function suggest() {
    if (pending.current || disabled || !isMetadataValues(values)) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult("loading");
    try {
      const path = "/api/native/academic-document/" + encodeURIComponent(slug) + "/" + encodeURIComponent(id) + "/suggestion";
      const response = await command(path, { method: "POST", body: { source, values }, requestId: randomUUID() }, controller.signal);
      if (!response.ok) throw new Error("Suggestion unavailable");
      const data: unknown = await response.json();
      if (!isMetadataSuggestion(data)) throw new Error("Invalid suggestion");
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setResult("error");
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  return <>
    <Action label="Sarankan format dokumen" onPress={() => void suggest()} disabled={disabled || result === "loading" || !isMetadataValues(values)} />
    {result === "loading" && <CourseStatus label="Menyiapkan saran…" />}
    {result === "error" && <CourseStatus label="Saran belum tersedia. Anda tetap bisa mengedit dokumen." error />}
    {result && typeof result === "object" && <>
      <Ink>{result.title}</Ink>
      <Action label="Terapkan ke draf" disabled={disabled} onPress={() => { onSuggested(result); setResult(null); }} />
    </>}
  </>;
}
