import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  rebaseStudyGroupFields, studyGroupSemesters, validateStudyGroupFields, type StudyGroupEditorRead, type StudyGroupFields,
  type StudyGroupRecord, type StudyGroupWrite,
} from "../../../../../packages/academic/study-group-edit";
import type { AcademicTransport } from "../client";
import { AdministrationReadError } from "./live-client";
import { readStudyGroupEditor, saveStudyGroup } from "./study-group-client";
import {
  Action, CourseDialog, CourseStatus, Field, Ink, MultiChoice, Picker, SaveButtons, SearchBox, dateLabel,
  layout, normalSearch, numberValue, splitDateTime,
} from "./ui";

type Pending = { command: StudyGroupWrite; requestId: string; baseline: StudyGroupFields };
const pendingGroups = new WeakMap<AcademicTransport, Map<string, Pending>>();
const slots = [
  { id: "reguler_15", label: "Reguler", quota: 15 }, { id: "intensif_30", label: "Intensif", quota: 30 },
  { id: "super_intensif_45", label: "Super intensif", quota: 45 }, { id: "custom", label: "Kustom", quota: undefined },
] as const;
const statuses = [
  { id: "active", label: "Aktif" }, { id: "completed", label: "Selesai" }, { id: "inactive", label: "Nonaktif" }, { id: "archived", label: "Diarsipkan" },
] as const;

function initialFields(): StudyGroupFields {
  const year = Number(splitDateTime(new Date().toISOString()).date.slice(0, 4));
  return { name: "", packageType: "reguler_15", totalQuotaSessions: 15, weeklyQuotaSessions: 15,
    academicYear: `${year}/${year + 1}`, semester: "Ganjil", startDate: null, endDate: null, status: "active", notes: "" };
}

function dateInput(value: string | null) {
  return value ? splitDateTime(value).date : "";
}

function parseDay(value: string, base: string | null, end = false) {
  if (!value) return null;
  if (value === dateInput(base)) return base;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !date.toISOString().startsWith(`${value}T`)) return "invalid";
  return `${value}T${end ? "23:59:59" : "00:00:00"}+07:00`;
}

export function LiveStudyGroupEditor({ id, transport, cancel, saved }: {
  id?: string; transport: AcademicTransport; cancel(): void; saved(): void;
}) {
  const [state, setState] = useState<{ data?: StudyGroupEditorRead; error?: string; retry?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readStudyGroupEditor(transport, id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof AdministrationReadError) {
        if (error.status === 401 || error.status === 403) return setState({ error: "Akses admin diperlukan. Periksa sesi Anda." });
        if (error.status === 404) return setState({ error: "Kelompok tidak tersedia untuk diedit." });
      }
      setState({ error: "Data kelompok gagal dimuat.", retry: true });
    });
    return () => controller.abort();
  }, [id, transport, attempt]);

  if (state.data) return <StudyGroupForm data={state.data} transport={transport} cancel={cancel} saved={saved} />;
  return <CourseDialog title={id ? "Edit kelompok" : "Buat kelompok"} onClose={cancel}>
    {state.error ? <CourseStatus label={state.error} error retry={state.retry ? () => {
      setState({});
      setAttempt(attempt + 1);
    } : undefined} /> : <CourseStatus label="Memuat data kelompok…" />}
  </CourseDialog>;
}

function StudyGroupForm({ data, transport, cancel, saved }: {
  data: StudyGroupEditorRead; transport: AcademicTransport; cancel(): void; saved(): void;
}) {
  const current = data.type === "edit" ? data.record : undefined;
  const key = current?.id ?? "create";
  const recovered = pendingGroups.get(transport)?.get(key);
  const initial: StudyGroupFields = recovered?.command.fields ?? current?.fields ?? initialFields();
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(recovered?.baseline ?? current?.fields ?? initial);
  const [reference, setReference] = useState(current);
  const [total, setTotal] = useState(String(initial.totalQuotaSessions));
  const [weekly, setWeekly] = useState(String(initial.weeklyQuotaSessions));
  const [start, setStart] = useState(dateInput(initial.startDate));
  const [end, setEnd] = useState(dateInput(initial.endDate));
  const [courseIds, setCourseIds] = useState(recovered?.command.type === "create" ? recovered.command.fields.courseIds : []);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(recovered?.command.type === "edit" ? recovered.command.fields.expectedRevision : current?.revision);
  const [conflict, setConflict] = useState<StudyGroupRecord>();
  const [uncertain, setUncertain] = useState<Pending | undefined>(recovered);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), [transport]);

  const change = <K extends keyof StudyGroupFields>(name: K, value: StudyGroupFields[K]) => {
    setDraft((previous) => ({ ...previous, [name]: value }));
    setError("");
  };
  const courses = data.type === "create" ? data.courses : reference?.courses ?? data.record.courses;
  const chosen = new Set(courseIds);
  const courseChoices = [
    ...courses.filter((course) => chosen.has(course.id)),
    ...courses.filter((course) => !chosen.has(course.id) && normalSearch(course.title).includes(normalSearch(query))).slice(0, 60),
  ].map((course) => ({ id: course.id, label: course.title }));

  function submit(pending: Pending) {
    if (active.current) return;
    let scope = pendingGroups.get(transport);
    if (!scope) {
      scope = new Map();
      pendingGroups.set(transport, scope);
    }
    scope.set(key, pending);
    const requests = scope;
    const controller = new AbortController();
    active.current = controller;
    setError("");
    setBusy(true);
    saveStudyGroup(transport, pending.command, pending.requestId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "uncertain") { setUncertain(pending); return; }
      if (requests.get(key) === pending) requests.delete(key);
      setUncertain(undefined);
      if (result.status === "saved") saved();
      else if (result.status === "conflict") setConflict(result.record);
      else setError(result.message);
    }).catch(() => {
      if (!controller.signal.aborted) setUncertain(pending);
    }).finally(() => {
      if (active.current === controller) active.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    });
  }

  function currentFields(): StudyGroupFields {
    return {
      name: draft.name.trim(), packageType: draft.packageType, totalQuotaSessions: numberValue(total), weeklyQuotaSessions: numberValue(weekly),
      academicYear: draft.academicYear.trim(), semester: draft.semester.trim(),
      startDate: parseDay(start.trim(), draft.startDate), endDate: parseDay(end.trim(), draft.endDate, true),
      status: draft.status, notes: draft.notes.trim(),
    };
  }

  function startSave() {
    const fields = currentFields();
    const validation = validateStudyGroupFields(fields, baseline.totalQuotaSessions === 0);
    if (validation) { setError(validation); return; }
    if (reference && fields.totalQuotaSessions < reference.usedQuotaSessions) {
      setError("Total kuota harus mencakup sesi yang sudah dipakai.");
      return;
    }
    if (current && revision) submit({ command: { type: "edit", id: current.id, fields: { ...fields, expectedRevision: revision } }, requestId: randomUUID(), baseline });
    else if (!current) submit({ command: { type: "create", fields: { ...fields, courseIds } }, requestId: randomUUID(), baseline });
  }

  const disabled = busy || Boolean(uncertain || conflict);
  const semesters: readonly string[] = studyGroupSemesters.some((entry) => entry === draft.semester)
    ? studyGroupSemesters : [...studyGroupSemesters, draft.semester];
  return <CourseDialog title={current ? "Edit kelompok" : "Buat kelompok"} onClose={cancel} dismissDisabled={busy}>
    <Field label="Nama kelompok" value={draft.name} onChangeText={(value) => change("name", value)} maxLength={180} editable={!disabled} testID="academic-live-group-name" />
    <View style={layout.row}>
      <Picker label="Paket" options={slots} selected={draft.packageType} onSelect={(id) => {
        if (disabled) return;
        const selected = slots.find((item) => item.id === id);
        if (!selected) return;
        change("packageType", selected.id);
        if (selected.quota !== undefined) {
          setTotal(String(selected.quota));
          setWeekly(String(selected.quota));
        }
      }} />
      <Picker label="Status" options={statuses} selected={draft.status} onSelect={(id) => {
        const selected = statuses.find((item) => item.id === id);
        if (!disabled && selected) change("status", selected.id);
      }} />
    </View>
    <Field label="Total kuota sesi" keyboardType="number-pad" value={total} onChangeText={setTotal} editable={!disabled} />
    <Field label="Batas sesi per minggu" keyboardType="number-pad" value={weekly} onChangeText={setWeekly} editable={!disabled} />
    {reference ? <Ink kind="meta" tone="muted">{`${reference.usedQuotaSessions} sesi telah dipakai`}</Ink> : null}
    <Field label="Tahun ajaran" value={draft.academicYear} onChangeText={(value) => change("academicYear", value)} maxLength={9} editable={!disabled} />
    <Picker label="Semester" options={semesters.map((id) => ({ id, label: id }))} selected={draft.semester}
      onSelect={(id) => { if (!disabled) change("semester", id); }} />
    <Field label="Tanggal mulai (WIB)" value={start} placeholder="2026-11-26" onChangeText={setStart} maxLength={10} editable={!disabled} />
    <Field label="Tanggal selesai (WIB)" value={end} placeholder="2027-01-31" onChangeText={setEnd} maxLength={10} editable={!disabled} />
    <Field label="Catatan" value={draft.notes} onChangeText={(value) => change("notes", value)} maxLength={2000} multiline editable={!disabled} />
    {data.type === "create" ? <>
      {courses.length > 8 ? <SearchBox label="Cari mata kuliah" value={query} onChange={setQuery} /> : null}
      <MultiChoice label="Mata kuliah" options={courseChoices} chosen={courseIds} change={setCourseIds} disabled={disabled} />
      {!courseChoices.length ? <Ink kind="meta" tone="muted">Mata kuliah aktif tidak ditemukan.</Ink> : null}
    </> : <Ink kind="meta" tone="muted">{courses.map((course) => course.title).join(", ") || "Belum ada mata kuliah"}</Ink>}
    {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
    {conflict ? <View style={layout.group} accessibilityLiveRegion="assertive">
      <Ink tone="error">Kelompok sudah diubah. Tinjau data terbaru sebelum menyimpan.</Ink>
      <Ink kind="strong">{conflict.fields.name}</Ink>
      <Ink>{`${conflict.fields.academicYear} · ${conflict.fields.semester}`}</Ink>
      <Ink>{`${conflict.fields.totalQuotaSessions} sesi · ${conflict.fields.weeklyQuotaSessions} per minggu`}</Ink>
      {conflict.fields.endDate ? <Ink>{`Tanggal selesai ${dateLabel(conflict.fields.endDate)}`}</Ink> : null}
      {conflict.fields.notes ? <Ink>{conflict.fields.notes}</Ink> : null}
      <View style={layout.row}>
        <Action label="Gunakan revisi terbaru" testID="academic-live-group-use-revision" onPress={() => {
          const merged = rebaseStudyGroupFields(baseline, currentFields(), conflict.fields);
          setDraft(merged);
          setTotal(String(merged.totalQuotaSessions));
          setWeekly(String(merged.weeklyQuotaSessions));
          setStart(dateInput(merged.startDate));
          setEnd(dateInput(merged.endDate));
          setBaseline(conflict.fields);
          setReference(conflict);
          setRevision(conflict.revision);
          setConflict(undefined);
        }} />
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
    {!conflict && !uncertain ? <SaveButtons onSave={startSave} onCancel={cancel} busy={busy} /> : null}
  </CourseDialog>;
}
