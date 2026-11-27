import { toggleSlotCourseSelection } from "../../../../../lib/schedule/slot-courses";
import { discussionDestination, discussionWorkspaceHref } from "../../../../../packages/native-parity/discussion-destination";
import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { randomUUID } from "expo-crypto";
import { openBrowserAsync } from "expo-web-browser";
import { AccessibilityInfo, ActivityIndicator, AppState, ScrollView, View } from "react-native";
import type {
  TutorDiscussionChange,
  TutorDiscussionComposerDraft,
  TutorDiscussThread,
  TutorLiveData,
  TutorLiveHost,
  TutorMaterialsData,
  TutorScheduleData,
  TutorSupportClient,
  TutorVideosData,
} from "../../../../../packages/academic/tutor-support";
import { DISCUSSION_REACTIONS, discussionMentionTokens } from "../../../../../lib/discussions/policy";
import type { DiscussionChannelMetadata, DiscussionMention } from "../../../../../lib/discussions/contracts";
import { activeTutorMentions, insertTutorMention, tutorMentionSubmission } from "../../../../../packages/academic/tutor-discussion-mentions";
import { discussionAiMessage, listRefreshDelay, threadRefreshDelay } from "../../student/community/discussion-refresh";
import { TutorDiscussionMessageActions } from "./discussion-message-actions";
import { useDiscussionViewport, useVisibleDiscussionRead } from "../../discussions/read-viewport";
import { useTutorDiscussionForeground, useTutorDiscussionPoll } from "./discussion-poll";
import { appendTutorList, extendTutorThread, initialTutorThread, readbackTutorThread, refreshTutorList, refreshTutorThread,
  tutorListView, tutorThreadView, type TutorListWindow, type TutorThreadWindow } from "./discussion-window";
import { TutorDiscussionChannels } from "./discussion-channels";
import { TutorDiscussionQuestion } from "./discussion-question";
import { TutorDiscussionMentionPicker, TutorDiscussionPerson } from "./discussion-mentions";
import type { TutorSlotEditor, TutorSlotPending } from "../../../../../packages/academic/tutor-slot";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NativeRequestNotDispatched } from "../../../network/transport";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicScreenProps } from "../contracts";
import { CourseVideoDialog } from "../../course-video/CourseVideoDialog";
import { CourseVideoManagement } from "../../course-video/Management";
import { ScheduleResources } from "../../schedule/resources";
import { SharedDialog } from "../../shared-ui";
import { CalendarActions } from "./calendar-actions";
import { TicketActions } from "./ticket-actions";
import { TutorDiscussionImage, TutorDiscussionImages } from "./discussion-images";
import { TutorLiveHostPanel } from "./live-host";
import { TutorWeekCalendar, tutorJakartaToday } from "./schedule-calendar";
import { Choices, Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout } from "./ui";

type Navigation = Pick<AcademicScreenProps, "theme" | "back" | "navigate" | "replace" | "query">;

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function dated(date: string | null, fallback = "") {
  if (!date) return fallback;
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? fallback : dateFormat.format(parsed);
}

function times(start: string | null, end: string | null) {
  return [start, end].flatMap((part) => part ? [part.slice(0, 5)] : []).join(" sampai ");
}

type ScheduleTab = "calendar" | "tickets" | "groups";
const ticketStatuses = { pending: "Menunggu keputusan", approved: "Disetujui", rejected: "Ditolak" };

import { useTourEvent } from "../../onboarding/tour-events";

export function ConnectedSchedule({ data: initial, week, theme, back, replace, query, editor, ticketEditor, calendarEditor, loadWeek, reload }: Navigation & {
  week: number;
  data: TutorScheduleData;
  editor?: TutorSlotEditor;
  ticketEditor?: TutorSupportClient["ticketEditor"];
  calendarEditor?: TutorSupportClient["calendarEditor"];
  loadWeek?: TutorSupportClient["schedule"];
  reload(signal: AbortSignal): Promise<TutorScheduleData>;
}) {
  const { canInteract } = useProtectedInteraction();
  const tour = useTourEvent();
  const [scheduleState, setScheduleState] = useState<{ data: TutorScheduleData } | { error: string }>({ data: initial });
  const [tab, setTab] = useState<ScheduleTab>(query.tab === "tickets" ? "tickets" : "calendar");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => query.date >= initial.from && query.date <= initial.to ? query.date : undefined);
  const [draft, setDraft] = useState<TutorSlotPending | null>(null);
  const [sessionId, setSessionId] = useState<string>();
  const [slotError, setSlotError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const schedule = "data" in scheduleState ? scheduleState.data : undefined;
  const pending = schedule ? editor?.pending() ?? [] : [];
  const awaiting = Boolean(draft && pending.some((item) => item.target?.slotId === draft.target?.slotId));
  const attempt = useRef<AbortController | null>(null);
  const addSlotRef = useRef<ComponentRef<typeof Button>>(null);
  useEffect(() => () => attempt.current?.abort(), []);

  function openSlot(value: TutorSlotPending) {
    if (saving) return;
    if (!value.target) tour?.("addSlot");
    setDraft(pending.find((item) => item.target?.slotId === value.target?.slotId) ?? value);
    setSlotError("");
    setBlocked(false);
  }

  function loseAccess(message: string) {
    setScheduleState({ error: message });
    setDraft(null);
    setSessionId(undefined);
    setSearch("");
    setSelectedDate(undefined);
    setSlotError("");
    setNotice("");
    setNeedsRefresh(false);
    setBlocked(false);
  }

  async function refresh(signal: AbortSignal) {
    try {
      const current = await reload(signal);
      if (!signal.aborted) { setScheduleState({ data: current }); setNeedsRefresh(false); }
    } catch (error: unknown) {
      if (signal.aborted) return;
      if (accessEnded(error)) loseAccess("Jadwal tidak dapat diakses.");
      else setNeedsRefresh(true);
    }
  }

  async function refreshSchedule() {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    setSaving(true);
    try {
      await refresh(controller.signal);
    } finally {
      attempt.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  async function save() {
    if (!canInteract() || !editor || !draft || !schedule || attempt.current || blocked) return;
    const controller = new AbortController();
    const { signal } = controller;
    attempt.current = controller;
    setSaving(true);
    setSlotError("");
    try {
      const result = await editor.save(draft.target, draft.fields, randomUUID(), signal);
      if (signal.aborted) return;
      if (result.status === "saved") {
        const date = result.receipt.date;
        setDraft(null);
        setNotice(result.receipt.created ? `${result.receipt.created} slot ditambah, ${result.receipt.skipped} dilewati.` : "Slot tersimpan.");
        const targetWeek = week + Math.floor((Date.parse(date) - Date.parse(schedule.from)) / (7 * 86_400_000));
        if (targetWeek !== week && targetWeek >= -520 && targetWeek <= 520) replace(`/tutor/schedule?week=${targetWeek}&date=${date}`);
        else {
          setSelectedDate(targetWeek === week ? date : undefined);
          await refresh(signal);
        }
      } else if (result.status === "denied" || result.status === "missing") {
        loseAccess(result.status === "missing" ? "Slot tidak tersedia. Muat jadwal terbaru." : "Akses jadwal ditolak.");
      } else {
        setSlotError({
          invalid: "Periksa tanggal, durasi dan lokasi slot.",
          conflict: "Slot telah berubah. Muat jadwal terbaru.",
          booked: "Slot dengan riwayat pemesanan tidak dapat diedit.",
          overlap: "Waktu pilihan bertumpang tindih dengan slot lain.",
          unknown: "Penyimpanan belum terkonfirmasi. Coba kirim lagi.",
        }[result.status]);
        if (result.status === "booked" || result.status === "conflict") {
          setBlocked(true);
          setNeedsRefresh(true);
        }
      }
    } catch {
      if (!signal.aborted) setSlotError("Slot belum tersimpan. Coba simpan lagi.");
    } finally {
      attempt.current = null;
      if (!signal.aborted) setSaving(false);
    }
  }

  if ("error" in scheduleState) return <TutorPage title="Jadwal mengajar" theme={theme} onBack={back}>
    <LoadFailure theme={theme} error={scheduleState.error} retry={refreshSchedule} />
  </TutorPage>;

  const data = scheduleState.data;
  const assigned = data.courses ?? [];
  const existingIds = data.slots.find(item => item.id === draft?.target?.slotId)?.courseIds ?? [];
  const selectedIds = draft?.fields.courseIds ?? existingIds.map(id => assigned.find(course => course.legacyId === id)?.id ?? id);
  const term = search.trim().toLowerCase();
  const matches = (values: (string | null)[]) => values.some((value) => value?.toLowerCase().includes(term));
  const slots = data.slots.filter((slot) => !term || matches([slot.date, slot.start, slot.location]));
  const sessions = data.sessions.filter((session) => !term || matches([session.date, session.groupName, session.courseTitle, session.topic]));
  const sessionStatus = (status: string) => status === "completed" ? "Selesai" : status === "cancelled" ? "Dibatalkan" : "Terjadwal";
  const events = [
    ...slots.map((slot) => ({
      id: `slot-${slot.id}`, dateId: slot.date, title: "Slot ketersediaan",
      caption: [times(slot.start, slot.end), slot.mode === "online" ? "Daring" : slot.location ?? "Tatap muka",
        slot.booked ? "Terisi" : slot.hasBookingHistory ? "Ada riwayat pemesanan" : "Tersedia"].join(" · "),
      disabled: Boolean(editor && !slot.revision),
    })),
    ...sessions.flatMap((session) => session.date ? [{
      id: `session-${session.id}`, dateId: session.date, title: session.topic ?? session.courseTitle ?? "Sesi tutorial",
      caption: [session.groupName, times(session.start, session.end), sessionStatus(session.status)].filter(Boolean).join(" · "),
      disabled: false,
    }] : []),
  ];
  const today = tutorJakartaToday();
  const defaultDate = !term && today >= data.from && today <= data.to ? today : events[0]?.dateId ?? data.from;
  const undated = sessions.filter((session) => !session.date);
  const selectedSession = data.sessions.find((session) => session.id === sessionId);

  return <><TutorPage title="Jadwal mengajar" theme={theme} onBack={back}>
    <Choices<ScheduleTab> theme={theme} label="Bagian jadwal" value={tab} change={value => { setTab(value); if (value === "calendar" || value === "tickets") tour?.(value === "calendar" ? "sessions" : "tickets"); }}
      options={[["calendar", "Kalender"], ["tickets", "Tiket"], ["groups", "Kelas dan kelompok"]]} />
    {tab === "calendar" ? <>
      {notice ? <Label theme={theme} tone="strong">{notice}</Label> : null}
      {needsRefresh ? <LoadFailure theme={theme} error="Jadwal perlu diperbarui." retry={refreshSchedule} /> : null}
      {editor ? <Button ref={addSlotRef} theme={theme} style={tutorLayout.action} disabled={saving || needsRefresh}
        onPress={() => openSlot({ target: undefined, fields: { date: selectedDate ?? defaultDate, start: "09:00", mode: "online", location: "", notes: "" } })}>
        Tambah slot
      </Button> : null}
      {calendarEditor && loadWeek ? <CalendarActions theme={theme} week={week} data={data} editor={calendarEditor} schedule={loadWeek}
        refresh={refreshSchedule} denied={() => loseAccess("Akses jadwal berakhir.")} /> : null}
      {pending.map((item) => <Button key={item.target?.slotId ?? "create"} theme={theme} variant="outline" style={tutorLayout.action}
        disabled={saving} onPress={() => openSlot(item)}>{`Lanjutkan pengiriman slot ${dated(item.fields.date)}`}</Button>)}
      <Input theme={theme} accessibilityLabel="Cari slot dan sesi" placeholder="Cari slot, topik, kelompok" value={search}
        onChangeText={(value) => { setSearch(value); setSelectedDate(undefined); }} style={tutorLayout.input} />
      <TutorWeekCalendar theme={theme} start={data.from} week={week} today={today} selectedDate={selectedDate ?? defaultDate}
        events={events} onDateChange={setSelectedDate}
        onWeekChange={(direction) => { if (!saving) replace(`/tutor/schedule?week=${week + direction}`); }}
        onEventPress={(id) => {
          if (needsRefresh) return;
          if (id.startsWith("session-")) {
            const session = sessions.find((candidate) => id === `session-${candidate.id}`);
            if (session && canInteract()) setSessionId(session.id);
            return;
          }
          if (!editor) return;
          const slot = slots.find((candidate) => id === `slot-${candidate.id}`);
          if (!slot?.revision) return;
          openSlot({ target: { slotId: slot.id, expectedRevision: slot.revision },
            fields: { date: slot.date, start: slot.start, mode: slot.mode, location: slot.location ?? "", notes: slot.notes ?? "" } });
        }} />
      {undated.length ? <View>
        <Heading theme={theme} title="Sesi tanpa tanggal" count={String(undated.length)} />
        {undated.map((session) => <Row key={session.id} theme={theme}
          title={session.topic ?? session.courseTitle ?? "Sesi tutorial"}
          subtitle={[session.groupName, times(session.start, session.end)].filter(Boolean).join(" · ")}
          meta={sessionStatus(session.status)} onPress={() => { if (canInteract()) setSessionId(session.id); }} />)}
      </View> : null}
    </> : null}
    {tab === "tickets" ? <View>
      {data.tickets.map((ticket) => <Row key={ticket.id} theme={theme}
        title={ticket.type === "reschedule" ? "Penjadwalan ulang" : "Pembatalan"}
        subtitle={ticket.reason} meta={ticketStatuses[ticket.status]}>
        {ticket.proposedDate ? <Label theme={theme} tone="muted">Usulan {dated(ticket.proposedDate)}</Label> : null}
        {ticketEditor ? <TicketActions ticket={ticket} editor={ticketEditor} theme={theme} refresh={refreshSchedule}
          denied={() => loseAccess("Akses tiket berakhir.")} /> : null}
      </Row>)}
      {data.tickets.length === 0 ? <Empty theme={theme} title="Tidak ada tiket penjadwalan ulang atau pembatalan" /> : null}
    </View> : null}
    {tab === "groups" ? <View>
      {data.groups.map((group) => <Row key={group.id} theme={theme} title={group.name}
        subtitle={group.packageName} meta={`${group.members} anggota`}>
        <Label theme={theme} tone="muted">{group.used}/{group.total} sesi digunakan</Label>
      </Row>)}
      {data.groups.length === 0 ? <Empty theme={theme} title="Belum ada kelompok aktif" /> : null}
    </View> : null}
  </TutorPage>
  <SharedDialog open={Boolean(selectedSession)} theme={theme} title={selectedSession?.topic ?? selectedSession?.courseTitle ?? "Sesi tutorial"}
    description={selectedSession ? [selectedSession.groupName, dated(selectedSession.date), times(selectedSession.start, selectedSession.end),
      sessionStatus(selectedSession.status)].filter(Boolean).join(" · ") : undefined}
    closeLabel="Kembali" onDismiss={() => setSessionId(undefined)} testID="tutor-schedule-session-dialog">
    {selectedSession ? <ScheduleResources key={selectedSession.id} bookingId={selectedSession.id} role="tutor" theme={theme} onUpdated={refreshSchedule} /> : null}
  </SharedDialog>
  <SharedDialog open={Boolean(draft)} theme={theme} title={draft?.target ? "Edit slot ketersediaan" : "Tambah slot ketersediaan"}
    description="90 menit" closeLabel="Kembali" onDismiss={() => { setDraft(null); tour?.("cancelSlot"); }}
    dismissOnBackdrop={false} dismissDisabled={saving} returnFocusRef={addSlotRef} testID="tutor-connected-slot-dialog"
    footer={<Button theme={theme} style={tutorLayout.action} onPress={save} isLoading={saving} disabled={blocked}>
      {awaiting ? "Coba kirim lagi" : "Simpan slot"}
    </Button>}>
    {draft ? <>
      <Label theme={theme} tone="strong">Tanggal (YYYY-MM-DD)</Label>
      <Input theme={theme} accessibilityLabel="Tanggal" value={draft.fields.date} editable={!saving && !awaiting && !blocked}
        onChangeText={(date) => setDraft({ ...draft, fields: { ...draft.fields, date } })} />
      <Label theme={theme} tone="strong">Mulai (HH:MM)</Label>
      <Input theme={theme} accessibilityLabel="Waktu mulai" value={draft.fields.start} editable={!saving && !awaiting && !blocked}
        onChangeText={(start) => setDraft({ ...draft, fields: { ...draft.fields, start } })} />
      <Choices<"online" | "offline"> theme={theme} label="Mode sesi" value={draft.fields.mode} disabled={saving || awaiting || blocked}
        change={(mode) => setDraft({ ...draft, fields: { ...draft.fields, mode } })} options={[["online", "Daring"], ["offline", "Tatap muka"]]} />
      {draft.fields.mode === "offline" ? <Input theme={theme} accessibilityLabel="Lokasi" placeholder="Lokasi atau ruangan" value={draft.fields.location}
        editable={!saving && !awaiting && !blocked} onChangeText={(location) => setDraft({ ...draft, fields: { ...draft.fields, location } })} /> : null}
      {!draft.target ? <Choices theme={theme} label="Jumlah minggu" value={String(draft.fields.weeks ?? 1)}
        options={[["1", "1 minggu"], ["2", "2 minggu"], ["3", "3 minggu"], ["4", "4 minggu"]]} disabled={saving || awaiting || blocked}
        change={weeks => setDraft({ ...draft, fields: { ...draft.fields, weeks: Number(weeks) } })} /> : null}
      {assigned.length || existingIds.length ? <View style={tutorLayout.group}>
        <Label theme={theme} tone="strong">Mata kuliah</Label>
        <Button theme={theme} variant={selectedIds.length ? "ghost" : "outline"}
          accessibilityState={{ selected: !selectedIds.length }} disabled={saving || awaiting || blocked}
          onPress={() => setDraft({ ...draft, fields: { ...draft.fields, courseIds: [] } })}>Semua mata kuliah yang diampu</Button>
        {assigned.map(course => <Button key={course.id} theme={theme} variant={selectedIds.includes(course.id) ? "outline" : "ghost"}
          accessibilityState={{ selected: selectedIds.includes(course.id) }} disabled={saving || awaiting || blocked}
          onPress={() => setDraft({ ...draft, fields: { ...draft.fields, courseIds: toggleSlotCourseSelection(
            selectedIds.filter(id => assigned.some(option => option.id === id)), course.id, assigned.map(option => option.id)) } })}>{course.title}</Button>)}
        {selectedIds.filter(id => !assigned.some(course => course.id === id)).map(id => <Label key={id} theme={theme}>{id}</Label>)}
      </View> : null}
      <Input theme={theme} accessibilityLabel="Catatan slot" placeholder="Catatan slot (opsional)" value={draft.fields.notes} multiline
        maxLength={4000} editable={!saving && !awaiting && !blocked} onChangeText={(notes) => setDraft({ ...draft, fields: { ...draft.fields, notes } })} />
      {slotError ? <Label theme={theme} tone="error">{slotError}</Label> : null}
    </> : null}
  </SharedDialog></>;
}

function LoadFailure({ theme, error, retry }: { theme: Navigation["theme"]; error: string; retry: () => void }) {
  return <View style={tutorLayout.group}>
    <Label theme={theme} tone="error">{error}</Label>
    <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={retry}>Coba lagi</Button>
  </View>;
}

function accessEnded(error: unknown) {
  return error instanceof TutorDataError && [401, 403, 404].includes(error.status);
}

const discussionSessionKeys = new WeakMap<TutorSupportClient, number>();
let nextDiscussionSession = 0;
function discussionSessionKey(service: TutorSupportClient) {
  const existing = discussionSessionKeys.get(service);
  if (existing !== undefined) return existing;
  const key = nextDiscussionSession++;
  discussionSessionKeys.set(service, key);
  return key;
}

export function ConnectedDiscussions({ theme, back, replace, query, courseId, service, workspacePath, subtitle, header }: Navigation & {
  courseId?: string;
  workspacePath?: string;
  subtitle?: string;
  header?: ReactNode;
  service: TutorSupportClient;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [listWindow, setListWindow] = useState<TutorListWindow>();
  const page = useMemo(() => listWindow ? tutorListView(listWindow) : undefined, [listWindow]);
  const [listError, setListError] = useState("");
  const [listUnavailable, setListUnavailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const target = discussionDestination(new URLSearchParams(query));
  const [active, setActive] = useState<string | null>(target?.thread ?? null);
  const [channel, setChannel] = useState<DiscussionChannelMetadata>();
  const [creating, setCreating] = useState<DiscussionChannelMetadata>();
  const [submittedMessage, setSubmittedMessage] = useState<{ threadId: string; messageId: string }>();
  const [discussionStatus, setDiscussionStatus] = useState<"open" | "resolved">("open");
  const listChannel = courseId ? undefined : channel?.id;
  const foreground = useTutorDiscussionForeground();
  const { canInteract, suspended } = useProtectedInteraction();
  const listScope = JSON.stringify([discussionSessionKey(service), courseId, term, listChannel, discussionStatus, attempt]);
  const listRead = useCallback((cursor: string | undefined, signal: AbortSignal) => service.discussions(courseId, term, cursor, signal,
    service.discussionWorkspace ? { channelId: listChannel, status: discussionStatus } : undefined),
  [courseId, discussionStatus, listChannel, service, term]);
  useEffect(() => { listScroll.current?.scrollTo({ y: 0, animated: false }); }, [listScope, listWindow?.start]);

  useEffect(() => {
    const controller = new AbortController();
    setListWindow(undefined);
    setListError("");
    setListUnavailable(false);
    setLoadingMore(false);
    listRead(undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setListWindow({ pages: [data] }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (accessEnded(error)) setListUnavailable(true);
        else setListError("Diskusi gagal dimuat.");
      });
    return () => {
      controller.abort();
      pageRequest.current?.abort();
      pageRequest.current = null;
    };
  }, [listRead, attempt]);

  useTutorDiscussionPoll(Boolean(foreground && !suspended && !active && !creating && listWindow && !listUnavailable),
    listRefreshDelay(), listScope, async signal => {
      if (!listWindow || pageRequest.current || !canInteract()) return;
      try {
        const result = await refreshTutorList(listWindow, listRead, signal);
        if (signal.aborted || pageRequest.current || !canInteract()) return;
        setListWindow(previous => previous === listWindow ? result : previous);
        setListError("");
      } catch (error) {
        if (signal.aborted || !canInteract()) return;
        if (accessEnded(error)) { setListWindow(undefined); setListUnavailable(true); }
      }
    });

  async function more() {
    const cursor = page?.nextCursor;
    if (!cursor || pageRequest.current || !canInteract()) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setListError("");
    try {
      const next = await listRead(cursor, controller.signal);
      if (!controller.signal.aborted && canInteract()) {
        setListWindow(previous => previous ? appendTutorList(previous, cursor, next) : previous);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (accessEnded(error)) {
          setListWindow(undefined);
          setListUnavailable(true);
        } else {
          setListError("Diskusi berikutnya gagal dimuat.");
        }
      }
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        if (!controller.signal.aborted) setLoadingMore(false);
      }
    }
  }

  return <>
    <TutorPage title="Diskusi" subtitle={subtitle} theme={theme} onBack={back} header={header} scrollRef={listScroll}>
      {service.discussionWorkspace ? <>
        <TutorDiscussionChannels client={service.discussionWorkspace} {...{ courseId, theme }} selected={channel}
          active={!active && !creating} choose={setChannel} create={setCreating} />
        <Choices theme={theme} label="Status diskusi" value={discussionStatus} change={setDiscussionStatus} tabBar
          options={[["open", "Terbuka"], ["resolved", "Selesai"]]} />
      </> : null}
      <Input theme={theme} accessibilityLabel="Cari diskusi" placeholder="Cari diskusi"
        maxLength={160} returnKeyType="search" value={search}
        onChangeText={setSearch} onSubmitEditing={() => setTerm(search.trim())} style={tutorLayout.input} />
      {(query.thread || query.message) && !target ? <Empty theme={theme} title="Tautan diskusi tidak valid." /> : null}
      {search.trim() !== term ? <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => setTerm(search.trim())}>Cari</Button> : null}
      {listError ? <LoadFailure theme={theme} error={listError} retry={page ? more : () => setAttempt((value) => value + 1)} /> : null}
      {listUnavailable ? <Empty theme={theme} title="Diskusi tidak tersedia" /> : null}
      {!page && !listError && !listUnavailable ? <ActivityIndicator accessibilityLabel="Memuat diskusi" /> : null}
      {page ? <View>
        {page.items.map((thread) => <Row key={thread.id} theme={theme} title={thread.title}
          subtitle={[!courseId && thread.channelLabel, thread.status === "resolved" && "Terselesaikan"].filter(Boolean).join(" · ") || undefined} meta={`${thread.answerCount} jawaban`}
          onPress={() => setActive(thread.id)} />)}
        {page.items.length === 0 ? <Empty theme={theme} title={term ? "Diskusi tidak ditemukan" : "Belum ada diskusi"} /> : null}
        {listWindow?.start ? <Button theme={theme} variant="outline" style={tutorLayout.action}
          disabled={loadingMore} onPress={() => setAttempt(value => value + 1)}>Diskusi terbaru</Button> : null}
        {page.nextCursor && !listError ? <Button theme={theme} variant="outline" style={tutorLayout.action}
          isLoading={loadingMore} onPress={more}>Tampilkan lebih banyak</Button> : null}
      </View> : null}
    </TutorPage>
    {creating ? <TutorDiscussionQuestion key={JSON.stringify([creating.id, discussionSessionKey(service)])} channel={creating}
      {...{ theme, courseId, service }} close={() => setCreating(undefined)} sent={submitted => {
        setCreating(undefined); setSubmittedMessage(submitted); setActive(submitted.threadId);
        setDiscussionStatus("open"); setAttempt(value => value + 1);
      }} /> : null}
    {active ? <ConnectedDiscussionDetail key={JSON.stringify([active, discussionSessionKey(service)])} theme={theme} courseId={courseId} threadId={active}
      targetMessage={submittedMessage?.threadId === active ? submittedMessage.messageId : active === target?.thread ? target.message : undefined} service={service}
      openTarget={next => {
        setSubmittedMessage(next); setActive(next.threadId);
      }}
      close={() => {
        setActive(null);
        setSubmittedMessage(undefined);
        if (active === target?.thread) {
          const path = workspacePath ?? (courseId ? `/tutor/${encodeURIComponent(courseId)}/discussions` : "/tutor/discussions");
          replace(discussionWorkspaceHref(path, new URLSearchParams(query)));
        }
      }} onThread={thread => setListWindow(previous => previous && ({
        ...previous, pages: previous.pages.map(page => ({ ...page, items: page.items.flatMap(item => {
          if (item.id !== thread.id) return [item];
          return !service.discussionWorkspace || thread.status === discussionStatus ? [{ ...item, ...thread }] : [];
        }) })),
      }))} /> : null}
  </>;
}

function ConnectedDiscussionDetail({ theme, courseId, threadId, targetMessage, service, close, onThread, openTarget }: {
  theme: Navigation["theme"];
  courseId?: string;
  threadId: string;
  targetMessage?: string;
  service: TutorSupportClient;
  close: () => void;
  onThread(thread: TutorDiscussThread): void;
  openTarget(target: { threadId: string; messageId: string }): void;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const foreground = useTutorDiscussionForeground();
  const imageActions = useContext(TutorDiscussionImages);
  const [window, setWindow] = useState<TutorThreadWindow>();
  const data = useMemo(() => window ? tutorThreadView(window) : undefined, [window]);
  const [liveError, setLiveError] = useState(false);
  const latestThread = useRef(onThread);
  latestThread.current = onThread;
  const windowEpoch = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const currentThread = unavailable ? undefined : data?.thread;
  useEffect(() => { if (currentThread) latestThread.current(currentThread); }, [currentThread]);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRequest = useRef<AbortController | null>(null);
  const earlierPage = useRef(false);
  const sendRequest = useRef<AbortController | null>(null);
  const imageRequest = useRef<AbortController | null>(null);
  const changeRequest = useRef<AbortController | null>(null);
  const [composer, setComposer] = useState<TutorDiscussionComposerDraft>(() => {
    const saved = service.discussionDraft?.(threadId);
    const inFlight = service.pendingAnswer?.(threadId);
    if (!inFlight) return saved ?? { body: "", images: [], mentions: [] };
    return {
      body: inFlight.body, replyTo: inFlight.replyTo,
      mentions: (inFlight.mentionIds ?? []).flatMap((id, index) => {
        const handle = inFlight.mentionHandles?.[index];
        return handle ? [{ id, handle }] : [];
      }),
      images: (inFlight.attachmentIds ?? []).map(id => ({ id, name: saved?.images.find(image => image.id === id)?.name ?? "Gambar" })),
    };
  });
  const { body: draft, mentions, replyTo, images } = composer;
  const editor = useRef<ComponentRef<typeof Input>>(null);
  const selection = useRef({ start: draft.length, end: draft.length });
  const [requestedSelection, setRequestedSelection] = useState<typeof selection.current>();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [person, setPerson] = useState<{ id: string; messageId: string }>();
  const [pending, setPending] = useState(() => Boolean(service.pendingAnswer?.(threadId)));
  const [legacyMessageId, setLegacyMessageId] = useState(() => service.unverifiedDiscussionAnswer?.(threadId)?.messageId);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [readback, setReadback] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reactionMenu, setReactionMenu] = useState<string>();
  const askingZyra = discussionMentionTokens(draft).has("zyra");
  const aiStatuses = data?.aiStatuses ?? [];
  const aiPollDelay = threadRefreshDelay({ aiStatuses });
  const refreshScope = JSON.stringify([discussionSessionKey(service), courseId, threadId, targetMessage, attempt]);

  useEffect(() => { service.rememberDiscussionDraft?.(threadId, composer); }, [service, threadId, composer]);

  useTutorDiscussionPoll(Boolean(foreground && !suspended && window && !unavailable && !picking),
    aiPollDelay, refreshScope, async signal => {
      if (!window || pageRequest.current || sendRequest.current || changeRequest.current || !canInteract()) return;
      const version = windowEpoch.current;
      try {
        const next = await refreshTutorThread(window, (locator, requestSignal) =>
          service.discussion(courseId, threadId, locator.cursor, requestSignal, locator.target), signal);
        if (signal.aborted || version !== windowEpoch.current || !canInteract()) return;
        setWindow(previous => previous === window ? next : previous);
        setLiveError(false);
      } catch (failure) {
        if (signal.aborted || version !== windowEpoch.current || !canInteract()) return;
        if (accessEnded(failure)) { setWindow(undefined); setUnavailable(true); }
        else setLiveError(true);
      }
    });

  useEffect(() => () => {
    sendRequest.current?.abort();
    imageRequest.current?.abort();
    changeRequest.current?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    windowEpoch.current++;
    setError("");
    setLiveError(false);
    setUnavailable(false);
    setLoadingMore(false);
    setWindow(undefined);
    service.discussion(courseId, threadId, undefined, signal, targetMessage)
      .then(result => {
        if (signal.aborted) return;
        setWindow(initialTutorThread(result, { target: targetMessage }));
      })
      .catch((failure: unknown) => {
        if (signal.aborted) return;
        if (accessEnded(failure)) setUnavailable(true);
        else setError("Pesan gagal dimuat.");
      });
    return () => {
      controller.abort();
      pageRequest.current?.abort();
      pageRequest.current = null;
    };
  }, [service, courseId, threadId, targetMessage, attempt]);

  async function more(earlier = false) {
    const cursor = earlier ? data?.messages.previousCursor : data?.messages.nextCursor;
    if (!cursor || pageRequest.current || sendRequest.current || changeRequest.current || !canInteract()) return;
    earlierPage.current = earlier;
    windowEpoch.current++;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const next = await service.discussion(courseId, threadId, cursor, controller.signal);
      if (!controller.signal.aborted && canInteract()) {
        setWindow(previous => previous ? extendTutorThread(previous, cursor, next, earlier) : previous);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (accessEnded(error)) { setWindow(undefined); setUnavailable(true); }
        else setError(earlier ? "Pesan sebelumnya gagal dimuat." : "Pesan berikutnya gagal dimuat.");
      }
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        if (!controller.signal.aborted) setLoadingMore(false);
      }
    }
  }

  async function receiveMessage(messageId: string, signal: AbortSignal) {
    const version = ++windowEpoch.current;
    try {
      const result = await service.discussion(courseId, threadId, undefined, signal, messageId);
      if (signal.aborted || version !== windowEpoch.current || !canInteract()) return;
      setWindow(previous => readbackTutorThread(previous, result, messageId));
      setReadback(undefined);
      return result.messages.items.find(message => message.id === messageId);
    } catch (error) {
      if (!signal.aborted && version === windowEpoch.current) {
        if (accessEnded(error)) {
          setWindow(undefined);
          setReadback(undefined);
          setUnavailable(true);
        } else {
          setReadback(messageId);
        }
      }
    }
  }

  async function sendAnswer() {
    if (!canInteract() || !service.answer || (!draft.trim() && !images.length) || sendRequest.current || imageRequest.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    sendRequest.current = controller;
    setSending(true);
    setSendMessage("");
    try {
      const attempt = service.pendingAnswer?.(threadId) ?? { body: draft.trim(), requestId: randomUUID(),
        ...tutorMentionSubmission(draft, mentions),
        ...(replyTo ? { replyTo } : {}), ...(images.length ? { attachmentIds: images.map(image => image.id) } : {}),
      };
      const result = await service.answer(courseId, threadId, attempt, signal);
      if (signal.aborted) return;
      setPending(Boolean(service.pendingAnswer?.(threadId)));
      if (result.ok) {
        setComposer({ body: "", mentions: [], images: [] });
        setMentionOpen(false);
        setSendMessage(attempt.replyTo ? "Balasan terkirim." : "Jawaban terkirim.");
        await receiveMessage(result.value.messageId, signal);
      } else if (result.error === "replay_unverified") {
        setLegacyMessageId(result.value.messageId);
        setSendMessage("Pengiriman belum terkonfirmasi. Periksa jawaban yang ditemukan.");
        await receiveMessage(result.value.messageId, signal);
      } else {
        setSendMessage({
          invalid: "Periksa kembali isi jawaban.",
          unavailable: "Diskusi tidak tersedia atau akses Anda telah berubah.",
          rate_limited: "Terlalu banyak permintaan. Coba lagi nanti.",
          conflict: "Data telah berubah. Muat ulang diskusi.",
          resolved: "Diskusi sudah selesai.",
          attachment_expired: "Lampiran sudah kedaluwarsa.",
          unknown: "Pengiriman belum terkonfirmasi. Coba lagi.",
        }[result.error]);
      }
    } catch (error) {
      if (!signal.aborted) {
        setPending(Boolean(service.pendingAnswer?.(threadId)));
        if (error instanceof NativeRequestNotDispatched && !service.pendingAnswer?.(threadId)) setSendMessage("Jawaban belum terkirim. Coba kirim lagi.");
        else if (accessEnded(error)) setUnavailable(true);
        else if (error instanceof TutorDataError && error.status === 409) setSendMessage("Data telah berubah. Muat ulang diskusi.");
        else setSendMessage("Pengiriman belum terkonfirmasi. Coba lagi.");
      }
    } finally {
      sendRequest.current = null;
      if (!signal.aborted) setSending(false);
    }
  }

  async function pickImage() {
    if (!data?.thread.channelId || !imageActions || images.length >= 4 || imageRequest.current || sending || pending || !canInteract()) return;
    const controller = new AbortController();
    imageRequest.current = controller;
    setPicking(true); setSendMessage("");
    try {
      const image = await imageActions.pick(data.thread.channelId, threadId, controller.signal);
      if (image && !controller.signal.aborted) setComposer(previous => ({ ...previous, images: [...previous.images, image] }));
    } catch (error) {
      if (!controller.signal.aborted) setSendMessage(error instanceof Error && error.message === "size" ? "Gambar melebihi 8 MB." : "Gambar gagal dilampirkan.");
    } finally {
      if (imageRequest.current === controller) imageRequest.current = null;
      if (!controller.signal.aborted) setPicking(false);
    }
  }

  async function change(value: TutorDiscussionChange) {
    if (!service.changeDiscussion || changeRequest.current || !canInteract()) return;
    const controller = new AbortController();
    changeRequest.current = controller;
    const version = ++windowEpoch.current;
    setChanging(true); setSendMessage("");
    try {
      await service.changeDiscussion(courseId, threadId, value, randomUUID(), controller.signal);
      const usable = () => !controller.signal.aborted && version === windowEpoch.current && canInteract();
      if (value.action === "resolve" && window) {
        const next = await refreshTutorThread(window, (locator, signal) =>
          service.discussion(courseId, threadId, locator.cursor, signal, locator.target), controller.signal);
        if (usable()) setWindow(next);
      } else {
        const target = value.action === "reaction" ? value.messageId : targetMessage;
        const next = await service.discussion(courseId, threadId, undefined, controller.signal, target);
        if (usable()) setWindow(previous => readbackTutorThread(previous, next, target));
      }
      if (usable()) setReactionMenu(undefined);
    } catch (error) {
      if (!controller.signal.aborted && version === windowEpoch.current) {
        if (accessEnded(error)) { setWindow(undefined); setUnavailable(true); }
        else setSendMessage("Perubahan belum dapat diperiksa. Muat ulang diskusi.");
      }
    } finally {
      if (changeRequest.current === controller) changeRequest.current = null;
      if (!controller.signal.aborted) setChanging(false);
    }
  }

  function chooseMention(candidate?: DiscussionMention) {
    if (!canInteract() || sending || pending || !data?.thread.canReply) return;
    const result = insertTutorMention(draft, selection.current, mentions, candidate);
    if (!result) {
      setSendMessage("Gunakan maksimal 10 sebutan dan 12.000 karakter.");
      return;
    }
    setComposer(previous => ({ ...previous, body: result.body, mentions: result.bindings }));
    setRequestedSelection(result.selection);
    setSendMessage("");
    setMentionOpen(false);
    requestAnimationFrame(() => editor.current?.focus());
  }

  const viewport = useDiscussionViewport();
  const visibleRead = useVisibleDiscussionRead({
    scroller: viewport.scroller,
    pages: data?.readPages ?? [],
    enabled: Boolean(service.changeDiscussion && data && foreground && !suspended && !unavailable && !picking),
    submit: async (batch, signal) => {
      if (!service.changeDiscussion || !canInteract()) throw new Error("Discussion unavailable");
      await service.changeDiscussion(courseId, threadId, { action: "read", ...batch }, randomUUID(), signal);
    },
  });

  async function retryReadback(messageId = readback) {
    if (!messageId || sendRequest.current || !canInteract()) return;
    const controller = new AbortController();
    sendRequest.current = controller;
    try {
      await receiveMessage(messageId, controller.signal);
    } finally {
      sendRequest.current = null;
    }
  }

  return <TutorDetail viewport={viewport} title={data?.thread.title ?? "Diskusi"} theme={theme} onBack={() => { if (!sending) close(); }}
    subtitle={data?.thread.status === "resolved" ? "Terselesaikan" : undefined}
    footer={service.answer && (data?.thread.canReply || pending) && !unavailable ? <View style={tutorLayout.group}>
      {replyTo ? <View style={tutorLayout.cluster}>
        <Label theme={theme}>{`Balas ${data?.messages.items.find(item => item.id === replyTo)?.author ?? "pesan"}`}</Label>
        <Button theme={theme} variant="outline" disabled={sending || pending} onPress={() => setComposer(previous => ({ ...previous, replyTo: undefined }))}>Batal balas</Button>
      </View> : null}
      {images.length ? <View style={tutorLayout.cluster}>{images.map(image => <Button key={image.id} theme={theme} variant="outline"
        accessibilityLabel={`Lepas ${image.name}`} disabled={sending || pending} onPress={() => setComposer(previous => ({ ...previous, images: previous.images.filter(item => item.id !== image.id) }))}>{image.name}</Button>)}</View> : null}
      <Input ref={editor} theme={theme} multiline maxLength={12000} accessibilityLabel={replyTo ? "Balasan" : "Jawaban"}
        placeholder={replyTo ? "Tulis balasan" : "Tulis jawaban"} value={draft} selection={requestedSelection}
        onSelectionChange={event => { selection.current = event.nativeEvent.selection; if (requestedSelection) setRequestedSelection(undefined); }}
        onChangeText={body => setComposer(previous => ({ ...previous, body, mentions: activeTutorMentions(body, previous.mentions) }))}
        editable={!sending && !pending} />
      <View style={tutorLayout.cluster}>
        {imageActions && data?.thread.channelId && <Button theme={theme} variant="outline" style={tutorLayout.action}
          disabled={sending || pending || images.length >= 4} isLoading={picking} onPress={() => void pickImage()}>Lampirkan gambar</Button>}
        {service.discussionMentions && <Button theme={theme} variant="outline" disabled={sending || pending}
          accessibilityState={{ expanded: mentionOpen }} testID="tutor-discussion-mention-open"
          onPress={() => { if (canInteract()) setMentionOpen(value => !value); }}>Sebut peserta</Button>}
        <Button theme={theme} variant="outline" disabled={sending || pending || askingZyra} onPress={() => chooseMention()}>Tanya Zyra</Button>
      </View>
      {mentionOpen && !sending && !pending ? <TutorDiscussionMentionPicker {...{ service, courseId, threadId, theme }}
        select={chooseMention} close={() => setMentionOpen(false)} /> : null}
      {legacyMessageId ? <View style={tutorLayout.group}>
        <Label theme={theme} tone="muted">Isi kiriman lama belum terkonfirmasi.</Label>
        <View style={tutorLayout.cluster}>
          <Button theme={theme} onPress={() => void retryReadback(legacyMessageId)}>Periksa kiriman</Button>
          {!confirmDiscard ? <Button theme={theme} variant="outline" onPress={() => setConfirmDiscard(true)}>Tinggalkan percobaan</Button>
            : <Button theme={theme} variant="destructive" onPress={() => {
              if (!canInteract() || !service.discardUnverifiedDiscussionAnswer?.(threadId, legacyMessageId)) return;
              setComposer({ body: "", mentions: [], images: [] }); setLegacyMessageId(undefined);
              setPending(false); setConfirmDiscard(false); setSendMessage("");
            }}>Buang draf</Button>}
        </View>
      </View> : <Button theme={theme} style={tutorLayout.action} disabled={(!draft.trim() && !images.length) || picking} isLoading={sending} onPress={sendAnswer}>
        {pending ? "Coba kirim lagi" : replyTo ? "Kirim balasan" : "Kirim jawaban"}
      </Button>}
    </View> : undefined}>
    {unavailable ? <Empty theme={theme} title="Diskusi tidak tersedia" /> : null}
    {!data && !error && !unavailable ? <ActivityIndicator accessibilityLabel="Memuat pesan" /> : null}
    {sendMessage && !unavailable ? <Label theme={theme}>{sendMessage}</Label> : null}
    {liveError && !unavailable ? <Label theme={theme} tone="error">Pembaruan pesan belum dapat dimuat.</Label> : null}
    {!unavailable && data && service.changeDiscussion ? <View style={tutorLayout.cluster}>
      <Button theme={theme} variant="outline" disabled={changing} onPress={() => setAttempt(value => value + 1)}>Muat ulang diskusi</Button>
      {visibleRead.failed ? <Button theme={theme} variant="outline" onPress={visibleRead.retry}>Coba perbarui status baca</Button> : null}
      {data.thread.canResolve ? <Button theme={theme} variant="outline" disabled={changing}
        onPress={() => void change({ action: "resolve", resolved: data.thread.status !== "resolved" })}>
        {data.thread.status === "resolved" ? "Buka kembali" : "Tandai selesai"}
      </Button> : null}
    </View> : null}
    {!unavailable && data?.messages.items.map((message) => <Row key={message.id} contentRef={visibleRead.bindRow(message.id)} theme={theme}
      title={message.kind === "zyra" ? "Zyra" : message.author ?? "Pengguna"}
      subtitle={message.body} meta={!imageActions && message.attachmentCount ? `${message.attachmentCount} lampiran` : undefined}>
      {data.aiStatuses?.filter(status => status.messageId === message.id).map(status => <Label key={status.messageId}
        theme={theme} tone={status.status === "failed" || status.status === "uncertain" ? "error" : "muted"}>
        {discussionAiMessage(status, service.locale ?? "id")}
      </Label>)}
      {service.discussionProfile && (message.authorId || message.mentionedPeople?.length) ? <View style={tutorLayout.cluster}>
        {message.authorId && message.bodyKind !== "deleted" ? <Button theme={theme} variant="outline" testID={`discussion-author-profile-${message.id}`}
          accessibilityLabel={`Lihat profil ${message.author ?? "penulis"}`} onPress={() => {
            if (message.authorId && canInteract()) setPerson({ id: message.authorId, messageId: message.id });
          }}>Profil penulis</Button> : null}
        {message.mentionedPeople?.map(recipient => <Button theme={theme} key={recipient.id} variant="outline"
          accessibilityLabel={`Lihat profil ${recipient.name}`}
          onPress={() => { if (canInteract()) setPerson({ id: recipient.id, messageId: message.id }); }}>{`@${recipient.name}`}</Button>)}
      </View> : null}
      {person?.messageId === message.id ? <TutorDiscussionPerson key={person.id} {...{ service, courseId, threadId, theme }}
        personId={person.id} close={() => setPerson(undefined)} /> : null}
      {message.id === targetMessage ? <Label theme={theme}>Pesan yang dibuka</Label> : null}
      {message.replyTo ? <Label theme={theme} tone="muted">{message.replyTo.excerpt ?? "Balasan pada pesan sebelumnya"}</Label> : null}
      {message.attachments?.map(image => <TutorDiscussionImage key={image.id} theme={theme} image={image} />)}
      {service.discussionWorkspace ? <TutorDiscussionMessageActions
        {...{ theme, courseId, threadId, message }} client={service.discussionWorkspace} readback={receiveMessage} open={openTarget} /> : null}
      <View style={tutorLayout.cluster}>
        {message.canReply && <Button theme={theme} variant="outline" disabled={pending || sending} onPress={() => setComposer(previous => ({ ...previous, replyTo: message.id }))}>Balas</Button>}
        {message.reactions?.map(reaction => <Button key={reaction.emoji} theme={theme} variant={reaction.selected ? "default" : "outline"}
          disabled={!message.canReact || changing} onPress={() => void change({ action: "reaction", messageId: message.id,
            emoji: reaction.emoji, selected: !reaction.selected })}>{`${reaction.emoji} ${reaction.count}`}</Button>)}
        {message.canReact && service.changeDiscussion && <Button theme={theme} variant="outline" disabled={changing}
          onPress={() => setReactionMenu(reactionMenu === message.id ? undefined : message.id)}>Reaksi</Button>}
      </View>
      {reactionMenu === message.id && <View style={tutorLayout.cluster}>{DISCUSSION_REACTIONS.filter(emoji =>
        !message.reactions?.some(reaction => reaction.emoji === emoji)).map(emoji => <Button theme={theme} key={emoji} variant="outline" disabled={changing}
          onPress={() => void change({ action: "reaction", messageId: message.id, emoji, selected: true })}>{emoji}</Button>)}</View>}
    </Row>)}
    {error ? <LoadFailure theme={theme} error={error} retry={data ? () => void more(earlierPage.current) : () => setAttempt((value) => value + 1)} /> : null}
    {data?.messages.previousCursor && !error && !unavailable ? <Button theme={theme} variant="outline" style={tutorLayout.action}
      isLoading={loadingMore && earlierPage.current} disabled={loadingMore} onPress={() => void more(true)}>Pesan sebelumnya</Button> : null}
    {data?.messages.nextCursor && !error && !unavailable ? <Button theme={theme} variant="outline" style={tutorLayout.action}
      isLoading={loadingMore && !earlierPage.current} disabled={loadingMore} onPress={() => void more()}>Tampilkan lebih banyak</Button> : null}
    {readback ? <LoadFailure theme={theme} error="Jawaban belum dapat ditampilkan." retry={() => void retryReadback()} /> : null}
  </TutorDetail>;
}

export function ConnectedMaterials({ data, theme, back }: Navigation & { data: TutorMaterialsData }) {
  return <TutorPage title="Dokumen" subtitle={data.title} theme={theme} onBack={back}>
    <Heading theme={theme} title="Materi pengajaran" count={`${data.items.length} dokumen`} />
    {data.items.map((item) => <Row key={item.id} theme={theme} title={item.title} subtitle={item.summary} />)}
    {data.items.length === 0 ? <Empty theme={theme} title="Belum ada materi" /> : null}
  </TutorPage>;
}

function formatDuration(duration: number | null) {
  if (duration == null) return;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ConnectedVideos({ data, theme, back, playback, videoPlayer, courseId, refresh }: Navigation & {
  data: TutorVideosData; playback?: TutorSupportClient["playback"]; videoPlayer?: TutorSupportClient["videoPlayer"];
  courseId: string; refresh(): void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const trigger = useRef<ComponentRef<typeof Button> | null>(null);
  const { canInteract } = useProtectedInteraction();
  const load = useCallback((signal: AbortSignal) => {
    if (!videoPlayer || !selected) throw new TutorDataError(404);
    return videoPlayer.load(selected.id, signal);
  }, [videoPlayer, selected]);
  const [loadingVideo, setLoadingVideo] = useState<string>();
  const [error, setError] = useState("");
  const buttons = useRef(new Map<string, ComponentRef<typeof Button>>());
  const browserFocus = useRef<string | null>(null);
  const pendingPlayback = useRef<AbortController | null>(null);

  function restoreFocus() {
    const id = browserFocus.current;
    if (!id) return;
    browserFocus.current = null;
    requestAnimationFrame(() => {
      const node = buttons.current.get(id);
      if (!node) return;
      node.focus();
      AccessibilityInfo.sendAccessibilityEvent(node, "focus");
    });
  }

  useEffect(() => {
    const onActive = AppState.addEventListener("change", (state) => { if (state === "active") restoreFocus(); });
    const onFocus = AppState.addEventListener("focus", restoreFocus);
    return () => {
      pendingPlayback.current?.abort();
      onActive.remove();
      onFocus.remove();
    };
  }, []);

  async function play(videoId: string) {
    if (!playback || !canInteract() || pendingPlayback.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    pendingPlayback.current = controller;
    setError("");
    setLoadingVideo(videoId);
    try {
      const url = await playback(videoId, signal);
      if (signal.aborted) return;
      browserFocus.current = videoId;
      const result = await openBrowserAsync(url);
      if (result.type !== "opened") restoreFocus();
    } catch (error) {
      if (!signal.aborted) {
        setError(accessEnded(error) ? "Akses video tidak tersedia." : "Video gagal dibuka. Coba lagi.");
        restoreFocus();
      }
    } finally {
      if (!signal.aborted) setLoadingVideo(undefined);
      pendingPlayback.current = null;
    }
  }

  return <TutorPage title="Video" subtitle={data.title} theme={theme} onBack={back}>
    <CourseVideoManagement role="tutor" courseId={courseId} theme={theme} refresh={refresh} />
    <Heading theme={theme} title="Playlist" count={`${data.playlists.length} playlist`} />
    {error ? <Label theme={theme} tone="error">{error}</Label> : null}
    {data.playlists.map((playlist) => <View key={playlist.id}>
      <Row theme={theme} title={playlist.title} subtitle={playlist.description ?? undefined} meta={`${playlist.videos.length} video`}
        onPress={() => setExpanded((previous) => previous === playlist.id ? undefined : playlist.id)} />
      {expanded === playlist.id ? playlist.videos.map((video) => <Row key={video.id} theme={theme}
        title={video.title} meta={video.locked ? "Terkunci" : formatDuration(video.duration)}>
        {!video.locked && (videoPlayer || playback) ? <Button theme={theme} variant="outline" style={tutorLayout.action}
          accessibilityLabel={`Putar ${video.title}`}
          ref={(node) => {
            if (node) buttons.current.set(video.id, node);
            else buttons.current.delete(video.id);
          }}
          isLoading={loadingVideo === video.id} disabled={Boolean(loadingVideo && loadingVideo !== video.id)}
          onPress={() => {
            if (!canInteract()) return;
            if (!videoPlayer) { void play(video.id); return; }
            trigger.current = buttons.current.get(video.id) ?? null;
            setSelected({ id: video.id, title: video.title });
          }}>Putar</Button> : null}
      </Row>) : null}
    </View>)}
    {selected && videoPlayer && <CourseVideoDialog key={selected.id} title={selected.title} locale={videoPlayer.locale}
      theme={theme} origin={videoPlayer.origin} load={load} close={() => setSelected(null)} returnFocusRef={trigger} />}
    {data.playlists.length === 0 ? <Empty theme={theme} title="Belum ada playlist" /> : null}
  </TutorPage>;
}

export function ConnectedLive({ data, theme, back, courseTitle, courseId, host, refresh }: Navigation & {
  data: TutorLiveData; courseTitle?: string; courseId: string; host?: TutorLiveHost; refresh(): void;
}) {
  useStaffChromeVisibility({ hideBottom: !host && Boolean(data.active) });
  return <TutorPage title="Kuis langsung" subtitle={courseTitle} theme={theme} onBack={back}>
    {!data.configured ? <Empty theme={theme} title="Kuis langsung belum tersedia" />
      : host ? <TutorLiveHostPanel {...{ data, theme, courseId, host, refresh }} /> : <>
      {data.active ? <View>
        <Heading theme={theme} title={data.active.state === "lobby" ? "Ruang tunggu" : "Sesi berlangsung"} count={`${data.active.participantCount} peserta`} />
        <Row theme={theme} title="Kode gabung" meta={data.active.code} />
      </View> : <View>
        <Heading theme={theme} title="Kuis terbit" count={String(data.templates.length)} />
        {data.templates.map((template) => <Row key={template.id} theme={theme} title={template.title} />)}
        {data.templates.length === 0 ? <Empty theme={theme} title="Belum ada kuis terbit" /> : null}
      </View>}
      <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={refresh}>Muat ulang</Button>
    </>}
  </TutorPage>;
}
