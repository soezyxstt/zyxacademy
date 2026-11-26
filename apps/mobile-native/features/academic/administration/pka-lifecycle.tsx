import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { pkaScheduleCreationNeedsDelivery, type PkaLifecycleCommand } from "../../../../../packages/academic/pka-lifecycle";
import { pkaAnnouncementBodyLimit, pkaAnnouncementTitleLimit, validatePkaAnnouncementText } from "../../../../../packages/academic/pka-announcement-edit";
import { isValidPkaScheduleText } from "../../../../../packages/academic/pka-schedule-edit";
import type { AcademicTransport } from "../client";
import { submitPkaLifecycle, type PkaLifecycleAttempt } from "./pka-lifecycle-client";
import { Action, combineDateTime, CourseDialog, Field, Ink, layout, splitDateTime } from "./ui";

type PkaCreateAction = "create-schedule" | "send-announcement";
export type PkaLifecycleTarget =
  | { action: PkaCreateAction }
  | { command: Exclude<PkaLifecycleCommand, { action: PkaCreateAction }>; title: string };
export type PkaLifecycleRecovery = { attempt: PkaLifecycleAttempt; target: PkaLifecycleTarget };
const attempts = new WeakMap<AcademicTransport, PkaLifecycleRecovery>();

export function recoverPkaLifecycle(transport: AcademicTransport) { return attempts.get(transport); }
export function clearPkaLifecycle(transport: AcademicTransport) { attempts.delete(transport); }

export function PkaLifecycleDialog({ target, recovery, transport, close, reload, saved, denied }: {
  target: PkaLifecycleTarget; recovery?: PkaLifecycleRecovery; transport: AcademicTransport;
  close(): void; reload(): void; saved(action: PkaLifecycleCommand["action"], delivery?: "queued"): void; denied(): void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [uncertain, setUncertain] = useState(recovery?.attempt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [target, transport]);

  function submit(attempt: PkaLifecycleAttempt) {
    if (pending.current) return;
    const request = new AbortController();
    pending.current = request;
    const recovery = { attempt, target };
    attempts.set(transport, recovery);
    setBusy(true);
    setError("");
    void submitPkaLifecycle(transport, attempt, request.signal).then(result => {
      if (request.signal.aborted) return;
      if (result.status === "uncertain") {
        setUncertain(attempt);
        return;
      }
      if (attempts.get(transport) === recovery) attempts.delete(transport);
      setUncertain(undefined);
      switch (result.status) {
        case "saved": saved(attempt.command.action, result.delivery); break;
        case "conflict": setConflict(true); break;
        case "missing": reload(); break;
        case "denied": denied(); break;
        case "invalid": setError("Periksa judul, tanggal, jam dan tautan HTTPS."); break;
      }
    }).catch(() => {
      if (!request.signal.aborted) setUncertain(attempt);
    }).finally(() => {
      if (pending.current === request) pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    });
  }

  function confirm() {
    if ("command" in target) {
      submit({ command: target.command, requestId: randomUUID() });
      return;
    }
    if (target.action === "send-announcement") {
      const fields = { title: title.trim(), body: body.trim() };
      const error = validatePkaAnnouncementText(fields);
      if (error) { setError(error); return; }
      submit({ command: { action: "send-announcement", ...fields }, requestId: randomUUID() });
      return;
    }
    const sessionAt = combineDateTime(date, time);
    const dateValue = Date.parse(sessionAt);
    if (!isValidPkaScheduleText(title.trim()) || !Number.isFinite(dateValue)) {
      setError("Isi judul, tanggal dan jam (WIB).");
      return;
    }
    const normalized = splitDateTime(sessionAt);
    if (normalized.date !== date.trim() || normalized.time !== time.trim()) {
      setError("Tanggal atau jam (WIB) tidak valid.");
      return;
    }
    submit({ command: { action: "create-schedule", title: title.trim(), sessionAt, meetLink: meetLink.trim() || null }, requestId: randomUUID() });
  }

  const create = "action" in target && target.action === "create-schedule";
  const send = "action" in target && target.action === "send-announcement";
  const change = "command" in target ? target.command : null;
  const remove = change?.action === "delete-schedule";
  const toggle = change?.action === "announcement-state"
    ? change.field === "archived" ? change.value ? "Arsipkan" : "Pulihkan" : change.value ? "Sematkan" : "Lepas sematan" : "";
  const heading = create ? "Buat jadwal PKA" : send ? "Buat pengumuman PKA" : remove ? "Hapus jadwal PKA?" : `${toggle} pengumuman?`;
  const editable = !busy && !uncertain && !conflict;
  const pendingFields = uncertain?.command.action === "create-schedule" ? uncertain.command : undefined;
  const pendingAnnouncement = uncertain?.command.action === "send-announcement" ? uncertain.command : undefined;
  const upcoming = pkaScheduleCreationNeedsDelivery(new Date(combineDateTime(date, time)));
  return <CourseDialog title={heading} onClose={close} dismissDisabled={busy} testID="academic-live-pka-lifecycle">
    {"title" in target && <Ink kind="strong">{target.title}</Ink>}
    {create ? <>
      <Field label="Judul sesi" value={pendingFields?.title ?? title} onChangeText={setTitle} maxLength={180} editable={editable} />
      <View style={layout.row}>
        <Field label="Tanggal (YYYY-MM-DD)" value={pendingFields?.sessionAt.slice(0, 10) ?? date} onChangeText={setDate} maxLength={10} editable={editable} />
        <Field label="Jam (WIB)" value={pendingFields?.sessionAt.slice(11, 16) ?? time} onChangeText={setTime} maxLength={5} editable={editable} />
      </View>
      <Field label="Tautan Meet" value={pendingFields?.meetLink ?? meetLink} onChangeText={setMeetLink} maxLength={250}
        autoCapitalize="none" keyboardType="url" editable={editable} />
    </> : null}
    {send ? <>
      <Field label="Judul pengumuman" value={pendingAnnouncement?.title ?? title} onChangeText={setTitle}
        maxLength={pkaAnnouncementTitleLimit} editable={editable} />
      <Field label="Isi pengumuman" value={pendingAnnouncement?.body ?? body} onChangeText={setBody}
        maxLength={pkaAnnouncementBodyLimit} multiline editable={editable} />
      <Ink>Peserta PKA menerima pemberitahuan sesuai preferensi mereka.</Ink>
    </> : null}
    {error ? <Ink tone="error">{error}</Ink> : null}
    {conflict ? <>
      <Ink tone="error">Data sudah berubah. Muat ulang sebelum melanjutkan.</Ink>
      <Action label="Muat ulang" onPress={reload} />
    </> : uncertain ? <>
      <Ink>Hasil penyimpanan belum diketahui.</Ink>
      <Action label="Periksa dengan percobaan ulang" onPress={() => submit(uncertain)} disabled={busy} />
    </> : <View style={layout.row}>
      <Action label={create ? upcoming ? "Simpan dan beri tahu peserta" : "Simpan jadwal" : send ? "Kirim pengumuman" : remove ? "Hapus jadwal" : toggle}
        variation={remove ? "destructive" : "default"} onPress={confirm} disabled={busy} />
      <Action label="Batal" onPress={close} disabled={busy} />
    </View>}
  </CourseDialog>;
}
