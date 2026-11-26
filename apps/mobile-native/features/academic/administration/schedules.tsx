import { useState } from "react";
import { View } from "react-native";
import {
  fixtureClock, type AcademicEvent, type AcademicEventFields, type Booking, type BookingFields,
  type EventStatus, type EventType, type TutorSlot, type TutorSlotFields,
} from "../../../../../packages/native-parity/academic/administration/fixtures";
import { AdministrationCalendar } from "./calendar";
import type { AcademicScreenProps } from "../contracts";
import { useAdministrationSnapshot, useAdministrationStore } from "./provider";
import {
  Action, CourseDialog, DataRow, Field, Ink, MultiChoice, PagedRows, Picker, SaveButtons, Subheading, Tabs, TimeFields,
  combineDateTime, courseName, courseNames, courseOptions, dateTimeLabel, idAndRevision, layout, splitDateTime,
  useAdministrationMutation,
} from "./ui";

const views = [
  { id: "calendar", label: "Kalender" }, { id: "academic", label: "Daftar jadwal" },
  { id: "tutors", label: "Tutor" }, { id: "tickets", label: "Tiket" }, { id: "audit", label: "Jejak audit" },
] as const;
type ScheduleView = (typeof views)[number]["id"];
const types: readonly { id: EventType; label: string }[] = [
  { id: "official_exam", label: "Ujian resmi" }, { id: "tryout", label: "Tryout" },
  { id: "quiz", label: "Kuis" }, { id: "general", label: "Umum" },
];
const statuses: readonly { id: EventStatus; label: string }[] = [
  { id: "published", label: "Terbit" }, { id: "draft", label: "Draf" }, { id: "archived", label: "Arsip" },
];
const scopes = [
  { id: "all", label: "Semua jadwal" },
  { id: "academic", label: "Jadwal akademik" },
  { id: "tutorial", label: "Sesi tutorial" },
] as const;
const allCourses = [{ id: "", label: "Semua mata kuliah" }, ...courseOptions];
const daysPerWeek = 7;
const dayMillis = 24 * 60 * 60 * 1000;
const fixtureMonday = Date.parse("2026-11-23T00:00:00+07:00");

function EventForm({ initial, onSave, onCancel }: { initial?: AcademicEvent; onSave(fields: AcademicEventFields): void; onCancel(): void }) {
  const start = splitDateTime(initial?.startsAt ?? fixtureClock);
  const end = splitDateTime(initial?.endsAt ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<EventType>(initial?.type ?? "general");
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(initial ? start.time : "");
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? "published");
  return <Subheading title={initial ? "Edit jadwal" : "Buat jadwal akademik"}>
    <Field label="Judul jadwal" value={title} onChangeText={setTitle} testID="academic-schedule-title" />
    <View style={layout.row}>
      <Picker label="Jenis jadwal" options={types} selected={type} onSelect={(id) => setType(id as EventType)} />
      <Picker label="Mata kuliah" options={allCourses} selected={courseId} onSelect={setCourseId} />
      <Picker label="Status" options={statuses} selected={status} onSelect={(id) => setStatus(id as EventStatus)} />
    </View>
    <TimeFields label="mulai" date={startDate} time={startTime} setDate={setStartDate} setTime={setStartTime} />
    <TimeFields label="selesai (opsional)" date={endDate} time={endTime} setDate={setEndDate} setTime={setEndTime} />
    <Field label="Lokasi" value={location} onChangeText={setLocation} />
    <Field label="Keterangan" value={description} onChangeText={setDescription} multiline />
    <SaveButtons onCancel={onCancel} onSave={() => onSave({ title, type, courseId,
      startsAt: combineDateTime(startDate, startTime), endsAt: combineDateTime(endDate, endTime), location, description, status })} />
  </Subheading>;
}

function SlotForm({ tutors, onSave, onCancel }: {
  tutors: { id: string; label: string }[]; onSave(fields: TutorSlotFields): void; onCancel(): void;
}) {
  const [tutorId, setTutorId] = useState("");
  const [date, setDate] = useState(splitDateTime(fixtureClock).date);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [location, setLocation] = useState("");
  return <Subheading title="Tambah ketersediaan tutor">
    <Picker label="Pilih tutor" selected={tutorId} onSelect={setTutorId} options={tutors} />
    <TimeFields label="mulai" date={date} time={start} setDate={setDate} setTime={setStart} />
    <Field label="Jam selesai (WIB)" placeholder="14:30" value={end} onChangeText={setEnd} maxLength={5} />
    <Picker label="Moda" options={[{ id: "online", label: "Daring" }, { id: "offline", label: "Tatap muka" }]} selected={mode} onSelect={(id) => setMode(id as typeof mode)} />
    {mode === "offline" ? <Field label="Lokasi" value={location} onChangeText={setLocation} /> : null}
    <SaveButtons onCancel={onCancel} onSave={() => onSave({ tutorId, startsAt: combineDateTime(date, start),
      endsAt: combineDateTime(date, end), mode, location: mode === "offline" ? location : "" })} />
  </Subheading>;
}

type Editing = { kind: "event"; initial?: AcademicEvent } | { kind: "slot" } | { kind: "assign"; slot: TutorSlot }
  | { kind: "move" | "cancel"; booking: Booking } | { kind: "tutor"; id: string; revision: number; courseIds: string[] };
type Selection = { kind: "event" | "slot" | "ticket"; id: string };

function AssignForm({ edit, save, cancel }: { edit: Extract<Editing, { kind: "assign" }>; save(fields: BookingFields): void; cancel(): void }) {
  const { records } = useAdministrationSnapshot();
  const [groupId, setGroupId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [reason, setReason] = useState("");
  const group = records.groups.find((entry) => entry.id === groupId);
  const courseChoices = courseOptions.filter((option) => group?.courseIds.includes(option.id));
  return <Subheading title="Tugaskan sesi tutorial">
    <Ink>{dateTimeLabel(edit.slot.startsAt)}</Ink>
    <Picker label="Pilih kelompok aktif" selected={groupId} onSelect={(id) => { setGroupId(id); setCourseId(""); }}
      options={records.groups.filter((entry) => entry.status === "active").map((entry) => ({ id: entry.id, label: entry.name }))} />
    {group ? <Picker label="Pilih mata kuliah" options={courseChoices} selected={courseId} onSelect={setCourseId} /> : null}
    <Field label="Alasan penugasan" value={reason} onChangeText={setReason} multiline />
    <SaveButtons onCancel={cancel} onSave={() => save({ groupId, courseId, slotId: edit.slot.id, reason })} saveLabel="Tugaskan sesi" />
  </Subheading>;
}

function ChangeBookingForm({ edit, available, save, cancel }: {
  edit: Extract<Editing, { kind: "move" | "cancel" }>; available: { id: string; label: string }[];
  save(slotId: string, reason: string): void; cancel(): void;
}) {
  const [slotId, setSlotId] = useState("");
  const [reason, setReason] = useState("");
  return <Subheading title={edit.kind === "move" ? "Pindahkan sesi" : "Batalkan sesi"}>
    {edit.kind === "move" ? <Picker label="Pilih slot pengganti" options={available} selected={slotId} onSelect={setSlotId} /> : null}
    <Field label="Alasan perubahan" value={reason} onChangeText={setReason} multiline />
    <SaveButtons onCancel={cancel} onSave={() => save(slotId, reason)} saveLabel={edit.kind === "move" ? "Pindahkan sesi" : "Batalkan sesi"} />
  </Subheading>;
}

function TutorForm({ draft, save, cancel }: {
  draft: Extract<Editing, { kind: "tutor" }>; save(ids: string[]): void; cancel(): void;
}) {
  const [courseIds, setCourseIds] = useState(draft.courseIds);
  return <Subheading title="Sertifikasi tutor">
    <MultiChoice label="Mata kuliah yang dapat diajar" options={courseOptions} chosen={courseIds} change={setCourseIds} />
    <SaveButtons onSave={() => save(courseIds)} onCancel={cancel} />
  </Subheading>;
}

const parseWeek = (raw: string) => {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(-520, Math.min(520, Math.trunc(value))) : 0;
};

export function AdministrationSchedules({ query, replace }: Pick<AcademicScreenProps, "query" | "replace">) {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const view = views.find((option) => option.id === query.tab)?.id ?? "calendar";
  const week = parseWeek(query.week);
  const [scope, setScope] = useState<(typeof scopes)[number]["id"]>("all");
  const [course, setCourse] = useState("");
  const [selection, setSelection] = useState<Selection>();
  const [editing, setEditing] = useState<Editing>();
  const selectedEvent = selection?.kind === "event" ? records.academicEvents.find((event) => event.id === selection.id) : undefined;
  const selectedSlot = selection?.kind === "slot" ? records.slots.find((slot) => slot.id === selection.id) : undefined;
  const selectedTicket = selection?.kind === "ticket" ? records.tickets.find((ticket) => ticket.id === selection.id) : undefined;
  const selectedBooking = records.bookings.find((booking) => booking.slotId === selectedSlot?.id && booking.status === "scheduled");
  const tutorName = (id: string) => records.users.find((user) => user.id === id)?.name ?? "Tutor";
  const tutorChoices = records.users.filter((user) => user.roles.includes("tutor") && user.status === "active").map((user) => ({ id: user.id, label: user.name }));
  const start = fixtureMonday + week * daysPerWeek * dayMillis;
  const end = start + daysPerWeek * dayMillis;

  function updateUrl(next: ScheduleView, offset: number) {
    replace(`/admin/schedules?tab=${next}&week=${parseWeek(String(offset))}`);
  }

  const visibleEvents = records.academicEvents.filter((event) => {
    if (course && event.courseId !== course) return false;
    if (view === "academic") return true;
    const date = Date.parse(event.startsAt);
    return scope !== "tutorial" && date >= start && date < end;
  });
  const visibleSlots = records.slots.filter((slot) => {
    const date = Date.parse(slot.startsAt);
    const booking = records.bookings.find((entry) => entry.slotId === slot.id && entry.status === "scheduled");
    return scope !== "academic" && date >= start && date < end && (!course || booking?.courseId === course);
  });
  const calendarRows = [...visibleEvents.map((event) => ({ kind: "event" as const, row: event })),
    ...visibleSlots.map((slot) => ({ kind: "slot" as const, row: slot }))]
    .sort((left, right) => Date.parse(left.row.startsAt) - Date.parse(right.row.startsAt));
  function eventRow(event: AcademicEvent) {
    return <DataRow key={event.id} title={event.title} description={`${courseName(event.courseId)} · ${dateTimeLabel(event.startsAt)}`}
      detail={statuses.find((option) => option.id === event.status)?.label} onPress={() => setSelection({ kind: "event", id: event.id })} />;
  }

  const cancelEdit = () => setEditing(undefined);
  const doneEditing = { after: cancelEdit };
  return <>
    <View style={layout.row}>
      <Action label="Buat jadwal" variation="default" onPress={() => setEditing({ kind: "event" })} testID="academic-schedule-create" />
      <Action label="Tambah ketersediaan" onPress={() => setEditing({ kind: "slot" })} />
    </View>
    {mutation.feedback}
    {editing?.kind === "event" ? <EventForm key={editing.initial?.id ?? "new"} initial={editing.initial} onCancel={cancelEdit}
      onSave={(fields) => mutation.run({ type: "event.save", ...idAndRevision(editing.initial), fields },
        { ...doneEditing, success: editing.initial ? "Jadwal diperbarui." : "Jadwal dibuat.",
          review: () => {
            const latest = records.academicEvents.find((event) => event.id === editing.initial?.id);
            return latest ? <Ink>{`${latest.title} · ${dateTimeLabel(latest.startsAt)}`}</Ink> : null;
          } })} /> : null}
    {editing?.kind === "slot" ? <SlotForm tutors={tutorChoices} onCancel={cancelEdit} onSave={(fields) =>
      mutation.run({ type: "slot.create", fields }, { ...doneEditing, success: "Ketersediaan ditambahkan." })} /> : null}
    {editing?.kind === "assign" ? <AssignForm edit={editing} cancel={cancelEdit} save={(fields) =>
      mutation.run({ type: "booking.assign", fields }, { ...doneEditing, success: "Sesi ditugaskan." })} /> : null}
    {editing?.kind === "move" || editing?.kind === "cancel" ? <ChangeBookingForm edit={editing} cancel={cancelEdit}
      available={records.slots.filter((slot) => !records.bookings.some((booking) => booking.slotId === slot.id && booking.status === "scheduled")
        && records.certifications.some((entry) => entry.id === slot.tutorId && entry.courseIds.includes(editing.booking.courseId)))
        .map((slot) => ({ id: slot.id, label: `${dateTimeLabel(slot.startsAt)} · ${tutorName(slot.tutorId)}` }))}
      save={(slotId, reason) => {
        const { id, revision } = editing.booking;
        if (editing.kind === "move") return mutation.run({ type: "booking.move", id, revision, slotId, reason },
          { ...doneEditing, success: "Sesi dipindahkan." });
        mutation.run({ type: "booking.cancel", id, revision, reason }, { ...doneEditing, title: "Batalkan sesi tutorial?",
          description: reason, confirmLabel: "Batalkan sesi", destructive: true, success: "Sesi dibatalkan." });
      }} /> : null}
    {editing?.kind === "tutor" ? <TutorForm key={editing.id} draft={editing} cancel={cancelEdit} save={(courseIds) =>
      mutation.run({ type: "tutor.courses", id: editing.id, revision: editing.revision, courseIds }, { ...doneEditing, success: "Sertifikasi tutor diperbarui." })} /> : null}

    <Tabs options={views} selected={view} onSelect={(next) => updateUrl(next, week)} testID="academic-schedules-tab" />
    {view === "calendar" ? <>
      <View style={layout.row}>
        <Action label="Hari ini" onPress={() => updateUrl(view, 0)} />
        <Picker label="Cakupan jadwal" options={scopes} selected={scope} onSelect={(id) => setScope(id as typeof scope)} />
        <Picker label="Mata kuliah" options={allCourses} selected={course} onSelect={setCourse} />
      </View>
      <AdministrationCalendar start={splitDateTime(new Date(start).toISOString()).date}
        today={splitDateTime(fixtureClock).date} dayOffset={week} onPeriodChange={(direction) => updateUrl(view, week + direction)}
        events={calendarRows.map((item) => ({
          id: item.row.id,
          dateId: splitDateTime(item.row.startsAt).date,
          title: item.kind === "event" ? item.row.title : tutorName(item.row.tutorId),
          caption: item.kind === "event" ? `${dateTimeLabel(item.row.startsAt)} · ${courseName(item.row.courseId)}` :
            `${dateTimeLabel(item.row.startsAt)} · ${records.bookings.some((booking) => booking.slotId === item.row.id && booking.status === "scheduled") ? "Dipesan" : "Tersedia"}`,
        }))}
        onEventPress={(id) => {
          const match = calendarRows.find((entry) => entry.row.id === id);
          if (match) setSelection({ kind: match.kind, id });
        }} />
    </> : null}
    {view === "academic" ? <>
      <Picker label="Mata kuliah" options={allCourses} selected={course} onSelect={setCourse} />
      <PagedRows key={course} rows={visibleEvents} empty="Belum ada jadwal akademik." render={eventRow} />
    </> : null}
    {view === "tutors" ? <PagedRows rows={records.certifications} empty="Belum ada tutor terdaftar." render={(certification) =>
      <DataRow key={certification.id} title={tutorName(certification.id)} description={courseNames(certification.courseIds)}
        detail={`${records.slots.filter((slot) => slot.tutorId === certification.id).length} slot`}
        onPress={() => setEditing({ kind: "tutor", ...certification })} />} /> : null}
    {view === "tickets" ? <PagedRows rows={records.tickets} empty="Belum ada tiket." render={(ticket) =>
      <DataRow key={ticket.id} title={ticket.title} description={courseName(ticket.courseId)} detail={ticket.status === "open" ? "Terbuka" : "Selesai"}
        onPress={() => setSelection({ kind: "ticket", id: ticket.id })} />} /> : null}
    {view === "audit" ? <PagedRows rows={records.audits} empty="Belum ada perubahan jadwal." render={(row) =>
      <DataRow key={row.id} title={row.action} description={row.reason} detail={row.target} />} /> : null}

    {selectedEvent ? <CourseDialog title={selectedEvent.title} onClose={() => setSelection(undefined)}>
      <Ink>{`${types.find((option) => option.id === selectedEvent.type)?.label} · ${courseName(selectedEvent.courseId)}`}</Ink>
      <Ink>{[dateTimeLabel(selectedEvent.startsAt), selectedEvent.endsAt && dateTimeLabel(selectedEvent.endsAt)].filter(Boolean).join(" sampai ")}</Ink>
      {selectedEvent.location ? <Ink>{selectedEvent.location}</Ink> : null}
      {selectedEvent.description ? <Ink>{selectedEvent.description}</Ink> : null}
      <View style={layout.row}>
        <Action label="Edit jadwal" onPress={() => { setSelection(undefined); setEditing({ kind: "event", initial: selectedEvent }); }} />
        <Action label="Hapus jadwal" variation="destructive" onPress={() => {
          setSelection(undefined);
          mutation.run({ type: "event.delete", id: selectedEvent.id, revision: selectedEvent.revision }, {
            title: "Hapus jadwal?", description: selectedEvent.title, confirmLabel: "Hapus jadwal", destructive: true, success: "Jadwal dihapus.",
          });
        }} />
      </View>
    </CourseDialog> : null}
    {selectedSlot ? <CourseDialog title={tutorName(selectedSlot.tutorId)} onClose={() => setSelection(undefined)}>
      <Ink>{`${dateTimeLabel(selectedSlot.startsAt)} sampai ${dateTimeLabel(selectedSlot.endsAt)}`}</Ink>
      <Ink>{selectedSlot.mode === "online" ? "Daring" : `Tatap muka · ${selectedSlot.location}`}</Ink>
      {selectedBooking ? <>
        <Ink>{`${records.groups.find((group) => group.id === selectedBooking.groupId)?.name ?? "Kelompok"} · ${courseName(selectedBooking.courseId)}`}</Ink>
        <View style={layout.row}>
          <Action label="Pindahkan sesi" onPress={() => { setSelection(undefined); setEditing({ kind: "move", booking: selectedBooking }); }} />
          <Action label="Batalkan sesi" variation="destructive" onPress={() => { setSelection(undefined); setEditing({ kind: "cancel", booking: selectedBooking }); }} />
        </View>
      </> : <View style={layout.row}>
        <Action label="Tugaskan sesi" onPress={() => { setSelection(undefined); setEditing({ kind: "assign", slot: selectedSlot }); }} />
        <Action label="Hapus slot" variation="destructive" onPress={() => {
          setSelection(undefined);
          mutation.run({ type: "slot.delete", id: selectedSlot.id, revision: selectedSlot.revision }, {
            title: "Hapus ketersediaan?", description: dateTimeLabel(selectedSlot.startsAt), confirmLabel: "Hapus slot", destructive: true, success: "Slot dihapus.",
          });
        }} />
      </View>}
    </CourseDialog> : null}
    {selectedTicket ? <CourseDialog title={selectedTicket.title} onClose={() => setSelection(undefined)}>
      <Ink>{courseName(selectedTicket.courseId)}</Ink>
      <Ink>{selectedTicket.body}</Ink>
    </CourseDialog> : null}
  </>;
}
