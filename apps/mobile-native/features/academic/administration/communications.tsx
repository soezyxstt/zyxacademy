import { useState } from "react";
import { View } from "react-native";
import {
  fixtureClock, type Announcement, type Broadcast, type BroadcastFields, type PkaSession, type PkaSessionFields,
} from "../../../../../packages/native-parity/academic/administration/fixtures";
import { getBroadcastAudience, validateBroadcast } from "../../../../../packages/native-parity/academic/administration/store";
import { pkaAnnouncementBodyLimit, pkaAnnouncementTitleLimit } from "../../../../../packages/academic/pka-announcement-edit";
import type { AcademicScreenProps } from "../contracts";
import { useAdministrationSnapshot, useAdministrationStore } from "./provider";
import {
  Action, CourseDialog, DataRow, Field, Ink, PagedRows, Picker, SaveButtons, SearchBox, Subheading, Tabs, TimeFields,
  combineDateTime, courseName, courseOptions, dateLabel, dateTimeLabel, idAndRevision, layout, matchWords,
  normalSearch, splitDateTime, useAdministrationMutation,
} from "./ui";

const targetOptions = [
  { id: "all", label: "Semua pengguna" }, { id: "course", label: "Mata kuliah" }, { id: "user", label: "Pengguna tertentu" },
] as const;
const notificationTabs = [{ id: "compose", label: "Tulis pesan" }, { id: "history", label: "Riwayat" }] as const;
const initialBroadcast: BroadcastFields = { title: "", body: "", link: "", target: "all", targetId: "" };

export function AdministrationNotifications({ query, replace }: Pick<AcademicScreenProps, "query" | "replace">) {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const tab = query.tab === "history" ? "history" : "compose";
  const [draft, setDraft] = useState<BroadcastFields>(initialBroadcast);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Broadcast>();
  const users = records.users.map((entry) => ({ id: entry.id, label: `${entry.name} · ${entry.email}` }));
  const audience = (entry: BroadcastFields) => entry.target === "all" ? "Semua pengguna" : entry.target === "course" ? courseName(entry.targetId)
    : records.users.find((user) => user.id === entry.targetId)?.name ?? "Pengguna";
  function setField<K extends keyof BroadcastFields>(field: K, value: BroadcastFields[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  }
  function send() {
    const message = validateBroadcast(records, draft);
    if (message) { setError(message); return; }
    const count = getBroadcastAudience(records, draft);
    mutation.run({ type: "broadcast.send", fields: draft }, {
      title: "Kirim notifikasi?", description: `${draft.title.trim()} · ${audience(draft)} · ${count} penerima`,
      confirmLabel: "Kirim notifikasi", success: `Notifikasi tercatat untuk ${count} penerima.`,
      after: () => { setDraft(initialBroadcast); replace("/admin/notifications?tab=history"); },
    });
  }
  return <>
    <Tabs options={notificationTabs} selected={tab} onSelect={(id) => replace(`/admin/notifications?tab=${id}`)} testID="academic-notifications-tab" />
    {mutation.feedback}
    {tab === "compose" ? <>
      <Picker label="Penerima" options={targetOptions} selected={draft.target} onSelect={(id) => {
        setDraft((current) => ({ ...current, target: id as BroadcastFields["target"], targetId: "" }));
        setError("");
      }} />
      {draft.target === "course" ? <Picker label="Pilih mata kuliah" options={courseOptions} selected={draft.targetId} onSelect={(id) => setField("targetId", id)} /> : null}
      {draft.target === "user" ? <Picker label="Pilih pengguna" options={users} selected={draft.targetId} onSelect={(id) => setField("targetId", id)} /> : null}
      <Field label="Judul notifikasi" value={draft.title} onChangeText={(text) => setField("title", text)} maxLength={100} testID="academic-broadcast-title" />
      <Field label="Isi notifikasi" value={draft.body} onChangeText={(text) => setField("body", text)} maxLength={500} multiline testID="academic-broadcast-message" />
      <Field label="Tautan internal" placeholder="/dashboard" value={draft.link} onChangeText={(text) => setField("link", text)} autoCapitalize="none" />
      {draft.title.trim() || draft.body.trim() ? <Subheading title="Pratinjau notifikasi">
        {draft.title.trim() ? <Ink kind="strong">{draft.title.trim()}</Ink> : null}
        {draft.body.trim() ? <Ink>{draft.body.trim()}</Ink> : null}
        <Ink kind="meta" tone="muted">{`${audience(draft)} · ${getBroadcastAudience(records, draft)} penerima`}</Ink>
      </Subheading> : null}
      {error ? <View accessibilityLiveRegion="assertive"><Ink tone="error">{error}</Ink></View> : null}
      <View style={layout.row}><Action label="Kirim notifikasi" variation="default" onPress={send} disabled={mutation.blocked} testID="academic-broadcast-send" /></View>
    </> : <PagedRows rows={records.broadcasts} empty="Belum ada notifikasi yang dikirim." render={(entry) =>
      <DataRow key={entry.id} title={entry.title} description={`${audience(entry)} · ${dateTimeLabel(entry.createdAt)}`}
        detail={`${entry.succeeded}/${entry.attempted} terkirim`} onPress={() => setDetail(entry)} />} />}
    {detail ? <CourseDialog title={detail.title} onClose={() => setDetail(undefined)}>
      <Ink>{detail.body}</Ink>
      <Ink>{`${audience(detail)} · ${detail.attempted} penerima · ${detail.failed} gagal`}</Ink>
      <Ink kind="meta" tone="muted">{`${detail.link} · ${dateTimeLabel(detail.createdAt)}`}</Ink>
    </CourseDialog> : null}
  </>;
}

const pkaTabs = [
  { id: "registrations", label: "Pendaftaran" }, { id: "announcements", label: "Pengumuman" }, { id: "schedules", label: "Jadwal" },
] as const;
type PkaTab = (typeof pkaTabs)[number]["id"];

export function AdministrationPka({ tab, navigate }: { tab: PkaTab; navigate(path: string): void }) {
  return <>
    <Tabs options={pkaTabs} selected={tab} testID="academic-pka-tab"
      onSelect={(next) => { if (next !== tab) navigate(`/admin/tutorial-pka/${next}`); }} />
    {tab === "registrations" ? <Registrations /> : tab === "announcements" ? <Announcements /> : <Sessions />}
  </>;
}

function Registrations() {
  const { records } = useAdministrationSnapshot();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("");
  const [showProof, setShowProof] = useState(false);
  const selected = records.registrations.find((entry) => entry.id === selection);
  const visible = records.registrations.filter((entry) => matchWords(normalSearch(query), [entry.fullName, entry.email, entry.faculty, entry.instagram]));
  return <>
    <SearchBox label="Cari nama, email, fakultas, atau Instagram" value={query} onChange={setQuery} testID="academic-pka-registration-search" />
    <PagedRows key={query} rows={visible} empty="Belum ada pendaftaran PKA." filtered={Boolean(query)} render={(entry) =>
      <DataRow key={entry.id} title={entry.fullName} description={`${entry.faculty} · ${entry.email}`}
        detail={dateLabel(entry.createdAt)} onPress={() => { setSelection(entry.id); setShowProof(false); }} />} />
    {selected ? <CourseDialog title={selected.fullName} onClose={() => setSelection("")}>
      <Ink>{`${selected.faculty} · ${selected.email}`}</Ink>
      <Ink>{`@${selected.instagram}`}</Ink>
      <Ink>{selected.announcements ? "Menerima pengumuman" : "Pengumuman dinonaktifkan"}</Ink>
      <Ink kind="meta" tone="muted">{`Terdaftar ${dateLabel(selected.createdAt)}`}</Ink>
      <Action label={showProof ? "Tutup bukti" : "Lihat bukti"} onPress={() => setShowProof(!showProof)} testID="academic-pka-registration-proof" />
      {showProof ? <Subheading title="Bukti mengikuti akun">
        {selected.proof === "available" ? <Ink>{`@${selected.instagram} · Mengikuti Zyx Academy`}</Ink> :
          <Ink tone="error">Bukti belum tersedia. Minta pendaftar mengunggah ulang.</Ink>}
      </Subheading> : null}
    </CourseDialog> : null}
  </>;
}

function Announcements() {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const [editing, setEditing] = useState<Announcement | "new">();
  const [selected, setSelected] = useState("");
  const [archived, setArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const announcement = records.announcements.find((entry) => entry.id === selected);
  const rows = records.announcements.filter((entry) => entry.archived === archived).sort((left, right) => Number(right.pinned) - Number(left.pinned));
  function edit(next: Announcement | "new") {
    setSelected("");
    setEditing(next);
    setTitle(next === "new" ? "" : next.title);
    setBody(next === "new" ? "" : next.body);
  }
  return <>
    <View style={layout.row}><Action label="Buat pengumuman" variation="default" onPress={() => edit("new")} testID="academic-pka-announcement-create" /></View>
    {mutation.feedback}
    {editing ? <Subheading title={editing === "new" ? "Pengumuman baru" : "Edit pengumuman"}>
      <Field label="Judul pengumuman" value={title} onChangeText={setTitle} maxLength={pkaAnnouncementTitleLimit} />
      <Field label="Isi pengumuman" value={body} onChangeText={setBody} maxLength={pkaAnnouncementBodyLimit} multiline />
      <SaveButtons saveLabel={editing === "new" ? "Kirim pengumuman" : "Simpan"} busy={mutation.blocked}
        onCancel={() => setEditing(undefined)} onSave={() => {
          const initial = editing === "new" ? undefined : editing;
          const delivery = !initial && title.trim() && body.trim() ? {
            title: "Kirim pengumuman PKA?", description: `${title.trim()} · ${records.registrations.length} peserta`, confirmLabel: "Kirim pengumuman",
          } : {};
          mutation.run({ type: "pka.announcement.save", ...idAndRevision(initial), fields: { title, body } }, {
            ...delivery, success: initial ? "Pengumuman diperbarui." : "Pengumuman tercatat di riwayat.", after: () => setEditing(undefined),
          });
        }} />
    </Subheading> : null}
    <View style={layout.row}>
      <Action label="Aktif" selected={!archived} onPress={() => setArchived(false)} />
      <Action label="Arsip" selected={archived} onPress={() => setArchived(true)} />
    </View>
    <PagedRows key={archived ? "archive" : "current"} rows={rows} empty={archived ? "Belum ada pengumuman di arsip." : "Belum ada pengumuman aktif."}
      render={(entry) => <DataRow key={entry.id} title={entry.title} description={`${dateLabel(entry.sentAt)} · ${entry.recipients} penerima`}
        detail={entry.pinned ? "Disematkan" : undefined} onPress={() => setSelected(entry.id)} />} />
    {announcement ? <CourseDialog title={announcement.title} onClose={() => setSelected("")}>
      <Ink>{announcement.body}</Ink>
      <View style={layout.row}>
        <Action label="Edit" onPress={() => edit(announcement)} />
        {!announcement.archived ? <Action label={announcement.pinned ? "Lepas sematan" : "Sematkan"} onPress={() => {
          setSelected("");
          mutation.run({ type: "pka.announcement.pin", id: announcement.id, revision: announcement.revision },
            { success: announcement.pinned ? "Sematan dilepas." : "Pengumuman disematkan." });
        }} /> : null}
        <Action label={announcement.archived ? "Pulihkan" : "Arsipkan"} onPress={() => {
          setSelected("");
          mutation.run({ type: "pka.announcement.archive", id: announcement.id, revision: announcement.revision },
            { title: announcement.archived ? "Pulihkan pengumuman?" : "Arsipkan pengumuman?",
              description: announcement.title, confirmLabel: announcement.archived ? "Pulihkan" : "Arsipkan",
              success: announcement.archived ? "Pengumuman dipulihkan." : "Pengumuman diarsipkan." });
        }} />
      </View>
    </CourseDialog> : null}
  </>;
}

const future = (date: string) => Date.parse(date) > Date.parse(fixtureClock);
const sessionsTabs = [{ id: "all", label: "Semua sesi" }, { id: "upcoming", label: "Akan datang" }, { id: "past", label: "Riwayat" }] as const;

function SessionForm({ initial, save, cancel, busy }: {
  initial?: PkaSession; save(fields: PkaSessionFields): void; cancel(): void; busy: boolean;
}) {
  const current = splitDateTime(initial?.sessionAt ?? fixtureClock);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(initial ? current.time : "");
  const [meetLink, setMeetLink] = useState(initial?.meetLink ?? "");
  const at = combineDateTime(date, time);
  const informs = future(at) && (!initial || Boolean(meetLink.trim() && initial.meetLink !== meetLink.trim()));
  return <Subheading title={initial ? "Edit jadwal PKA" : "Buat jadwal PKA"}>
    <Field label="Judul sesi" value={title} onChangeText={setTitle} testID="academic-pka-session-title" />
    <TimeFields label="sesi" date={date} time={time} setDate={setDate} setTime={setTime} />
    <Field label="Tautan Meet (opsional)" value={meetLink} onChangeText={setMeetLink} autoCapitalize="none" keyboardType="url" />
    {informs ? <Ink kind="meta" tone="muted">Peserta akan menerima pemberitahuan.</Ink> : null}
    <SaveButtons busy={busy} onSave={() => save({ title, sessionAt: at, meetLink })} onCancel={cancel} />
  </Subheading>;
}

function Sessions() {
  const { records } = useAdministrationSnapshot();
  const mutation = useAdministrationMutation(useAdministrationStore());
  const [tab, setTab] = useState<(typeof sessionsTabs)[number]["id"]>("all");
  const [editing, setEditing] = useState<PkaSession | "new">();
  const [selected, setSelected] = useState("");
  const session = records.sessions.find((entry) => entry.id === selected);
  const rows = records.sessions.filter((entry) => tab === "all" || (tab === "upcoming" ? future(entry.sessionAt) : !future(entry.sessionAt)))
    .sort((left, right) => Date.parse(right.sessionAt) - Date.parse(left.sessionAt));
  return <>
    <View style={layout.row}><Action label="Buat jadwal PKA" variation="default" onPress={() => setEditing("new")} testID="academic-pka-session-create" /></View>
    {mutation.feedback}
    {editing ? <SessionForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing}
      busy={mutation.blocked} cancel={() => setEditing(undefined)} save={(fields) => {
        const initial = editing === "new" ? undefined : editing;
        const sends = future(fields.sessionAt) && (!initial || Boolean(fields.meetLink.trim() && fields.meetLink.trim() !== initial.meetLink));
        mutation.run({ type: "pka.session.save", ...idAndRevision(initial), fields }, {
          ...(sends ? { title: "Simpan dan beri tahu peserta?", description: fields.title, confirmLabel: "Simpan jadwal" } : {}),
          success: initial ? "Jadwal PKA diperbarui." : "Jadwal PKA dibuat.", after: () => setEditing(undefined),
        });
      }} /> : null}
    <Tabs<(typeof sessionsTabs)[number]["id"]> options={sessionsTabs} selected={tab} onSelect={setTab} />
    <PagedRows key={tab} rows={rows} empty="Belum ada jadwal PKA." render={(entry) =>
      <DataRow key={entry.id} title={entry.title} description={dateTimeLabel(entry.sessionAt)}
        detail={future(entry.sessionAt) ? `${entry.recipients} penerima` : "Sesi lampau"} onPress={() => setSelected(entry.id)} />} />
    {session ? <CourseDialog title={session.title} onClose={() => setSelected("")}>
      <Ink>{dateTimeLabel(session.sessionAt)}</Ink>
      <Ink>{session.meetLink || "Tautan Meet belum tersedia."}</Ink>
      <View style={layout.row}>
        <Action label="Edit jadwal" onPress={() => { setSelected(""); setEditing(session); }} />
        <Action label="Hapus jadwal" variation="destructive" onPress={() => {
          setSelected("");
          mutation.run({ type: "pka.session.delete", id: session.id, revision: session.revision }, {
            title: "Hapus jadwal PKA?", description: session.title, confirmLabel: "Hapus jadwal", destructive: true, success: "Jadwal PKA dihapus.",
          });
        }} />
      </View>
    </CourseDialog> : null}
  </>;
}
