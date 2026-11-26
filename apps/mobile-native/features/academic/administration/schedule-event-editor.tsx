import { useState } from "react";
import { View } from "react-native";
import { academicEventTypes, type AcademicEventCommand, type AcademicEventFields } from "../../../../../packages/academic/admin-schedule-events";
import type { LiveRow } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import { createCourseCommandTarget } from "../courses/write-client";
import { useCourseWrite } from "../courses/live-write";
import { Action, CourseDialog, Field, Ink, layout, Picker, splitDateTime, TimeFields } from "./ui";

const types = { official_exam: "Ujian resmi", tryout: "Tryout", quiz: "Kuis", general: "Umum" };
const targets = new WeakMap<AcademicTransport, ReturnType<typeof createCourseCommandTarget<AcademicEventCommand>>>();
const blank: AcademicEventFields = { type: "official_exam", title: "", courseId: null, description: null,
  startDate: "", endDate: null, location: null };

function jakartaInstant(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const instant = date + "T" + time + ":00+07:00";
  if (!Number.isFinite(Date.parse(instant)) || splitDateTime(instant).date !== date) return null;
  return instant;
}

export function ScheduleEventEditor({ row, courses, transport, send, close, reload }: {
  row?: LiveRow; courses: { id: string; label: string }[]; transport: AcademicTransport; send: NonNullable<AcademicTransport["command"]>;
  close(): void; reload(): void;
}) {
  let factory = targets.get(transport);
  if (!factory) {
    factory = createCourseCommandTarget<AcademicEventCommand>(send.bind(transport), undefined, "/api/native/academic-administration/schedule-events");
    targets.set(transport, factory);
  }
  const target = factory("", "POST");
  const previous = target.pending()?.draft;
  const source = previous && previous.action !== "delete" ? previous.fields : row?.academicEvent ?? blank;
  const [fields, setFields] = useState<AcademicEventFields>(source);
  const [start, setStart] = useState(() => splitDateTime(source.startDate));
  const [end, setEnd] = useState(() => splitDateTime(source.endDate ?? ""));
  const [deleting, setDeleting] = useState(previous?.action === "delete");
  const write = useCourseWrite(target, reload);
  const startDate = jakartaInstant(start.date, start.time);
  const endDate = jakartaInstant(end.date, end.time);
  const valid = fields.title.trim() && startDate && ((!end.date && !end.time) || (endDate && Date.parse(endDate) > Date.parse(startDate)));
  function save() {
    if (!valid || !startDate) return;
    const original = row?.academicEvent;
    const preserveInstant = (prior: string | null | undefined, next: string | null) => {
      if (!prior || !next) return next;
      const a = splitDateTime(prior), b = splitDateTime(next);
      return a.date === b.date && a.time === b.time ? prior : next;
    };
    const data = { ...fields, title: fields.title.trim(), startDate: preserveInstant(original?.startDate, startDate) ?? startDate,
      endDate: preserveInstant(original?.endDate, endDate) };
    write.submit(row && original ? { action: "edit", id: row.id, expectedRevision: original.revision, fields: data }
      : { action: "create", fields: data });
  }
  const retry = Boolean(previous);
  return <CourseDialog title={retry ? "Periksa perubahan agenda" : deleting ? "Hapus agenda?" : row ? "Edit agenda" : "Buat agenda"} onClose={close} dismissDisabled={write.busy}>
    {retry ? <Ink>{previous?.action === "delete" ? "Penghapusan agenda" : source.title}</Ink> : deleting ? <Ink>{row?.title}</Ink> : <>
      <Field label="Judul" value={fields.title} onChangeText={title => setFields({ ...fields, title })} maxLength={500} />
      <Picker label="Jenis" selected={fields.type} options={academicEventTypes.map(id => ({ id, label: types[id] }))}
        onSelect={id => setFields({ ...fields, type: academicEventTypes.find(type => type === id) ?? fields.type })} />
      <Picker label="Mata kuliah" selected={fields.courseId ?? ""} options={[{ id: "", label: "Semua mata kuliah" }, ...courses]}
        onSelect={id => setFields({ ...fields, courseId: id || null })} />
      <TimeFields label="mulai" {...start} setDate={date => setStart({ ...start, date })} setTime={time => setStart({ ...start, time })} />
      <TimeFields label="selesai (opsional)" {...end} setDate={date => setEnd({ ...end, date })} setTime={time => setEnd({ ...end, time })} />
      <Field label="Lokasi" value={fields.location ?? ""} onChangeText={location => setFields({ ...fields, location: location || null })} maxLength={1000} />
      <Field label="Keterangan" value={fields.description ?? ""} onChangeText={description => setFields({ ...fields, description: description || null })} maxLength={20000} multiline />
    </>}
    {write.status === "retry" ? <Ink>Hasil perubahan belum diketahui.</Ink> : null}
    {write.stale ? <Ink>Data agenda telah berubah. Muat ulang untuk melihat perubahan.</Ink> : null}
    {write.status === "denied" ? <Ink tone="error">Akses Admin diperlukan.</Ink> : null}
    {write.status === "invalid" ? <Ink tone="error">Periksa judul, mata kuliah dan rentang waktu.</Ink> : null}
    <View style={layout.row}>
      <Action label="Tutup" onPress={close} disabled={write.busy} />
      {write.stale || write.status === "denied" ? <Action label="Muat ulang" onPress={reload} />
        : write.status === "retry" ? <Action label="Coba lagi" onPress={write.retry} />
        : deleting && row?.academicEvent ? <Action label="Hapus agenda" variation="destructive" disabled={!write.editable}
          onPress={() => write.submit({ action: "delete", id: row.id, expectedRevision: row.academicEvent!.revision, confirmed: true })} />
        : <Action label="Simpan" variation="default" onPress={save} disabled={!write.editable || !valid} />}
      {row?.academicEvent && !deleting && write.editable ? <Action label="Hapus" onPress={() => setDeleting(true)} /> : null}
    </View>
  </CourseDialog>;
}
