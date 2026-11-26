import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useContext, useState } from "react";
import { View } from "react-native";
import { DEFAULT_ICON, EMOJI_OPTIONS, LINK_COLORS, LINK_CATEGORY_SUGGESTIONS, isValidHttpUrl } from "../../../../../lib/links";
import type { TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import { ManagementFailure, managementSlug, type DiscussionThread, type LinkFields, type MeetingSpace, type MeetingTranscript, type PublicLink } from "../../../../../packages/native-parity/operations/management-contract";
import { meetingLinks } from "./links";
import { ConnectedDiscussions } from "../../academic/tutor/connected";
import { AdminDiscussionContext } from "./discussion-context";
import { discussionDestination, discussionWorkspaceHref } from "../../../../../packages/native-parity/discussion-destination";
import { Action, Choices, Confirm, Copy, Feedback, Field, Heading, Item, LoadState, Screen, Section, Sections, formatTimestamp, styles, useAction, useDraft, useManagement, useRead, type Confirmation } from "./ui";

const meetAccess = [["OPEN", "Terbuka"], ["TRUSTED", "Organisasi dan undangan"], ["RESTRICTED", "Perlu izin host"]] as const;
export function MeetList() {
  const { navigate, locale, openExternal, share } = useManagement();
  const pages = usePagination();
  const records = useRead("meetings", pages.cursor);
  const directory = useRead("meetingDirectory", undefined);
  const action = useAction();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState<string>();
  const [accessType, setAccess] = useState<typeof meetAccess[number][0]>("OPEN");
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [course, setCourse] = useState("all");
  const [emails, setEmails] = useState<string[]>([]);
  const [active, setActive] = useState<MeetingSpace>();
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const links = active && meetingLinks(active);
  const people = directory.data?.users.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(search.trim().toLowerCase()) && (role === "all" || person.roles.includes(role)) && (course === "all" || person.courseIds.includes(course)));
  function create() {
    setConfirm({ title: "Mulai meeting?", description: emails.length ? `${emails.length} peserta akan diundang.` : "Ruang Google Meet akan dibuat.", label: "Mulai meeting", run: () => action.run({ type: "meet.create", title, slug: slug ?? managementSlug(title), accessType, invitedEmails: emails }, result => {
      setActive(result.space); setTitle(""); setSlug(undefined); setEmails([]); setPicker(false);
    }, result => result.warningCount ? `Ruang dibuat. ${result.warningCount} akun belum mendapat hak Meet.` : "Ruang dibuat.") });
  }
  return <Screen title="Meet">
    <Section title="Buat meeting baru">
      <Field label="Judul meeting (opsional)" value={title} onChangeText={setTitle} />
      <Field label="Slug tautan" value={slug ?? managementSlug(title)} onChangeText={setSlug} autoCapitalize="none" />
      <Copy strong>Aksesibilitas</Copy><Choices values={meetAccess} current={accessType} onChange={setAccess} />
      <View style={styles.row}><Action onPress={() => setPicker(!picker)}>{`Undang peserta (${emails.length})`}</Action>
        <Action variant="default" disabled={Boolean(active)} busy={action.busy} onPress={create}>Mulai meeting</Action>
      </View>
      {picker && <Section title="Pilih peserta">
        <Field label="Cari nama atau email" value={search} onChangeText={setSearch} />
        <Choices values={[["all", "Semua peran"], ["admin", "Admin"], ["tutor", "Tutor"], ["student", "Murid"]]} current={role} onChange={setRole} />
        <Choices values={[["all", "Semua mata kuliah"], ...(directory.data?.courses ?? []).map(item => [item.id, item.title] as const)]} current={course} onChange={setCourse} />
        <LoadState {...directory} retry={directory.reload} />
        {people?.length === 0 && <Copy muted>Tidak ada peserta yang cocok.</Copy>}
        {people?.map(person => <Item key={person.id} title={person.name} meta={person.email} actions={<Action selected={emails.includes(person.email)} onPress={() => setEmails(emails.includes(person.email) ? emails.filter(email => email !== person.email) : [...emails, person.email])}>{emails.includes(person.email) ? "Hapus dari undangan" : "Pilih peserta"}</Action>} />)}
        <Action onPress={() => setPicker(false)}>Selesai</Action>
      </Section>}
    </Section>
    <Feedback {...action} />
    <Section title="Status meeting">
      {active && links ? <Item title={active.title} meta={`Aktif · ${active.meetingCode}`} actions={<>
        {links.host && openExternal && <Action onPress={() => links.host && openExternal(links.host)}>
          {locale === "id" ? "Buka sebagai host" : "Open as host"}
        </Action>}
        {links.short && share && <Action onPress={() => links.short && share(links.short, active.title)}>
          {locale === "id" ? `Bagikan ${links.short}` : `Share ${links.short}`}
        </Action>}
        {links.publicUrl && share && <Action onPress={() => links.publicUrl && share(links.publicUrl, active.title)}>
          {locale === "id" ? "Bagikan tautan Meet" : "Share Meet link"}
        </Action>}
        <Action variant="destructive" disabled={action.busy} onPress={() => setConfirm({ title: "Akhiri meeting?", description: `${active.title} akan diakhiri.`, label: "Akhiri meeting", danger: true, run: () => void action.run({ type: "meet.end", spaceName: active.name }, () => { setActive(undefined); records.reload(); }) })}>Akhiri meeting</Action>
      </>} /> : <Copy muted>Belum ada sesi meeting aktif.</Copy>}
    </Section>
    <Section title="Riwayat meeting">
      <View style={styles.row}><Action onPress={records.reload}>Muat ulang</Action></View>
      <LoadState {...records} retry={records.reload} />
      {records.data?.items.length === 0 && <Copy muted>Belum ada riwayat meeting.</Copy>}
      {records.data?.items.map(record => <Item key={record.id} title={record.title} meta={`${formatTimestamp(record.startTime, locale)}${record.participantCount === undefined ? "" : ` · ${record.participantCount} peserta`}`}
        onPress={() => navigate(`/admin/meet/${encodeURIComponent(record.id)}`)} actions={<Action variant="destructive" disabled={action.busy} onPress={() => setConfirm({ title: "Hapus log meeting?", description: `${record.title} akan dihapus dari daftar riwayat.`, label: "Hapus log", danger: true, run: () => void action.run({ type: "meet.delete", id: record.id }, records.reload, "Log meeting dihapus.") })}>Hapus log</Action>} />)}
      <Pagination {...pages} next={records.data?.nextCursor} />
    </Section>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}

export function MeetDetails({ id }: { id: string }) {
  const { navigate, locale, openExternal } = useManagement();
  const { canInteract } = useProtectedInteraction();
  const read = useRead("meeting", id);
  const action = useAction();
  const [driveConsent, setDriveConsent] = useState<Confirmation | null>(null);
  const meeting = read.data;
  const en = locale === "en";
  const syncLabel = en ? "Sync Drive access" : "Sinkronkan akses Drive";

  function syncDrive() {
    if (!meeting?.driveSyncEnabled || action.busy || !canInteract()) return;
    setDriveConsent({
      title: en ? "Sync this meeting’s Drive access?" : "Sinkronkan akses Drive meeting ini?",
      description: en ? "Active Admins will receive editor access to this meeting’s recordings and transcripts."
        : "Admin aktif akan mendapat akses editor ke rekaman dan transkrip meeting ini.",
      label: syncLabel,
      run: () => {
        if (!canInteract()) return;
        void action.run({ type: "meet.sync-drive", id }, undefined, ({ meetDriveSync }) => {
          if (!meetDriveSync || meetDriveSync.status === "incomplete") {
            return en ? "Drive access is partly synchronized. Retry to check and finish remaining files."
              : "Sinkronisasi akses Drive belum selesai. Coba lagi untuk memeriksa dan menyelesaikannya.";
          }
          if (!meetDriveSync.synchronized) return en ? "No Drive files are available yet." : "Berkas Drive belum tersedia.";
          return en ? `Drive access verified for ${meetDriveSync.synchronized} files.` : `Akses Drive terverifikasi untuk ${meetDriveSync.synchronized} berkas.`;
        });
      },
    });
  }
  return <Screen title="Detail log meeting" back={{ label: "Meet", run: () => navigate("/admin/meet") }} actions={<Action onPress={read.reload}>Muat ulang</Action>}>
    <LoadState {...read} retry={read.reload} />
    {meeting && <>
      <Section title={meeting.title}>
        <Copy muted>{formatTimestamp(meeting.startTime, locale)}</Copy>
        <Copy>{`${Math.floor(meeting.totalDurationSeconds / 60)} menit · ${meeting.participantCount ?? meeting.participants.length} peserta · Puncak ${meeting.peakConcurrentParticipants ?? 0}`}</Copy>
        <Copy>{`${meeting.recordings.length} rekaman · ${meeting.transcripts.reduce((total, transcript) => total + transcript.lines, 0)}${meeting.transcripts.some(transcript => transcript.firstPage?.nextCursor) ? "+" : ""} baris transkrip`}</Copy>
      </Section>
      <Section title="Kehadiran peserta">
        {!meeting.participants.length && <Copy muted>Belum ada peserta.</Copy>}
        {meeting.participants.map(person => <Item key={person.id} title={person.name} meta={`${person.userType} · ${Math.round(person.totalDurationSeconds / 60)} menit`} actions={<View style={styles.field}>{person.sessions.map((session, index) => <Copy key={index}>{`Masuk ${formatTimestamp(session.startTime, locale)} · Keluar ${formatTimestamp(session.endTime, locale)}`}</Copy>)}</View>} />)}
      </Section>
      <Section title="Rekaman">
        {meeting.driveSyncEnabled && <View style={styles.field}>
          <View style={styles.row}><Action onPress={syncDrive} busy={action.busy} testID="admin-meet-sync-drive">{syncLabel}</Action></View>
          <Feedback {...action} />
          <Confirm value={driveConsent} onClose={() => setDriveConsent(null)} />
        </View>}
        {!meeting.recordings.length && <Copy muted>Belum ada rekaman.</Copy>}
        {meeting.recordings.map(recording => <Item key={recording.id} title="Rekaman" meta={formatTimestamp(recording.startTime, locale)} onPress={recording.url && openExternal ? () => openExternal(recording.url!) : undefined} />)}
      </Section>
      <Section title="Transkrip">
        {!meeting.transcripts.length && <Copy muted>Belum ada transkrip.</Copy>}
        {meeting.transcripts.map(transcript => <TranscriptSection key={`${id}/${transcript.id}`} recordId={id} transcript={transcript}
          speakers={meeting.participants} />)}
      </Section>
    </>}
  </Screen>;
}

function TranscriptSection({ recordId, transcript, speakers }: { recordId: string; transcript: MeetingTranscript; speakers: { id: string; name: string }[] }) {
  const { locale, openExternal } = useManagement();
  const en = locale === "en";
  const [expanded, setExpanded] = useState(false);
  const pages = usePagination();
  const read = useRead("transcript", { id: recordId, transcript: transcript.id, cursor: pages.cursor ?? "" }, expanded && Boolean(pages.cursor));
  const page = pages.cursor ? read.data : transcript.firstPage;
  const speakerNames = new Map(speakers.map(person => [person.id, person.name]));
  const documentUrl = transcript.documentUrl;
  const hasDocument = documentUrl && /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+(?:[/?#]|$)/.test(documentUrl);
  return <View style={styles.field}>
    {transcript.startTime && <Copy strong>{formatTimestamp(transcript.startTime, locale)}</Copy>}
    <View style={styles.row}>
      {transcript.firstPage ? <Action selected={expanded} onPress={() => setExpanded(!expanded)}>{expanded ? (en ? "Hide transcript" : "Tutup transkrip") : (en ? "Read transcript" : "Baca transkrip")}</Action> : <Copy>{`${transcript.lines} ${en ? "lines" : "baris"}`}</Copy>}
      {hasDocument && openExternal && <Action onPress={() => openExternal(documentUrl)}>{en ? "Open Google Docs" : "Buka Google Docs"}</Action>}
    </View>
    {expanded && <>
      {pages.cursor && <LoadState {...read} retry={read.reload} />}
      {page && !page.items.length && <Copy muted>{en ? "No transcript text yet." : "Belum ada teks transkrip."}</Copy>}
      {page?.items.map(entry => <View key={entry.id} style={styles.field}>
        <Copy muted>{`${speakerNames.get(entry.speakerId) || (en ? "Participant" : "Peserta")} · ${formatTimestamp(entry.startTime, locale)}`}</Copy>
        <Copy>{entry.text}</Copy>
      </View>)}
      <Pagination {...pages} next={page?.nextCursor} />
    </>}
  </View>;
}

export function Discussions({ searchParams }: { searchParams: URLSearchParams }) {
  const service = useContext(AdminDiscussionContext);
  return service ? <LiveAdminDiscussions searchParams={searchParams} service={service} /> : <LegacyDiscussions searchParams={searchParams} />;
}

function LiveAdminDiscussions({ searchParams, service }: {
  searchParams: URLSearchParams; service: TutorSupportClient;
}) {
  const { navigate, locale, theme } = useManagement();
  const [reportTarget, setReportTarget] = useState<{ thread: string; message: string }>();
  const reports = searchParams.get("discussionTab") === "reports";
  const target = discussionDestination(searchParams);
  const active = target ?? reportTarget;
  const pages = usePagination();
  const path = "/admin/discussions";
  const en = locale === "en";
  useStaffChromeVisibility({ hideTop: Boolean(active), hideBottom: Boolean(active) });
  const header = <Sections values={[["questions", en ? "Questions" : "Pertanyaan"], ["reports", en ? "Reports" : "Laporan"]]}
    current={reports ? "reports" : "questions"} onChange={next => {
      const href = new URL(discussionWorkspaceHref(path, searchParams), "https://zyx.invalid");
      if (next === "reports") href.searchParams.set("discussionTab", "reports");
      else href.searchParams.delete("discussionTab");
      navigate(href.pathname + href.search);
    }} />;
  if (reports && !active) return <Screen title={en ? "Discussions" : "Diskusi"}>
    {header}<DiscussionReports open={setReportTarget} pages={pages} />
  </Screen>;
  const query = new URLSearchParams(searchParams);
  if (active) {
    query.set("thread", active.thread);
    if (active.message) query.set("message", active.message);
    else query.delete("message");
  }
  return <ConnectedDiscussions key={active?.thread ?? "questions"} query={Object.fromEntries(query)} {...{ navigate, header, theme, service }} workspacePath={path}
    back={() => navigate("/admin")}
    replace={href => {
      if (reportTarget && !target) setReportTarget(undefined);
      else navigate(href);
    }} />;
}

function LegacyDiscussions({ searchParams }: { searchParams: URLSearchParams }) {
  const { navigate, locale } = useManagement();
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [selected, setSelected] = useState<{ thread: string; message?: string }>();
  const reportsOpen = searchParams.get("discussionTab") === "reports";
  const target = reportsOpen ? null : discussionDestination(searchParams);
  const active = target ?? selected;
  const pages = usePagination();
  const reportPages = usePagination();
  const threads = useRead("discussions", { cursor: pages.cursor, search: search.trim(), status: filter === "all" ? undefined : filter }, !reportsOpen);
  const matching = threads.data?.items;
  useStaffChromeVisibility({ hideTop: Boolean(active), hideBottom: Boolean(active) });

  const href = () => discussionWorkspaceHref("/admin/discussions", searchParams);
  if (active) return <DiscussionDetail key={active.thread} threadId={active.thread} targetMessage={active.message}
    summary={matching?.find(item => item.id === active.thread)} reload={threads.reload}
    onBack={() => { if (target) navigate(href()); else setSelected(undefined); }} />;
  const changeTab = (tab: "questions" | "reports") => {
    const next = new URL(href(), "https://zyx.invalid");
    if (tab === "reports") next.searchParams.set("discussionTab", "reports");
    else next.searchParams.delete("discussionTab");
    navigate(next.pathname + next.search);
  };
  return <Screen title={en ? "Discussions" : "Diskusi"}>
    <Sections values={[["questions", en ? "Questions" : "Pertanyaan"], ["reports", en ? "Reports" : "Laporan"]]}
      current={reportsOpen ? "reports" : "questions"} onChange={changeTab} />
    {reportsOpen ? <DiscussionReports open={setSelected} pages={reportPages} /> : <>
      {(searchParams.has("thread") || searchParams.has("message")) && !target && <Copy status="error">{en ? "Invalid discussion link." : "Tautan diskusi tidak valid."}</Copy>}
      <Field label="Cari diskusi" value={search} onChangeText={next => { setSearch(next); pages.reset(); }} />
      <Choices current={filter} values={[["all", "Semua"], ["open", "Terbuka"], ["resolved", "Selesai"]]} onChange={next => { setFilter(next); pages.reset(); }} />
      <LoadState {...threads} retry={threads.reload} />
      {matching && <Section>
        {!matching.length && <Copy muted>Belum ada diskusi yang sesuai.</Copy>}
        {matching.map(item => <Item key={item.id} title={item.title} meta={`${item.channel} · ${item.messageCount} jawaban`} onPress={() => setSelected({ thread: item.id })} />)}
        <Pagination {...pages} next={threads.data?.nextCursor} />
      </Section>}
    </>}
  </Screen>;
}

function DiscussionReports({ open, pages }: {
  open(target: { thread: string; message: string }): void; pages: ReturnType<typeof usePagination>;
}) {
  const { locale } = useManagement();
  const en = locale === "en";
  const action = useAction();
  const reports = useRead("discussionReports", { cursor: pages.cursor });
  const status = { pending: en ? "Pending" : "Menunggu", resolved: en ? "Resolved" : "Selesai", dismissed: en ? "Dismissed" : "Ditolak" };
  return <>
    <LoadState {...reports} retry={reports.reload} />
    <Feedback {...action} />
    {action.error ? <Action onPress={reports.reload}>{en ? "Reload reports" : "Muat ulang laporan"}</Action> : null}
    {reports.data && <Section>
      {!reports.data.items.length && <Copy muted>{en ? "No reports yet." : "Belum ada laporan."}</Copy>}
      {reports.data.items.map(report => <Item key={report.id} title={report.title}
        meta={[status[report.status], report.reporterName, report.reason, report.createdAt && formatTimestamp(report.createdAt, locale)].filter(Boolean).join(" · ")}
        onPress={() => open({ thread: report.threadId, message: report.messageId })}
        actions={report.status === "pending" ? <View style={styles.row}>
          <Action busy={action.busy} onPress={() => action.run({ type: "discussion.moderate-report", id: report.id, status: "resolved" },
            reports.reload, en ? "Report resolved." : "Laporan diselesaikan.")}>{en ? "Resolve" : "Selesaikan"}</Action>
          <Action busy={action.busy} onPress={() => action.run({ type: "discussion.moderate-report", id: report.id, status: "dismissed" },
            reports.reload, en ? "Report dismissed." : "Laporan ditolak.")}>{en ? "Dismiss" : "Tolak"}</Action>
        </View> : undefined} />)}
      <Pagination {...pages} next={reports.data.nextCursor} />
    </Section>}
  </>;
}

function usePagination() {
  const [stack, setStack] = useState<string[]>([]);
  return {
    cursor: stack.at(-1),
    back: () => setStack(previous => previous.slice(0, -1)),
    advance: (cursor: string) => setStack(previous => [...previous, cursor]),
    reset: () => setStack([]),
  };
}

function Pagination({ cursor, back, advance, next }: Pick<ReturnType<typeof usePagination>, "cursor" | "back" | "advance"> & { next?: string }) {
  if (!cursor && !next) return null;
  return <View style={styles.row}>
    {cursor && <Action onPress={back}>Sebelumnya</Action>}
    {next && <Action onPress={() => advance(next)}>Berikutnya</Action>}
  </View>;
}

function DiscussionDetail({ threadId, targetMessage, summary, onBack, reload }: {
  threadId: string; targetMessage?: string; summary?: DiscussionThread; onBack(): void; reload(): void;
}) {
  const pages = usePagination();
  const messages = useRead("discussion", { id: threadId, cursor: pages.cursor, message: pages.cursor ? undefined : targetMessage });
  const thread = messages.data?.thread ?? summary;
  const action = useAction();
  const draft = useDraft(`discussion:${threadId}`, "");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [resolvedOverride, setResolved] = useState<boolean>();
  const resolved = resolvedOverride ?? thread?.status === "resolved";
  const { locale } = useManagement();
  const en = locale === "en";
  const close = () => { reload(); onBack(); };
  const previousCursor = messages.data?.previousCursor;
  return <Screen title={thread?.title ?? (en ? "Discussion" : "Diskusi")} description={thread?.channel}
    back={{ label: en ? "Discussions" : "Diskusi", run: close }}>
    <LoadState {...messages} retry={messages.reload} />
    <Feedback {...action} />
    {messages.data && thread && <>
      {thread.canResolve !== false && <View style={styles.row}><Action busy={action.busy} onPress={() => action.run({ type: "discussion.resolve", id: thread.id, resolved: !resolved }, () => setResolved(!resolved))}>{resolved ? "Buka kembali" : "Tandai selesai"}</Action></View>}
      <Section>{messages.data.items.map(message => <Item key={message.id} title={message.author}
        meta={message.body} actions={message.id === targetMessage ? <Copy muted>{en ? "Selected message" : "Pesan yang dibuka"}</Copy> : undefined} />)}
        {!pages.cursor && previousCursor && <Action onPress={() => pages.advance(previousCursor)}>
          {en ? "Earlier messages" : "Pesan sebelumnya"}</Action>}
        <Pagination {...pages} next={messages.data.nextCursor} />
        {messages.data.observationReceipt && messages.data.items.some(message => message.seq > (messages.data?.throughSeq ?? 0)) && <Action disabled={action.busy} onPress={() => {
          const page = messages.data;
          if (!page?.observationReceipt) return;
          const previous = page.throughSeq ?? 0;
          const first = page.items.reduce((minimum, message) => Math.min(minimum, message.seq), Number.POSITIVE_INFINITY);
          const throughSeq = first <= previous + 1 ? Math.max(previous, ...page.items.map(message => message.seq)) : previous;
          void action.run({ type: "discussion.read", id: thread.id, throughSeq, observationReceipt: page.observationReceipt, messageIds: page.items.map(message => message.id) }, messages.reload, "Pesan ditandai sudah dibaca.");
        }}>Tandai halaman dibaca</Action>}
      </Section>
      {!resolved && thread.canReply !== false && <Section title="Balasan">
        <Field label="Tulis balasan" value={draft.value} onChangeText={draft.change} multiline />
        <Action variant="default" busy={action.busy} disabled={!draft.value.trim()} onPress={() => setConfirm({ title: "Kirim balasan?", description: "Balasan akan tampil di diskusi.", label: "Kirim", run: () => action.run({ type: "discussion.reply", id: thread.id, body: draft.value }, () => { draft.change(""); draft.clear(); messages.reload(); }, "Balasan terkirim.") })}>Kirim balasan</Action>
      </Section>}
      <Confirm value={confirm} onClose={() => setConfirm(null)} />
    </>}
  </Screen>;
}

const newLink: LinkFields = { title: "", url: "", description: "", category: "", icon: DEFAULT_ICON, color: "neutral", isActive: true };
export function ImportantLinks() {
  const { openExternal } = useManagement();
  const read = useRead("links", undefined);
  const action = useAction();
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<{ id?: string; fields: LinkFields } | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const sections = [...new Set(read.data?.map(link => link.category).filter(Boolean))];
  const listed = read.data?.filter(link => !filter || link.category === filter);
  const update = <K extends keyof LinkFields>(key: K, next: LinkFields[K]) => { if (edit) setEdit({ ...edit, fields: { ...edit.fields, [key]: next } }); };

  function submit() {
    if (!edit) return;
    if (!edit.fields.title.trim() || !isValidHttpUrl(edit.fields.url.trim())) return action.setError(new ManagementFailure("invalid", "Isi judul serta URL HTTP atau HTTPS yang valid."));
    void action.run({ type: "link.save", ...edit }, () => { setEdit(null); read.reload(); });
  }
  const askRemoval = (link: PublicLink) => setConfirm({ title: "Hapus tautan?", description: `Tautan ${link.title} akan dihapus dari daftar.`, label: "Hapus tautan", danger: true, run: () => void action.run({ type: "link.delete", id: link.id }, read.reload, "Tautan dihapus.") });
  return <Screen title="Tautan penting" actions={<Action variant="default" onPress={() => setEdit({ fields: newLink })}>Tambah tautan</Action>}>
    <Feedback {...action} />
    {edit && <Section title={edit.id ? "Sunting tautan" : "Tambah tautan"}>
      <Field label="Judul" value={edit.fields.title} onChangeText={next => update("title", next)} />
      <Field label="URL" value={edit.fields.url} onChangeText={next => update("url", next)} keyboardType="url" autoCapitalize="none" />
      <Field label="Deskripsi" value={edit.fields.description} onChangeText={next => update("description", next)} multiline />
      <Field label="Kategori" value={edit.fields.category} onChangeText={next => update("category", next)} />
      <Choices current={edit.fields.category} values={LINK_CATEGORY_SUGGESTIONS.map(category => [category, category] as const)} onChange={next => update("category", next)} />
      <Heading>Ikon</Heading><Choices current={edit.fields.icon} values={EMOJI_OPTIONS.map(icon => [icon, icon] as const)} onChange={next => update("icon", next)} />
      <Heading>Warna</Heading><Choices current={edit.fields.color} values={LINK_COLORS.map(color => [color.key, color.label] as const)} onChange={next => update("color", next)} />
      <Heading>Status</Heading><Choices current={edit.fields.isActive ? "active" : "inactive"} values={[["active", "Aktif"], ["inactive", "Nonaktif"]]} onChange={next => update("isActive", next === "active")} />
      <View style={styles.row}><Action onPress={() => setEdit(null)}>Batal</Action><Action busy={action.busy} variant="default" onPress={submit}>Simpan</Action></View>
    </Section>}
    <Choices current={filter} values={[["", "Semua kategori"], ...sections.map(category => [category, category] as const)]} onChange={setFilter} />
    <LoadState {...read} retry={read.reload} />
    {listed && <Section>
      {!listed.length && <Copy muted>Belum ada tautan yang sesuai.</Copy>}
      {listed.map(link => {
        const index = read.data?.findIndex(item => item.id === link.id) ?? -1;
        const neighbors = [read.data?.[index - 1], read.data?.[index + 1]];
        return <Item key={link.id} title={`${link.icon} ${link.title}`} meta={`${link.category || "Lainnya"} · ${link.isActive ? "Aktif" : "Nonaktif"} · ${link.url}`} onPress={openExternal && isValidHttpUrl(link.url) ? () => openExternal(link.url) : undefined} actions={<>
          <Action onPress={() => { const { id, sortOrder: _order, ...fields } = link; setEdit({ id, fields }); }}>Sunting</Action>
          <Action disabled={action.busy} onPress={() => action.run({ type: "link.toggle", id: link.id, isActive: !link.isActive }, read.reload)}>{link.isActive ? "Nonaktifkan" : "Aktifkan"}</Action>
          {neighbors.map((neighbor, order) => neighbor && <Action key={neighbor.id} disabled={action.busy} onPress={() => action.run({ type: "link.move", id: link.id, sortOrder: neighbor.sortOrder, direction: order === 0 ? "up" : "down" }, read.reload)}>{order === 0 ? "Naik" : "Turun"}</Action>)}
          <Action variant="destructive" disabled={action.busy} onPress={() => askRemoval(link)}>Hapus</Action>
        </>} />;
      })}
    </Section>}
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}
