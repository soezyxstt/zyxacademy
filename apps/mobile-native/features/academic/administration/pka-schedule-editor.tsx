import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import {
  isValidPkaScheduleText, pkaScheduleUpdateNeedsDelivery, rebasePkaScheduleFields, type PkaScheduleEdit, type PkaScheduleRevision,
} from "../../../../../packages/academic/pka-schedule-edit";
import { NATIVE_STAGING_ORIGIN } from "../../../auth/session-api";
import type { AcademicTransport } from "../client";
import { savePkaSchedule } from "./pka-schedule-client";
import { Action, combineDateTime, CourseDialog, dateTimeLabel, Field, Ink, layout, SaveButtons, splitDateTime } from "./ui";

type Pending = { base: PkaScheduleRevision; draft: PkaScheduleEdit; requestId: string };
const pendingEdits = new WeakMap<AcademicTransport, Map<string, Pending>>();

export function clearPkaScheduleRecovery(transport: AcademicTransport) {
  pendingEdits.delete(transport);
}

export function PkaScheduleEditor({ id, initial, transport, close, saved, unavailable }: {
  id: string; initial: PkaScheduleRevision; transport: AcademicTransport;
  close(): void; saved(delivery?: "queued"): void; unavailable(status: "denied" | "missing"): void;
}) {
  const recovered = pendingEdits.get(transport)?.get(id);
  const original = recovered?.draft ?? initial;
  const [title, setTitle] = useState(original.title);
  const [dateTime, setDateTime] = useState(() => splitDateTime(original.sessionAt));
  const [meetLink, setMeetLink] = useState(original.meetLink ?? "");
  const [base, setBase] = useState(recovered?.base ?? initial);
  const [conflict, setConflict] = useState<PkaScheduleRevision>();
  const [uncertain, setUncertain] = useState<Pending | undefined>(recovered);
  const [error, setError] = useState("");
  const [webDelivery, setWebDelivery] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => { inFlight.current?.abort(); inFlight.current = undefined; }, [transport]);

  function submit(pending: Pending) {
    if (inFlight.current) return;
    let commands = pendingEdits.get(transport);
    if (!commands) {
      commands = new Map();
      pendingEdits.set(transport, commands);
    }
    commands.set(id, pending);
    const active = new AbortController();
    inFlight.current = active;
    setError("");
    setWebDelivery(false);
    setBusy(true);
    void savePkaSchedule(transport, id, pending.draft, pending.requestId, active.signal).then((result) => {
      if (active.signal.aborted) return;
      if (result.status === "uncertain") {
        setUncertain(pending);
        return;
      }
      if (commands.get(id) === pending) commands.delete(id);
      setUncertain(undefined);
      switch (result.status) {
        case "saved": saved(result.delivery); break;
        case "conflict": setConflict(result.schedule); break;
        case "denied":
        case "missing": unavailable(result.status); break;
        case "invalid": setError("Periksa judul, tanggal dan tautan HTTPS."); break;
        case "request_conflict": setError("Permintaan sudah digunakan. Tutup lalu muat ulang jadwal."); break;
        case "web_delivery": setWebDelivery(true); break;
      }
    }).catch(() => {
      if (!active.signal.aborted) setUncertain(pending);
    }).finally(() => {
      if (inFlight.current === active) inFlight.current = undefined;
      if (!active.signal.aborted) setBusy(false);
    });
  }

  function fields() {
    const previous = splitDateTime(base.sessionAt);
    const sessionAt = dateTime.date === previous.date && dateTime.time === previous.time
      ? base.sessionAt : combineDateTime(dateTime.date, dateTime.time);
    return { title: title.trim(), sessionAt, meetLink: meetLink.trim() || null };
  }

  function start() {
    const draft = fields();
    if (!isValidPkaScheduleText(draft.title) || !Number.isFinite(Date.parse(draft.sessionAt))) {
      setError("Isi judul, tanggal dan jam (WIB).");
      return;
    }
    if (draft.meetLink && !isValidPkaScheduleText(draft.meetLink)) {
      setError("Periksa tautan HTTPS.");
      return;
    }
    submit({ base, draft: { ...draft, expectedRevision: base.revision }, requestId: randomUUID() });
  }

  function adoptLatest(latest: PkaScheduleRevision) {
    const draft = fields();
    const rebased = rebasePkaScheduleFields(base, draft, latest);
    setTitle(rebased.title);
    setMeetLink(rebased.meetLink ?? "");
    if (rebased.sessionAt !== draft.sessionAt) setDateTime(splitDateTime(rebased.sessionAt));
    setBase(latest);
    setConflict(undefined);
  }

  const editable = !busy && !uncertain;
  const informsParticipants = pkaScheduleUpdateNeedsDelivery(base.meetLink, fields());
  return <CourseDialog title="Edit jadwal PKA" onClose={close} dismissDisabled={busy}>
    <Field label="Judul sesi" value={title} editable={editable} onChangeText={setTitle} testID="academic-live-pka-schedule-title" />
    <Field label="Tanggal sesi (YYYY-MM-DD)" value={dateTime.date} maxLength={10} editable={editable}
      onChangeText={(date) => setDateTime((current) => ({ ...current, date }))} />
    <Field label="Jam sesi (WIB)" value={dateTime.time} maxLength={5} editable={editable}
      onChangeText={(time) => setDateTime((current) => ({ ...current, time }))} />
    <Field label="Tautan Meet" value={meetLink} editable={editable} autoCapitalize="none" testID="academic-live-pka-schedule-meet"
      onChangeText={setMeetLink} />
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
    {webDelivery ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink>Tautan Meet untuk sesi mendatang dikirim ke peserta dari editor web.</Ink>
      <Action label="Buka jadwal PKA di web" onPress={() => {
        void Linking.openURL(`${NATIVE_STAGING_ORIGIN}/admin/tutorial-pka/schedules`).catch(() => setError("Jadwal web gagal dibuka."));
      }} />
    </View> : null}
    {conflict ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink tone="error">Jadwal sudah diubah. Tinjau jadwal terbaru sebelum menyimpan.</Ink>
      <Ink kind="strong">{conflict.title}</Ink>
      <Ink>{dateTimeLabel(conflict.sessionAt)}</Ink>
      {conflict.meetLink ? <Ink>{conflict.meetLink}</Ink> : null}
      <View style={layout.row}>
        <Action label="Gunakan revisi terbaru" onPress={() => adoptLatest(conflict)} />
        <Action label="Batal" onPress={close} />
      </View>
    </View> : null}
    {uncertain ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink>Hasil penyimpanan belum diketahui.</Ink>
      <Action label="Periksa dengan percobaan ulang" onPress={() => submit(uncertain)} disabled={busy} />
    </View> : null}
    {!conflict && !uncertain ? <SaveButtons onSave={start} onCancel={close} busy={busy}
      saveLabel={informsParticipants ? "Simpan dan beri tahu peserta" : "Simpan"} /> : null}
  </CourseDialog>;
}
