import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AdminTutorialCommand, AdminTutorialSchedule, TutorialBooking, TutorialSlot, TutorialTutor } from "../../../../../packages/academic/admin-tutorial-operations";
import type { AcademicTransport } from "../client";
import { Action, CourseDialog, Field, Ink, layout, MultiChoice, Picker } from "./ui";
import { pendingTutorialOperation, submitTutorialOperation, type TutorialAttempt } from "./tutorial-operations-client";

export type TutorialTarget =
  | { kind: "create-availability" }
  | { kind: "delete-availability" | "assign"; slot: TutorialSlot }
  | { kind: "move" | "cancel"; slot: TutorialSlot; booking: TutorialBooking }
  | { kind: "qualifications"; tutor: TutorialTutor }
  | { kind: "recover" };

const labels = {
  "create-availability": "Tambah ketersediaan tutor", "delete-availability": "Hapus ketersediaan",
  assign: "Tugaskan sesi", move: "Pindahkan sesi", cancel: "Batalkan sesi", qualifications: "Simpan kualifikasi",
  recover: "Periksa perubahan tutorial",
};
const errors: Record<string, string> = {
  TUTOR_NOT_FOUND: "Tutor tidak ditemukan.", TUTOR_ASSIGNMENT_SUBJECT_NOT_FOUND: "Tutor tidak ditemukan.", NOT_A_TUTOR: "Pengguna ini bukan tutor.", TUTOR_INACTIVE: "Tutor tidak aktif.",
  COURSE_NOT_FOUND: "Mata kuliah tidak tersedia.", COURSE_INACTIVE_OR_NOT_FOUND: "Mata kuliah tidak aktif.",
  SLOT_NOT_FOUND: "Slot tidak tersedia.", TARGET_SLOT_NOT_FOUND: "Slot tujuan tidak tersedia.", BOOKING_NOT_FOUND: "Sesi tidak ditemukan.",
  SLOT_ALREADY_BOOKED: "Slot sudah terisi atau memiliki riwayat sesi.", TARGET_SLOT_BOOKED: "Slot tujuan sudah terisi.",
  BOOKING_TERMINAL_STATE: "Sesi sudah selesai atau dibatalkan.",
  TUTOR_SLOT_OVERLAP: "Waktu ini bertumpang tindih dengan ketersediaan tutor.", DUPLICATE_TUTOR_SLOT: "Slot ini sudah ada.",
  INVALID_SESSION_DATE: "Tanggal sesi tidak valid.", INVALID_DURATION_NOT_90_MINUTES: "Durasi sesi harus 90 menit.",
  INVALID_TIME_FORMAT: "Masukkan jam dengan format HH:MM.", LOCATION_REQUIRED_FOR_OFFLINE: "Isi lokasi sesi tatap muka.",
  TUTOR_NOT_ASSIGNED_TO_COURSE: "Tutor belum memiliki kualifikasi untuk mata kuliah ini.",
  GROUP_NOT_FOUND: "Kelompok tidak ditemukan.", GROUP_NOT_ACTIVE: "Kelompok tidak aktif.",
  GROUP_COURSE_NOT_ENROLLED: "Kelompok belum terdaftar pada mata kuliah ini.",
  GROUP_HAS_NO_MEMBERS: "Kelompok belum memiliki anggota.", GROUP_NOT_ELIGIBLE: "Kelompok belum memenuhi syarat penugasan.",
  TOTAL_QUOTA_EXCEEDED: "Kuota sesi kelompok sudah tercapai.", WEEKLY_QUOTA_EXCEEDED: "Kuota sesi mingguan kelompok sudah tercapai.",
  REQUEST_CONFLICT: "Permintaan berubah. Muat ulang jadwal.",
  REVISION_CONFLICT: "Jadwal atau kualifikasi sudah berubah. Muat versi terbaru.",
};

export const tutorialSlotLabel = (slot: TutorialSlot) => `${slot.date} · ${slot.start} sampai ${slot.end} WIB · ${slot.tutorName}`;

export function AdminTutorialEditor({ target, data, transport, close, refresh, saved, denied }: {
  target: TutorialTarget; data: AdminTutorialSchedule; transport: AcademicTransport; close(): void; refresh(): void;
  saved(action: AdminTutorialCommand["action"]): void; denied(): void;
}) {
  const [tutorId, setTutor] = useState("");
  const [date, setDate] = useState(data.weekStart);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [groupId, setGroup] = useState("");
  const [courseId, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [destinationId, setDestination] = useState("");
  const [chosenCourses, setChosenCourses] = useState(target.kind === "qualifications" ? target.tutor.courseIds : []);
  const [uncertain, setUncertain] = useState(() => pendingTutorialOperation(transport));
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => { operation.current?.abort(); }, [transport]);

  function submit(attempt: TutorialAttempt) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    void submitTutorialOperation(transport, attempt, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.status === "saved") return saved(attempt.command.action);
      if (result.status === "denied") return denied();
      if (result.status === "uncertain") { setUncertain(pendingTutorialOperation(transport) ?? attempt); return; }
      setUncertain(undefined);
      setError(Object.hasOwn(errors, result.code) ? errors[result.code] : "Periksa isian dan coba lagi.");
      setStale(result.status === "missing" || result.code === "REQUEST_CONFLICT" || result.code === "REVISION_CONFLICT" ||
        result.code === "SLOT_ALREADY_BOOKED" || result.code === "TARGET_SLOT_BOOKED" || result.code === "BOOKING_TERMINAL_STATE");
    }).finally(() => {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    });
  }

  function draft(): AdminTutorialCommand | null {
    if (target.kind === "recover") return null;
    if (target.kind === "qualifications") return { action: "qualifications", id: target.tutor.id,
      expectedRevision: target.tutor.revision, courseIds: chosenCourses };
    const explanation = reason.trim();
    if (!explanation) return null;
    if (target.kind === "create-availability") {
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      const hour = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (!tutorId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !hour.test(start) || !hour.test(end) ||
        minutes(end) - minutes(start) !== 90 || (mode === "offline" && !location.trim())) return null;
      return { action: "create-availability", tutorId, sessionDate: date, startTime: start, endTime: end,
        mode, location: mode === "offline" ? location.trim() : null, reason: explanation };
    }
    if (target.kind === "delete-availability") return { action: "delete-availability", id: target.slot.id,
      expectedRevision: target.slot.revision, reason: explanation };
    if (target.kind === "assign") return groupId && courseId ? { action: "assign", id: target.slot.id,
      expectedRevision: target.slot.revision, groupId, courseId, topic: topic.trim() || null, reason: explanation } : null;
    if (!("booking" in target)) return null;
    const booking = { id: target.booking.id, expectedRevision: target.booking.revision, reason: explanation };
    if (target.kind === "cancel") return { ...booking, action: "cancel" };
    const destination = data.slots.find(slot => slot.id === destinationId && slot.id !== target.slot.id && !slot.booking);
    return destination ? { ...booking, action: "move", targetSlotId: destination.id, expectedTargetRevision: destination.revision } : null;
  }

  function save() {
    if (uncertain) return submit(uncertain);
    const command = draft();
    if (!command) {
      setError(target.kind === "create-availability" ? "Isi tutor, tanggal (YYYY-MM-DD), jam sesi 90 menit, dan alasan. Sesi tatap muka memerlukan lokasi." : "Lengkapi pilihan dan alasan perubahan.");
      return;
    }
    submit({ command, requestId: randomUUID() });
  }

  const editable = !busy && !uncertain && !stale;
  const title = uncertain ? labels.recover : target.kind === "qualifications" ? "Kualifikasi tutor" : labels[target.kind];
  const destructive = target.kind === "delete-availability" || target.kind === "cancel";
  const group = data.groups.find(item => item.id === groupId);
  const choices = group ? [...data.courses].sort((a, b) => Number(group.courseIds.includes(b.id)) - Number(group.courseIds.includes(a.id))) : data.courses;
  return <CourseDialog title={title} onClose={close} dismissDisabled={busy} testID="admin-tutorial-editor">
    {uncertain ? <Ink>{labels[uncertain.command.action]}. Hasil perubahan belum diketahui.</Ink> : <>
      {"slot" in target ? <Ink>{tutorialSlotLabel(target.slot)}</Ink> : null}
      {"booking" in target ? <Ink>{target.booking.label}</Ink> : null}
      {target.kind === "create-availability" ? <>
        <Picker label="Tutor" options={data.tutors} selected={tutorId} onSelect={setTutor} disabled={!editable} />
        <Field label="Tanggal (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={editable} maxLength={10} />
        <Field label="Jam mulai WIB" value={start} onChangeText={setStart} placeholder="09:00" editable={editable} maxLength={5} />
        <Field label="Jam selesai WIB" value={end} onChangeText={setEnd} placeholder="10:30" editable={editable} maxLength={5} />
        <Picker label="Moda" options={[{ id: "online", label: "Daring" }, { id: "offline", label: "Tatap muka" }]}
          selected={mode} onSelect={value => setMode(value === "offline" ? "offline" : "online")} disabled={!editable} />
        {mode === "offline" ? <Field label="Lokasi" value={location} onChangeText={setLocation} editable={editable} maxLength={500} /> : null}
      </> : null}
      {target.kind === "assign" ? <>
        <Picker label="Kelompok aktif" options={data.groups} selected={groupId} onSelect={setGroup} disabled={!editable} />
        <Picker label="Mata kuliah" options={choices} selected={courseId} onSelect={setCourse} disabled={!editable} />
        <Field label="Topik (opsional)" value={topic} onChangeText={setTopic} editable={editable} maxLength={2000} />
      </> : null}
      {target.kind === "move" ? <Picker label="Slot pengganti" options={data.slots.filter(slot => slot.id !== target.slot.id && !slot.booking)
        .map(slot => ({ id: slot.id, label: tutorialSlotLabel(slot) }))} selected={destinationId}
        onSelect={setDestination} disabled={!editable} /> : null}
      {target.kind === "qualifications" ? <>
        <Ink kind="strong">{target.tutor.label}</Ink>
        <MultiChoice label="Mata kuliah yang dapat diajar" options={data.courses} chosen={chosenCourses} change={setChosenCourses} disabled={!editable} />
      </> : target.kind !== "recover" ? <Field label="Alasan perubahan" value={reason} onChangeText={setReason} multiline
        editable={editable} maxLength={2000} testID="admin-tutorial-reason" /> : null}
    </>}
    {error ? <Ink tone="error">{error}</Ink> : null}
    {busy ? <Ink>Menyimpan perubahan…</Ink> : null}
    <View style={layout.row}>
      <Action label="Tutup" onPress={close} disabled={busy} />
      {stale ? <Action label="Muat ulang" onPress={refresh} /> : target.kind !== "recover" || uncertain
        ? <Action label={uncertain ? "Periksa hasil" : labels[target.kind]} variation={destructive ? "destructive" : "default"}
          onPress={save} disabled={busy} testID="admin-tutorial-submit" /> : null}
    </View>
  </CourseDialog>;
}
