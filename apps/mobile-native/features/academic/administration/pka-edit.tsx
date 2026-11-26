import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  pkaAnnouncementBodyLimit, pkaAnnouncementTitleLimit, validatePkaAnnouncementText,
  type PkaAnnouncementEdit, type PkaAnnouncementRevision,
} from "../../../../../packages/academic/pka-announcement-edit";
import type { AcademicTransport } from "../client";
import { savePkaAnnouncement } from "./pka-edit-client";
import { Action, CourseDialog, Field, Ink, SaveButtons, layout } from "./ui";

type Pending = { draft: PkaAnnouncementEdit; requestId: string };

export function PkaAnnouncementEditor({ id, initial, transport, cancel, saved }: {
  id: string; initial: PkaAnnouncementRevision; transport: AcademicTransport;
  cancel(): void; saved(): void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [revision, setRevision] = useState(initial.revision);
  const [conflict, setConflict] = useState<PkaAnnouncementRevision>();
  const [uncertain, setUncertain] = useState<Pending>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      inFlight.current = undefined;
    };
  }, [transport]);

  function submit(pending: Pending) {
    if (inFlight.current) return;
    const active = new AbortController();
    inFlight.current = active;
    setError("");
    setBusy(true);
    savePkaAnnouncement(transport, id, pending.draft, pending.requestId, active.signal).then((result) => {
      if (active.signal.aborted) return;
      if (result.status === "uncertain") {
        setUncertain(pending);
        return;
      }
      setUncertain(undefined);
      switch (result.status) {
        case "saved": saved(); break;
        case "conflict": setConflict(result.announcement); break;
        case "invalid": setError("Periksa judul dan isi pengumuman."); break;
        case "missing": setError("Pengumuman tidak ditemukan."); break;
        case "denied": setError("Akses admin diperlukan. Periksa sesi Anda."); break;
        case "request_conflict": setError("Identitas permintaan telah digunakan. Muat ulang pengumuman."); break;
      }
    }).catch(() => {
      if (!active.signal.aborted) setUncertain(pending);
    }).finally(() => {
      if (inFlight.current === active) inFlight.current = undefined;
      if (!active.signal.aborted) setBusy(false);
    });
  }

  function start() {
    const draft = { title: title.trim(), body: body.trim(), expectedRevision: revision };
    const errorMessage = validatePkaAnnouncementText(draft);
    if (errorMessage) { setError(errorMessage); return; }
    submit({ draft, requestId: randomUUID() });
  }

  return <CourseDialog title="Edit pengumuman PKA" onClose={cancel} dismissDisabled={busy}>
    <Field label="Judul pengumuman" value={title} maxLength={pkaAnnouncementTitleLimit} editable={!busy && !uncertain}
      onChangeText={(value) => { setTitle(value); setError(""); }} testID="academic-live-pka-edit-title" />
    <Field label="Isi pengumuman" value={body} maxLength={pkaAnnouncementBodyLimit} multiline editable={!busy && !uncertain}
      onChangeText={(value) => { setBody(value); setError(""); }} />
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
    {conflict ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink tone="error">Pengumuman sudah diubah. Tinjau teks terbaru sebelum menyimpan.</Ink>
      <Ink kind="strong">{conflict.title}</Ink>
      <Ink>{conflict.body}</Ink>
      <View style={layout.row}>
        <Action label="Gunakan revisi terbaru" onPress={() => { setRevision(conflict.revision); setConflict(undefined); }} />
        <Action label="Batal" onPress={cancel} />
      </View>
    </View> : null}
    {uncertain ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink>Hasil penyimpanan belum diketahui.</Ink>
      <View style={layout.row}>
        <Action label="Periksa dengan percobaan ulang" onPress={() => submit(uncertain)} disabled={busy} />
        <Action label="Tutup" onPress={cancel} disabled={busy} />
      </View>
    </View> : null}
    {!conflict && !uncertain ? <SaveButtons onSave={start} onCancel={cancel} busy={busy} /> : null}
  </CourseDialog>;
}
