import { useState } from "react";
import { View, Share } from "react-native";
import { CalendarSync } from "./calendar";
import { Calendar, type CalendarDay, type CalendarEvent } from "../../shared-ui";
import type { AgendaData, Booking, Group, NativeOperationResult, Schedule, Slot } from "../../../../../packages/native-parity/student/community/contracts";
import { Action, Actions, Choices, Copy, Field, Notice, Page, Remote, Row, Rows, communityPath, dateLabel, isHttps, operationResult, post, readJson, styles, useCommunity, useOperation, useRemote } from "./ui";

function GroupDetails({ group, reload }: { group: Group; reload(): void }) {
  const { request, tr, navigate, session } = useCommunity();
  const operation = useOperation();
  const [editing, setEditing] = useState(false);
  const [renameStatus, setRenameStatus] = useState<{ canRename: boolean; nextRenameAt?: string | null }>();
  const [name, setName] = useState(group.name);
  const start = () => void operation.run(async () => {
    const result = await readJson<NativeOperationResult & { canRename: boolean; nextRenameAt?: string | null }>(request, communityPath("group-rename", { id: group.id }));
    operationResult(result);
    setRenameStatus(result);
    setEditing(true);
  });
  return <View style={styles.block}>
    <Copy kind="heading">{group.name}</Copy>
    {group.packageName && <Copy kind="muted">{group.packageName}</Copy>}
    <Rows>
      <Row title={tr("Sisa sesi", "Sessions remaining")} aside={String(group.remainingQuota)} />
      <Row title={tr("Sisa sesi minggu ini", "Sessions remaining this week")} aside={String(group.weeklyRemainingQuota)} />
    </Rows>
    <Copy kind="heading">{tr("Anggota", "Members")}</Copy>
    <Rows>{group.members.map(member => <Row key={member.id} title={member.identity?.displayName ?? member.name}
      meta={member.isMe ? tr("Anda", "You") : member.role}
      onPress={member.identity ? () => navigate(`/students/${encodeURIComponent(member.identity!.publicId)}`) : undefined} />)}</Rows>
    {group.courses.length > 0 && <><Copy kind="heading">{tr("Kursus", "Courses")}</Copy>
      <Rows>{group.courses.map(course => <Row key={course.id} title={course.title} onPress={() => navigate(`/courses/${encodeURIComponent(course.id)}`)} />)}</Rows></>}
    {group.token && group.members.length < group.token.capacity && <View style={styles.field}>
      <Copy kind="strong">{tr("Token undangan", "Invitation token")}</Copy>
      <Copy>{group.token.value}</Copy>
      {group.token.expiresAt && <Copy kind="muted">{tr("Berlaku hingga", "Expires")} {dateLabel(group.token.expiresAt, session.locale, true)}</Copy>}
      <Actions><Action label={tr("Bagikan token", "Share token")} onPress={() => void operation.run(async () => {
        await Share.share({ message: group.token!.value });
      })} /></Actions>
    </View>}
    <Notice notice={operation.notice} />
    {editing ? <View style={styles.field}>
      <Field label={tr("Nama baru", "New name")} value={name} onChangeText={setName} maxLength={80} editable={renameStatus?.canRename && !operation.pending} />
      {!renameStatus?.canRename && renameStatus?.nextRenameAt && <Copy kind="muted">
        {tr("Nama dapat diubah pada", "You can rename this group on")} {dateLabel(renameStatus.nextRenameAt, session.locale, true)}
      </Copy>}
      <Actions><Action label={tr("Simpan nama", "Save name")} mode="default" busy={operation.pending}
        disabled={!renameStatus?.canRename || !name.trim()} onPress={() => void operation.run(async () => {
          operationResult(await post(request, "group-rename", { id: group.id, name }));
          setEditing(false);
          reload();
        })} />
        <Action label={tr("Batal", "Cancel")} disabled={operation.pending} onPress={() => setEditing(false)} /></Actions>
    </View> : <Actions><Action label={tr("Ubah nama kelompok", "Rename group")} busy={operation.pending} onPress={start} /></Actions>}
  </View>;
}

export function GroupsScreen() {
  const { request, tr, navigate } = useCommunity();
  const state = useRemote<Group[]>(communityPath("groups"));
  const operation = useOperation();
  const [token, setToken] = useState("");
  const [selected, setSelected] = useState<string>();
  return <Page title={tr("Kelompok belajar", "Study groups")}>
    <View style={styles.block}>
      <Field label={tr("Token kelompok", "Group token")} value={token} onChangeText={setToken} maxLength={160} autoCapitalize="none" autoCorrect={false} />
      <Actions><Action label={tr("Gabung kelompok", "Join group")} mode="default" busy={operation.pending} disabled={!token.trim()}
        onPress={() => void operation.run(async () => {
          operationResult(await post(request, "groups", { token: token.trim() }));
          setToken("");
          state.reload();
        }, tr("Berhasil bergabung.", "You joined the group."))} />
        <Action label={tr("Jadwal tutorial", "Tutorial schedule")} onPress={() => navigate("/dashboard/schedule")} /></Actions>
      <Notice notice={operation.notice} />
    </View>
    <Remote state={state}>{groups => {
      const active = groups.find(group => group.id === selected) ?? groups[0];
      return active ? <>
        {groups.length > 1 && <Choices value={active.id} options={groups.map(group => ({ value: group.id, label: group.name }))} onSelect={setSelected} />}
        <GroupDetails key={active.id} group={active} reload={state.reload} />
      </> : <Copy kind="muted">{tr("Belum ada kelompok belajar.", "No study groups yet.")}</Copy>;
    }}</Remote>
  </Page>;
}

type ScheduleAction = (body: object, success?: string, after?: () => void) => void;

function SlotBooking({ slot, schedule, apply, pending }: { slot: Slot; schedule: Schedule; apply: ScheduleAction; pending: boolean }) {
  const { tr } = useCommunity();
  const eligibleCourses = schedule.courses.filter(course => slot.courseIds.includes(course.id));
  const [courseId, setCourse] = useState(eligibleCourses[0]?.id ?? "");
  const [groupId, setGroup] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const eligibleGroups = schedule.groups.filter(group => group.courseIds.includes(courseId));
  return <View style={styles.block}>
    {!eligibleCourses.length && <Copy kind="muted">{tr("Slot ini memerlukan akses kursus.", "This slot requires course access.")}</Copy>}
    {eligibleCourses.length > 0 && <>
      <Choices value={courseId} options={eligibleCourses.map(course => ({ value: course.id, label: course.title }))}
        onSelect={id => { setCourse(id); setGroup(""); }} />
      {!eligibleGroups.length && <Copy kind="muted">{tr("Belum ada kelompok untuk kursus ini.", "You do not have a group for this course.")}</Copy>}
      {eligibleGroups.length > 0 && <>
        <Choices value={groupId} options={eligibleGroups.map(group => ({ value: group.id, label: group.name }))} onSelect={setGroup} />
        <Field label={tr("Topik", "Topic")} value={topic} onChangeText={setTopic} maxLength={200} />
        <Field label={tr("Catatan sebelum sesi", "Pre-session notes")} value={notes} onChangeText={setNotes} maxLength={5000} multiline />
        <Actions><Action label={tr("Pesan slot", "Book slot")} mode="default" busy={pending} disabled={!groupId}
          onPress={() => apply({ action: "book", slotId: slot.id, date: slot.date, courseId, groupId, topic, notes }, tr("Slot dipesan.", "Slot booked."))} /></Actions>
      </>}
    </>}
  </View>;
}

function TicketDetails({ ticket, apply, pending }: { ticket: Booking["tickets"][number]; apply: ScheduleAction; pending: boolean }) {
  const { tr } = useCommunity();
  const [message, setMessage] = useState("");
  return <Row title={`${tr("Tiket", "Ticket")} · ${ticket.status}`} meta={ticket.reason ?? undefined}>
    {ticket.messages.map(item => <Copy key={item.id}>{item.sender} · {item.body}</Copy>)}
    <Field label={tr("Pesan tiket", "Ticket message")} value={message} onChangeText={setMessage} maxLength={1000} multiline />
    <Actions><Action label={tr("Kirim pesan", "Send message")} busy={pending} disabled={!message.trim()}
      onPress={() => apply({ action: "message", ticketId: ticket.id, message }, tr("Pesan terkirim.", "Message sent."), () => setMessage(""))} /></Actions>
  </Row>;
}

function BookingDetails({ booking, schedule, apply, pending }: {
  booking: Booking; schedule: Schedule; apply: ScheduleAction; pending: boolean;
}) {
  const { tr, openExternal, session, renderScheduleResources, theme } = useCommunity();
  const [draft, setDraft] = useState<"context" | "move" | "cancel" | "ticket" | "resource" | null>(null);
  const [topic, setTopic] = useState(booking.topic ?? "");
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"reschedule" | "cancellation">("reschedule");
  const [newSlotId, setNewSlot] = useState("");
  const [removeResourceId, setRemoveResource] = useState<string>();
  const active = booking.status === "scheduled" || booking.status === "rescheduled";
  const choices = schedule.slots.filter(slot => !slot.occupied && slot.courseIds.includes(booking.courseId) && slot.bookable);
  const slot = choices.find(item => item.id === newSlotId);
  const selectSlot = choices.length ? <Choices options={choices.map(item => ({ value: item.id, label: `${dateLabel(item.date, session.locale)} · ${item.startTime} · ${item.tutor}` }))}
    value={newSlotId} onSelect={setNewSlot} /> : <Copy kind="muted">{tr("Tidak ada slot alternatif.", "No alternative slots.")}</Copy>;
  const closed = () => setDraft(null);
  return <View style={styles.block}>
    {booking.topic && <Copy>{booking.topic}</Copy>}
    {booking.notes && <Copy>{booking.notes}</Copy>}
    {booking.meetUrl && active && isHttps(booking.meetUrl) && openExternal && <Actions>
      <Action label={tr("Gabung Google Meet", "Join Google Meet")} onPress={() => openExternal(booking.meetUrl!)} />
    </Actions>}
    {renderScheduleResources ? renderScheduleResources(booking.id, theme) : <Rows>{booking.resources.map(resource => <Row key={resource.id} title={resource.title}
      onPress={isHttps(resource.url) && openExternal ? () => openExternal(resource.url) : undefined}>
      {resource.canDelete && <Actions>{removeResourceId === resource.id ? <>
        <Action label={tr("Konfirmasi hapus", "Confirm deletion")} mode="destructive" busy={pending}
          onPress={() => apply({ action: "delete-resource", resourceId: resource.id }, undefined, () => setRemoveResource(undefined))} />
        <Action label={tr("Batal", "Cancel")} disabled={pending} onPress={() => setRemoveResource(undefined)} />
      </> : <Action label={tr("Hapus tautan", "Remove link")} disabled={pending} onPress={() => setRemoveResource(resource.id)} />}</Actions>}
    </Row>)}</Rows>}
    {active && <Actions>
      <Action label={tr("Topik dan catatan", "Topic and notes")} onPress={() => setDraft("context")} />
      {!renderScheduleResources && <Action label={tr("Tambah tautan", "Add link")} onPress={() => setDraft("resource")} />}
      {!schedule.locked && <><Action label={tr("Pindah slot", "Move slot")} onPress={() => { setNewSlot(""); setDraft("move"); }} />
        <Action label={tr("Batalkan sesi", "Cancel session")} onPress={() => setDraft("cancel")} /></>}
      <Action label={tr("Buat tiket", "Open a ticket")} onPress={() => { setNewSlot(""); setDraft("ticket"); }} />
    </Actions>}
    {draft === "context" && <>
      <Field label={tr("Topik", "Topic")} value={topic} onChangeText={setTopic} maxLength={200} />
      <Field label={tr("Catatan sebelum sesi", "Pre-session notes")} value={notes} onChangeText={setNotes} maxLength={5000} multiline />
      <Actions><Action label={tr("Simpan topik", "Save topic")} mode="default" busy={pending}
        onPress={() => apply({ action: "context", bookingId: booking.id, topic, notes }, undefined, closed)} /></Actions>
    </>}
    {draft === "resource" && <>
      <Field label={tr("Judul tautan", "Link title")} value={label} onChangeText={setLabel} maxLength={160} />
      <Field label={tr("Alamat tautan", "Link address")} value={url} onChangeText={setUrl} maxLength={2048} autoCapitalize="none" keyboardType="url" />
      <Actions><Action label={tr("Simpan tautan", "Save link")} mode="default" busy={pending} disabled={!label.trim() || !isHttps(url)}
        onPress={() => apply({ action: "add-resource", bookingId: booking.id, label, url }, undefined, closed)} /></Actions>
    </>}
    {draft === "move" && <>{selectSlot}<Actions><Action label={tr("Konfirmasi pindah", "Confirm move")} mode="default" busy={pending} disabled={!slot}
      onPress={() => slot && apply({ action: "move", bookingId: booking.id, slotId: slot.id, date: slot.date }, undefined, closed)} /></Actions></>}
    {draft === "cancel" && <Actions><Action label={tr("Konfirmasi pembatalan sesi", "Confirm session cancellation")} mode="destructive" busy={pending}
      onPress={() => apply({ action: "cancel", bookingId: booking.id }, undefined, closed)} /></Actions>}
    {draft === "ticket" && <>
      <Choices value={kind} options={[{ value: "reschedule", label: tr("Jadwal ulang", "Reschedule") },
        { value: "cancellation", label: tr("Pembatalan", "Cancellation") }]} onSelect={setKind} />
      {kind === "reschedule" && selectSlot}
      <Field label={tr("Alasan", "Reason")} value={reason} onChangeText={setReason} maxLength={1000} multiline />
      <Actions><Action label={tr("Kirim tiket", "Send ticket")} mode="default" busy={pending} disabled={!reason.trim() || (kind === "reschedule" && !slot)}
        onPress={() => apply({ action: "ticket", bookingId: booking.id, kind, reason,
          ...(kind === "reschedule" && slot ? { proposedSlotId: slot.id, proposedDate: slot.date } : {}) }, undefined, closed)} /></Actions>
    </>}
    {draft && <Actions><Action label={tr("Tutup formulir", "Close form")} disabled={pending} onPress={closed} /></Actions>}
    {booking.tickets.map(ticket => <TicketDetails key={ticket.id} ticket={ticket} apply={apply} pending={pending} />)}
  </View>;
}

function WeekCalendar({ schedule, pending, offset, onPeriodChange, apply }: {
  schedule: Schedule; pending: boolean; offset: number;
  onPeriodChange(direction: -1 | 1): void; apply: ScheduleAction;
}) {
  const { tr, session, theme } = useCommunity();
  const [selectedDate, setDate] = useState<string>();
  const [selectedEvent, setEvent] = useState<string>();
  const shortDay = new Intl.DateTimeFormat(session.locale, { weekday: "short", timeZone: "Asia/Jakarta" });
  const dateNumber = new Intl.DateTimeFormat(session.locale, { day: "numeric", timeZone: "Asia/Jakarta" });
  const clock = new Intl.DateTimeFormat(session.locale, { timeStyle: "short", timeZone: "Asia/Jakarta" });
  const days: CalendarDay[] = schedule.dates.map(id => {
    const date = new Date(`${id}T00:00:00+07:00`);
    return { id, weekday: shortDay.format(date), day: dateNumber.format(date), label: dateLabel(id, session.locale), today: id === schedule.todayDate };
  });
  const events: CalendarEvent[] = [
    ...schedule.bookings.map(booking => ({
      id: `booking-${booking.id}`, dateId: booking.date, title: booking.topic || booking.course,
      caption: `${booking.startTime}–${booking.endTime} · ${booking.tutor} · ${booking.status}`,
    })),
    ...schedule.slots.map(slot => ({
      id: `slot-${slot.id}`, dateId: slot.date, title: slot.tutor,
      caption: `${slot.startTime}–${slot.endTime} · ${!schedule.locked && !slot.occupied && slot.bookable ? tr("Tersedia", "Available") : tr("Tidak tersedia", "Unavailable")}`,
      disabled: schedule.locked || slot.occupied || !slot.bookable,
    })),
    ...schedule.academic.map(event => ({
      id: `academic-${event.id}`, dateId: event.dateId, title: event.title,
      caption: `${clock.format(new Date(event.startTime))} · ${tr("Agenda akademik", "Academic calendar")}`,
    })),
  ];
  const dateId = selectedDate ?? days.find(day => day.today)?.id ?? days.find(day => events.some(item => item.dateId === day.id))?.id ?? days[0]?.id;
  const booking = schedule.bookings.find(item => `booking-${item.id}` === selectedEvent && item.date === dateId);
  const slot = schedule.slots.find(item => `slot-${item.id}` === selectedEvent && item.date === dateId);
  const bookable = slot && !schedule.locked && !slot.occupied && slot.bookable;
  return <>
    <Calendar
      testID="student-tutorial-calendar"
      theme={theme}
      periodLabel={`${dateLabel(schedule.week.startIso, session.locale)} · ${dateLabel(schedule.week.endIso, session.locale)}`}
      days={days}
      events={events}
      selectedDateId={dateId}
      selectedEventId={selectedEvent}
      labels={{
        previous: tr("Minggu lalu", "Previous week"), next: tr("Minggu depan", "Next week"),
        today: tr("Hari ini", "Today"), empty: tr("Belum ada jadwal pada tanggal ini.", "No events on this date."),
        getEventCountLabel: count => `${count} ${tr("agenda", "events")}`,
      }}
      previousDisabled={offset <= -104 || pending}
      nextDisabled={offset >= 104 || pending}
      onPeriodChange={onPeriodChange}
      onDateChange={id => { setDate(id); setEvent(undefined); }}
      onEventPress={id => setEvent(active => active === id ? undefined : id)}
    />
    {booking && <BookingDetails key={booking.id} booking={booking} schedule={schedule} apply={apply} pending={pending} />}
    {bookable && <SlotBooking key={slot.id} slot={slot} schedule={schedule} apply={apply} pending={pending} />}
  </>;
}

import { useTourEvent } from "../../onboarding/tour-events";

export function ScheduleScreen() {
  const tour = useTourEvent();
  const { route, tr, request, navigate } = useCommunity();
  const [offset, setOffset] = useState(0);
  const state = useRemote<Schedule>(communityPath("schedule", { offset, course: route.query.course }));
  const calendar = useRemote<AgendaData["sync"]>(communityPath("calendar-status"));
  const operation = useOperation();
  const apply: ScheduleAction = (body, success, after) => void operation.run(async () => {
    operationResult(await post(request, "schedule", body));
    after?.();
    state.reload();
  }, success, tr("Hasil tindakan belum terkonfirmasi. Perbarui jadwal sebelum mencoba lagi.", "The outcome is unconfirmed. Refresh the schedule before trying again."));
  return <Page title={tr("Jadwal tutorial", "Tutorial schedule")}>
    <CalendarSync status={calendar.data ?? null} path="/dashboard/schedule" reload={calendar.reload} />
    <Notice notice={operation.notice} />
    <Remote state={state}>{data => <>
      <Actions>
        {offset !== 0 && <Action label={tr("Minggu ini", "This week")} onPress={() => setOffset(0)} disabled={operation.pending} />}
        <Action label={tr("Perbarui jadwal", "Refresh schedule")} onPress={state.reload} disabled={operation.pending} />
        {route.query.course && <Action label={tr("Semua kursus", "All courses")} onPress={() => navigate("/dashboard/schedule")} />}
      </Actions>
      {data.locked && <Copy kind="muted">{tr("Pemesanan minggu ini sudah ditutup.", "Booking for this week is closed.")}</Copy>}
      <WeekCalendar key={`${route.query.course ?? "all"}:${data.week.startIso}`} schedule={data} pending={operation.pending} offset={offset}
        onPeriodChange={direction => { setOffset(value => value + direction); if (direction > 0) tour?.("nextWeek"); }} apply={apply} />
    </>}</Remote>
  </Page>;
}
