import { randomUUID } from "expo-crypto";
import { openBrowserAsync } from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { SpreadsheetExportPayload } from "../../../../lib/export-spreadsheet-client";
import { validFormSheetUrl } from "../../../../packages/native-parity/operations/form-sheets";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import type { AcademicTransport } from "./client";
import { Action, CourseDialog, Ink, layout } from "./courses/ui";

const endpoint = "/api/admin/export-spreadsheet";
const conflictText: Record<string, string> = { block_modified: "Isi ekspor telah diedit.", manual_rows: "Ada baris tambahan.", manual_columns: "Ada kolom tambahan." };
type Pending = { payload: SpreadsheetExportPayload; revision?: string; issues?: string[] };

export function NativeSpreadsheetExport({ transport, entityType, entityId, count, filtered, build }: {
  transport: AcademicTransport; entityType: "quiz" | "pka"; entityId: string;
  count: number; filtered: boolean; build(): SpreadsheetExportPayload;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const [pending, setPending] = useState<Pending>();
  const [url, setUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState(0);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ entityType, entityId });
    void transport.get(endpoint + "?" + query, controller.signal).then(async response => {
      const data = response.ok ? await response.json() as { spreadsheetUrl: unknown } : null;
      if (!controller.signal.aborted) setUrl(validFormSheetUrl(data?.spreadsheetUrl));
    }).catch(() => {});
    return () => { controller.abort(); };
  }, [transport, entityType, entityId, lookup]);
  useEffect(() => () => { flight.current?.abort(); flight.current = null; }, [transport, entityType, entityId]);

  async function submit(confirmed: Pending) {
    if (!canInteract() || !transport.command || flight.current || confirmed.payload.entityId !== entityId ||
      confirmed.payload.entityType !== entityType) return;
    const task = new AbortController();
    flight.current = task;
    setPending(undefined);
    setBusy(true);
    setNotice("");
    try {
      const body = confirmed.revision ? { ...confirmed.payload, confirmedRevision: confirmed.revision } : confirmed.payload;
      const response = await transport.command(endpoint, { method: "POST", body, requestId: randomUUID() }, task.signal);
      const result = await response.json() as { success?: boolean; needsConfirmation?: boolean; revision?: string;
        conflicts?: { code: string }[]; spreadsheetUrl?: string; isNew?: boolean; sharingIncomplete?: boolean; code?: string };
      if (task.signal.aborted || !canInteract()) return;
      if (response.ok && result.success && validFormSheetUrl(result.spreadsheetUrl)) {
        setUrl(validFormSheetUrl(result.spreadsheetUrl));
        setNotice(result.sharingIncomplete ? "Spreadsheet tersimpan. Sebagian akses editor belum dibagikan." : result.isNew ? "Spreadsheet dibuat." : "Spreadsheet diperbarui.");
      } else if (response.ok && result.needsConfirmation && typeof result.revision === "string" && /^[a-f0-9]{64}$/.test(result.revision) &&
        Array.isArray(result.conflicts) && result.conflicts.length && result.conflicts.every(c => Object.hasOwn(conflictText, c.code))) {
        setPending({ payload: confirmed.payload, revision: result.revision, issues: result.conflicts.map(c => conflictText[c.code]) });
      } else if (response.status === 401 || response.status === 403) setNotice("Akses Admin diperlukan.");
      else if (result.code === "credentials" || result.code === "apiDisabled" || result.code === "permission") setNotice("Periksa koneksi Google Sheets dan izin akun Admin.");
      else throw new Error("Sheet export unconfirmed");
    } catch {
      if (!task.signal.aborted && canInteract()) { setNotice("Ekspor belum terkonfirmasi. Periksa spreadsheet sebelum mencoba lagi."); setLookup(n => n + 1); }
    } finally { if (flight.current === task) { flight.current = null; setBusy(false); } }
  }
  return <View style={layout.group}>
    <View style={layout.row}>
      {url && <Action label="Buka Google Sheets" disabled={suspended || busy} onPress={() => { if (canInteract()) void openBrowserAsync(url).catch(() => setNotice("Spreadsheet tidak dapat dibuka.")); }} />}
      <Action label={busy ? "Mengekspor…" : url ? "Perbarui spreadsheet" : "Ekspor ke Google Sheets"} disabled={busy || !count || suspended || !transport.command}
        onPress={() => {
          if (!canInteract()) return;
          const payload = build();
          if (filtered) setPending({ payload });
          else void submit({ payload });
        }} />
    </View>
    {notice ? <Ink kind="meta">{notice}</Ink> : null}
    {pending ? <CourseDialog title={pending.revision ? "Timpa perubahan spreadsheet?" : "Ekspor hasil filter?"} onClose={() => setPending(undefined)}>
      <Ink>{pending.payload.title} · {pending.payload.rows.length} baris</Ink>
      {pending.issues?.map(issue => <Ink key={issue}>{issue}</Ink>)}
      <Action label={pending.revision ? "Timpa dan ekspor" : "Ekspor hasil filter"} disabled={suspended || busy} onPress={() => void submit(pending)} />
    </CourseDialog> : null}
  </View>;
}
