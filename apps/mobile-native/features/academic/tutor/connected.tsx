import { discussionDestination, discussionWorkspaceHref } from "../../../../../packages/native-parity/discussion-destination";
import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { randomUUID } from "expo-crypto";
import { openBrowserAsync } from "expo-web-browser";
import { AccessibilityInfo, ActivityIndicator, AppState, View } from "react-native";
import type {
  TutorDiscussionDetail,
  TutorDiscussThread,
  TutorDiscussionList,
  TutorLiveData,
  TutorLiveHost,
  TutorMaterialsData,
  TutorScheduleData,
  TutorSupportClient,
  TutorVideosData,
} from "../../../../../packages/academic/tutor-support";
import type { TutorSlotEditor, TutorSlotPending } from "../../../../../packages/academic/tutor-slot";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NativeRequestNotDispatched } from "../../../network/transport";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicScreenProps } from "../contracts";
import { CourseVideoDialog } from "../../course-video/CourseVideoDialog";
import { SharedDialog } from "../../shared-ui";
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

export function ConnectedSchedule({ data: initial, week, theme, back, replace, query, editor, reload }: Navigation & {
  week: number;
  data: TutorScheduleData;
  editor?: TutorSlotEditor;
  reload(signal: AbortSignal): Promise<TutorScheduleData>;
}) {
  const { canInteract } = useProtectedInteraction();
  const [scheduleState, setScheduleState] = useState<{ data: TutorScheduleData } | { error: string }>({ data: initial });
  const [tab, setTab] = useState<ScheduleTab>(query.tab === "tickets" ? "tickets" : "calendar");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => query.date >= initial.from && query.date <= initial.to ? query.date : undefined);
  const [draft, setDraft] = useState<TutorSlotPending | null>(null);
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
    setDraft(pending.find((item) => item.target?.slotId === value.target?.slotId) ?? value);
    setSlotError("");
    setBlocked(false);
  }

  function loseAccess(message: string) {
    setScheduleState({ error: message });
    setDraft(null);
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
        setNotice("Slot tersimpan.");
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
      disabled: Boolean(editor),
    }] : []),
  ];
  const today = tutorJakartaToday();
  const defaultDate = !term && today >= data.from && today <= data.to ? today : events[0]?.dateId ?? data.from;
  const undated = sessions.filter((session) => !session.date);

  return <><TutorPage title="Jadwal mengajar" theme={theme} onBack={back}>
    <Choices<ScheduleTab> theme={theme} label="Bagian jadwal" value={tab} change={setTab}
      options={[["calendar", "Kalender"], ["tickets", "Tiket"], ["groups", "Kelas dan kelompok"]]} />
    {tab === "calendar" ? <>
      {notice ? <Label theme={theme} tone="strong">{notice}</Label> : null}
      {needsRefresh ? <LoadFailure theme={theme} error="Jadwal perlu diperbarui." retry={refreshSchedule} /> : null}
      {editor ? <Button ref={addSlotRef} theme={theme} style={tutorLayout.action} disabled={saving || needsRefresh}
        onPress={() => openSlot({ target: undefined, fields: { date: selectedDate ?? defaultDate, start: "09:00", mode: "online", location: "", notes: "" } })}>
        Tambah slot
      </Button> : null}
      {pending.map((item) => <Button key={item.target?.slotId ?? "create"} theme={theme} variant="outline" style={tutorLayout.action}
        disabled={saving} onPress={() => openSlot(item)}>{`Lanjutkan pengiriman slot ${dated(item.fields.date)}`}</Button>)}
      <Input theme={theme} accessibilityLabel="Cari slot dan sesi" placeholder="Cari slot, topik, kelompok" value={search}
        onChangeText={(value) => { setSearch(value); setSelectedDate(undefined); }} style={tutorLayout.input} />
      <TutorWeekCalendar theme={theme} start={data.from} week={week} today={today} selectedDate={selectedDate ?? defaultDate}
        events={events} onDateChange={setSelectedDate}
        onWeekChange={(direction) => { if (!saving) replace(`/tutor/schedule?week=${week + direction}`); }}
        onEventPress={editor ? (id) => {
          if (needsRefresh) return;
          const slot = slots.find((candidate) => id === `slot-${candidate.id}`);
          if (!slot?.revision) return;
          openSlot({ target: { slotId: slot.id, expectedRevision: slot.revision },
            fields: { date: slot.date, start: slot.start, mode: slot.mode, location: slot.location ?? "", notes: slot.notes ?? "" } });
        } : undefined} />
      {undated.length ? <View>
        <Heading theme={theme} title="Sesi tanpa tanggal" count={String(undated.length)} />
        {undated.map((session) => <Row key={session.id} theme={theme}
          title={session.topic ?? session.courseTitle ?? "Sesi tutorial"}
          subtitle={[session.groupName, times(session.start, session.end)].filter(Boolean).join(" · ")}
          meta={sessionStatus(session.status)} />)}
      </View> : null}
    </> : null}
    {tab === "tickets" ? <View>
      {data.tickets.map((ticket) => <Row key={ticket.id} theme={theme}
        title={ticket.type === "reschedule" ? "Penjadwalan ulang" : "Pembatalan"}
        subtitle={ticket.reason} meta={ticketStatuses[ticket.status]}>
        {ticket.proposedDate ? <Label theme={theme} tone="muted">Usulan {dated(ticket.proposedDate)}</Label> : null}
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
  <SharedDialog open={Boolean(draft)} theme={theme} title={draft?.target ? "Edit slot ketersediaan" : "Tambah slot ketersediaan"}
    description="90 menit" closeLabel="Kembali" onDismiss={() => setDraft(null)}
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

export function ConnectedDiscussions({ theme, back, replace, query, courseId, service }: Navigation & {
  courseId?: string;
  service: TutorSupportClient;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<TutorDiscussionList>();
  const [listError, setListError] = useState("");
  const [listUnavailable, setListUnavailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRequest = useRef<AbortController | null>(null);
  const target = discussionDestination(new URLSearchParams(query));
  const [active, setActive] = useState<string | null>(target?.thread ?? null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setPage(undefined);
    setListError("");
    setListUnavailable(false);
    setLoadingMore(false);
    service.discussions(courseId, term, undefined, signal)
      .then((data) => { if (!signal.aborted) setPage(data); })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (accessEnded(error)) setListUnavailable(true);
        else setListError("Diskusi gagal dimuat.");
      });
    return () => {
      controller.abort();
      pageRequest.current?.abort();
    };
  }, [service, courseId, term, attempt]);

  async function more() {
    if (!page?.nextCursor || loadingMore) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setListError("");
    try {
      const next = await service.discussions(courseId, term, page.nextCursor, controller.signal);
      if (!controller.signal.aborted) setPage({ items: [...page.items, ...next.items], nextCursor: next.nextCursor });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (accessEnded(error)) {
          setPage(undefined);
          setListUnavailable(true);
        } else {
          setListError("Diskusi berikutnya gagal dimuat.");
        }
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return <>
    <TutorPage title="Diskusi" theme={theme} onBack={back}>
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
          subtitle={thread.status === "resolved" ? "Terselesaikan" : undefined} meta={`${thread.answerCount} jawaban`}
          onPress={() => setActive(thread.id)} />)}
        {page.items.length === 0 ? <Empty theme={theme} title={term ? "Diskusi tidak ditemukan" : "Belum ada diskusi"} /> : null}
        {page.nextCursor && !listError ? <Button theme={theme} variant="outline" style={tutorLayout.action}
          isLoading={loadingMore} onPress={more}>Tampilkan lebih banyak</Button> : null}
      </View> : null}
    </TutorPage>
    {active ? <ConnectedDiscussionDetail key={active} theme={theme} courseId={courseId} threadId={active}
      targetMessage={active === target?.thread ? target.message : undefined} service={service}
      close={() => {
        setActive(null);
        if (active === target?.thread) {
          const path = courseId ? `/tutor/${encodeURIComponent(courseId)}/discussions` : "/tutor/discussions";
          replace(discussionWorkspaceHref(path, new URLSearchParams(query)));
        }
      }} onThread={(thread) => setPage((previous) => previous && ({
        ...previous, items: previous.items.map((item) => item.id === thread.id ? thread : item),
      }))} /> : null}
  </>;
}

function mergeDiscussionMessages(previous: TutorDiscussionDetail | undefined, next: TutorDiscussionDetail, keepCursor = false) {
  const unique = new Map([...previous?.messages.items ?? [], ...next.messages.items].map((message) => [message.id, message]));
  return {
    thread: next.thread,
    messages: {
      items: [...unique.values()].sort((left, right) => left.seq - right.seq),
      nextCursor: keepCursor && previous ? previous.messages.nextCursor : next.messages.nextCursor,
    },
  };
}

function ConnectedDiscussionDetail({ theme, courseId, threadId, targetMessage, service, close, onThread }: {
  theme: Navigation["theme"];
  courseId?: string;
  threadId: string;
  targetMessage?: string;
  service: TutorSupportClient;
  close: () => void;
  onThread(thread: TutorDiscussThread): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const [data, setData] = useState<TutorDiscussionDetail>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRequest = useRef<AbortController | null>(null);
  const sendRequest = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState(() => service.pendingAnswer?.(threadId)?.body ?? "");
  const [pending, setPending] = useState(() => Boolean(service.pendingAnswer?.(threadId)));
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [readback, setReadback] = useState<string>();

  useEffect(() => () => sendRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError("");
    setUnavailable(false);
    service.discussion(courseId, threadId, undefined, signal, targetMessage)
      .then((result) => { if (!signal.aborted) setData(result); })
      .catch((failure: unknown) => {
        if (signal.aborted) return;
        if (accessEnded(failure)) setUnavailable(true);
        else setError("Pesan gagal dimuat.");
      });
    return () => {
      controller.abort();
      pageRequest.current?.abort();
    };
  }, [service, courseId, threadId, targetMessage, attempt]);

  async function more() {
    if (!data?.messages.nextCursor || loadingMore) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const next = await service.discussion(courseId, threadId, data.messages.nextCursor, controller.signal);
      if (!controller.signal.aborted) setData((previous) => mergeDiscussionMessages(previous, next));
    } catch (error) {
      if (!controller.signal.aborted) {
        if (accessEnded(error)) setUnavailable(true);
        else setError("Pesan berikutnya gagal dimuat.");
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  async function receiveMessage(messageId: string, signal: AbortSignal) {
    try {
      const result = await service.discussion(courseId, threadId, undefined, signal, messageId);
      if (signal.aborted) return;
      setData((previous) => mergeDiscussionMessages(previous, result, true));
      onThread(result.thread);
      setReadback(undefined);
    } catch (error) {
      if (!signal.aborted) {
        if (accessEnded(error)) {
          setReadback(undefined);
          setUnavailable(true);
        } else {
          setReadback(messageId);
        }
      }
    }
  }

  async function sendAnswer() {
    if (!canInteract() || !service.answer || !draft.trim() || sendRequest.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    sendRequest.current = controller;
    setSending(true);
    setSendMessage("");
    try {
      const attempt = service.pendingAnswer?.(threadId) ?? { body: draft.trim(), requestId: randomUUID() };
      const result = await service.answer(courseId, threadId, attempt, signal);
      if (signal.aborted) return;
      setPending(Boolean(service.pendingAnswer?.(threadId)));
      if (result.ok) {
        setDraft("");
        setSendMessage("Jawaban terkirim.");
        await receiveMessage(result.value.messageId, signal);
      } else if (result.error === "replay_unverified") {
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

  async function retryReadback() {
    if (!readback || sendRequest.current) return;
    const controller = new AbortController();
    sendRequest.current = controller;
    try {
      await receiveMessage(readback, controller.signal);
    } finally {
      sendRequest.current = null;
    }
  }

  return <TutorDetail title={data?.thread.title ?? "Diskusi"} theme={theme} onBack={() => { if (!sending) close(); }}
    subtitle={data?.thread.status === "resolved" ? "Terselesaikan" : undefined}
    footer={service.answer && (data?.thread.canReply || pending) && !unavailable ? <View style={tutorLayout.group}>
      {sendMessage ? <Label theme={theme}>{sendMessage}</Label> : null}
      <Input theme={theme} multiline maxLength={12000} accessibilityLabel="Jawaban" placeholder="Tulis jawaban"
        value={draft} onChangeText={setDraft} editable={!sending && !pending} />
      <Button theme={theme} style={tutorLayout.action} disabled={!draft.trim()} isLoading={sending} onPress={sendAnswer}>
        {pending ? "Coba kirim lagi" : "Kirim jawaban"}
      </Button>
    </View> : undefined}>
    {unavailable ? <Empty theme={theme} title="Diskusi tidak tersedia" /> : null}
    {!data && !error && !unavailable ? <ActivityIndicator accessibilityLabel="Memuat pesan" /> : null}
    {!unavailable && data?.messages.items.map((message) => <Row key={message.id} theme={theme} title={message.author ?? "Pengguna"}
      subtitle={message.body} meta={message.attachmentCount ? `${message.attachmentCount} lampiran` : undefined}>
      {message.id === targetMessage ? <Label theme={theme}>Pesan yang dibuka</Label> : null}
    </Row>)}
    {error ? <LoadFailure theme={theme} error={error} retry={data ? more : () => setAttempt((value) => value + 1)} /> : null}
    {data?.messages.nextCursor && !error && !unavailable ? <Button theme={theme} variant="outline" style={tutorLayout.action}
      isLoading={loadingMore} onPress={more}>Tampilkan lebih banyak</Button> : null}
    {readback ? <LoadFailure theme={theme} error="Jawaban belum dapat ditampilkan." retry={retryReadback} /> : null}
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

export function ConnectedVideos({ data, theme, back, playback, videoPlayer }: Navigation & { data: TutorVideosData; playback?: TutorSupportClient["playback"]; videoPlayer?: TutorSupportClient["videoPlayer"] }) {
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
