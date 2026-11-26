import { useState } from "react";
import { View } from "react-native";
import { DEFAULT_ICON, EMOJI_OPTIONS, LINK_COLORS, LINK_CATEGORY_SUGGESTIONS, isValidHttpUrl } from "../../../../../lib/links";
import { ManagementFailure, managementSlug, type LinkFields, type MediaLocation, type MeetingSpace, type PublicLink } from "../../../../../packages/native-parity/operations/management-contract";
import { Action, Choices, Confirm, Copy, Feedback, Field, Heading, Item, LoadState, Screen, Section, Sections, formatTimestamp, styles, useAction, useDraft, useManagement, useRead, type Confirmation } from "./ui";

export function MediaLibrary({ initialSpace }: { initialSpace?: string }) {
  const { openExternal } = useManagement();
  const [space, setSpace] = useState<MediaLocation["space"]>(initialSpace === "storage" ? "storage" : "media");
  const [folder, setFolder] = useState("");
  const [editor, setEditor] = useState<{ key?: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const read = useRead("media", { space, folder });
  const action = useAction();
  function remove(key: string, isFolder: boolean) {
    setConfirm({ title: isFolder ? "Hapus folder?" : "Hapus berkas?", description: isFolder ? `${key} beserta isinya akan dihapus.` : `${key} akan dihapus dari pustaka media.`, label: "Hapus", danger: true,
      run: () => void action.run({ type: "media.delete", key, folder: isFolder }, read.reload, "Media dihapus."),
    });
  }
  function copy(key: string, isFolder: boolean) {
    setConfirm({ title: "Salin ke media?", description: `${key} akan disalin ke pustaka media.`, label: "Salin", run: () => void action.run({ type: "media.copy", key, folder: isFolder, destination: "" }, undefined, "Media disalin.") });
  }
  const parent = folder.split("/").slice(0, -1).join("/");
  return <Screen title="Media" description="Penyimpanan hanya untuk dibaca. Salin berkas ke pustaka media untuk mengelolanya.">
    <Sections values={[["media", "Pustaka media"], ["storage", "Penyimpanan"]]} current={space} onChange={next => { setSpace(next); setFolder(""); setEditor(null); }} />
    <View style={styles.row}>
      {folder && <Action onPress={() => setFolder(parent === "media" ? "" : parent)}>Folder induk</Action>}
      <Action onPress={read.reload}>Muat ulang</Action>
      {space === "media" && <Action onPress={() => setEditor({ name: "" })}>Folder baru</Action>}
    </View>
    {folder && <Copy muted>{folder}</Copy>}
    <Feedback {...action} />
    {editor && <Section title={editor.key ? "Ganti nama berkas" : "Folder baru"}>
      <Field label="Nama" value={editor.name} onChangeText={next => setEditor({ ...editor, name: next })} />
      <View style={styles.row}><Action onPress={() => setEditor(null)}>Batal</Action>
        <Action variant="default" busy={action.busy} onPress={() => action.run(editor.key ? { type: "media.rename", key: editor.key, name: editor.name } : { type: "media.folder", folder, name: editor.name }, () => { setEditor(null); read.reload(); })}>Simpan</Action>
      </View>
    </Section>}
    <LoadState {...read} retry={read.reload} />
    {read.data && <Section>
      {!read.data.files.length && !read.data.folders.length && <Copy muted>Folder ini masih kosong.</Copy>}
      {read.data.folders.map(key => <Item key={key} title={key.split("/").at(-1) ?? key} meta="Folder" onPress={() => setFolder(key)} actions={space === "media" ? <Action variant="destructive" onPress={() => remove(key, true)}>Hapus folder</Action> : <Action onPress={() => copy(key, true)}>Salin ke media</Action>} />)}
      {read.data.files.map(file => <Item key={file.key} title={file.name} meta={`${Math.ceil(file.size / 1024)} KB`} onPress={file.url && openExternal ? () => openExternal(file.url!) : undefined} actions={space === "storage" ? <Action onPress={() => copy(file.key, false)}>Salin ke media</Action> : <>
        <Action onPress={() => setEditor({ key: file.key, name: file.name })}>Ganti nama</Action><Action variant="destructive" onPress={() => remove(file.key, false)}>Hapus</Action>
      </>} />)}
    </Section>}
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}

const meetAccess = [["OPEN", "Terbuka"], ["TRUSTED", "Organisasi dan undangan"], ["RESTRICTED", "Perlu izin host"]] as const;
export function MeetList() {
  const { navigate, locale, openExternal, share } = useManagement();
  const records = useRead("meetings", undefined);
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
  const people = directory.data?.users.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(search.trim().toLowerCase()) && (role === "all" || person.roles.includes(role)) && (course === "all" || person.courseIds.includes(course)));
  function create() {
    setConfirm({ title: "Mulai meeting?", description: emails.length ? `${emails.length} peserta akan diundang.` : "Ruang Google Meet akan dibuat.", label: "Mulai meeting", run: () => action.run({ type: "meet.create", title, slug: slug ?? managementSlug(title), accessType, invitedEmails: emails }, result => {
      setActive(result.space); setTitle(""); setSlug(undefined); setEmails([]); setPicker(false);
    }) });
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
      {active ? <Item title={active.title} meta={`Aktif · ${active.meetingCode}`} actions={<>
        {active.meetingUri && openExternal && <Action onPress={() => openExternal(active.meetingUri!)}>Buka sebagai host</Action>}
        {active.meetingUri && share && <Action onPress={() => share(active.meetingUri!)}>Bagikan tautan Meet</Action>}
        <Action variant="destructive" disabled={action.busy} onPress={() => setConfirm({ title: "Akhiri meeting?", description: `${active.title} akan diakhiri.`, label: "Akhiri meeting", danger: true, run: () => void action.run({ type: "meet.end", spaceName: active.name }, () => { setActive(undefined); records.reload(); }) })}>Akhiri meeting</Action>
      </>} /> : <Copy muted>Belum ada sesi meeting aktif.</Copy>}
    </Section>
    <Section title="Riwayat meeting">
      <View style={styles.row}><Action onPress={records.reload}>Muat ulang</Action></View>
      <LoadState {...records} retry={records.reload} />
      {records.data?.length === 0 && <Copy muted>Belum ada riwayat meeting.</Copy>}
      {records.data?.map(record => <Item key={record.id} title={record.title} meta={`${formatTimestamp(record.startTime, locale)} · ${record.participantCount ?? 0} peserta`}
        onPress={() => navigate(`/admin/meet/${encodeURIComponent(record.id)}`)} actions={<Action variant="destructive" disabled={action.busy} onPress={() => setConfirm({ title: "Hapus log meeting?", description: `${record.title} akan dihapus dari daftar riwayat.`, label: "Hapus log", danger: true, run: () => void action.run({ type: "meet.delete", id: record.id }, records.reload, "Log meeting dihapus.") })}>Hapus log</Action>} />)}
    </Section>
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
  </Screen>;
}

export function MeetDetails({ id }: { id: string }) {
  const { navigate, locale, openExternal } = useManagement();
  const read = useRead("meeting", id);
  const meeting = read.data;
  return <Screen title="Detail log meeting" back={{ label: "Meet", run: () => navigate("/admin/meet") }} actions={<Action onPress={read.reload}>Muat ulang</Action>}>
    <LoadState {...read} retry={read.reload} />
    {meeting && <>
      <Section title={meeting.title}>
        <Copy muted>{formatTimestamp(meeting.startTime, locale)}</Copy>
        <Copy>{`${Math.floor(meeting.totalDurationSeconds / 60)} menit · ${meeting.participantCount ?? meeting.participants.length} peserta · Puncak ${meeting.peakConcurrentParticipants ?? 0}`}</Copy>
        <Copy>{`${meeting.recordings.length} rekaman · ${meeting.transcripts.reduce((total, transcript) => total + transcript.lines, 0)} baris transkrip`}</Copy>
      </Section>
      <Section title="Kehadiran peserta">
        {!meeting.participants.length && <Copy muted>Belum ada peserta.</Copy>}
        {meeting.participants.map(person => <Item key={person.id} title={person.name} meta={`${person.userType} · ${Math.round(person.totalDurationSeconds / 60)} menit`} actions={<View style={styles.field}>{person.sessions.map((session, index) => <Copy key={index}>{`Masuk ${formatTimestamp(session.startTime, locale)} · Keluar ${formatTimestamp(session.endTime, locale)}`}</Copy>)}</View>} />)}
      </Section>
      <Section title="Rekaman">
        {!meeting.recordings.length && <Copy muted>Belum ada rekaman.</Copy>}
        {meeting.recordings.map(recording => <Item key={recording.id} title="Rekaman" meta={formatTimestamp(recording.startTime, locale)} onPress={recording.url && openExternal ? () => openExternal(recording.url!) : undefined} />)}
      </Section>
      <Section title="Transkrip">
        {!meeting.transcripts.length && <Copy muted>Belum ada transkrip.</Copy>}
        {meeting.transcripts.map(transcript => <Copy key={transcript.id}>{`${transcript.lines} baris`}</Copy>)}
      </Section>
    </>}
  </Screen>;
}

export function Discussions() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [active, setActive] = useState<string>();
  const threads = useRead("discussions", undefined);
  const matching = threads.data?.filter(thread => (filter === "all" || thread.status === filter) && `${thread.title} ${thread.channel}`.toLowerCase().includes(search.toLowerCase().trim()));
  const thread = threads.data?.find(item => item.id === active);
  if (thread) return <DiscussionDetail key={thread.id} thread={thread} onBack={() => setActive(undefined)} reload={threads.reload} />;
  return <Screen title="Diskusi">
    <Field label="Cari diskusi" value={search} onChangeText={setSearch} />
    <Choices current={filter} values={[["all", "Semua"], ["open", "Terbuka"], ["resolved", "Selesai"]]} onChange={setFilter} />
    <LoadState {...threads} retry={threads.reload} />
    {matching && <Section>
      {!matching.length && <Copy muted>Belum ada diskusi yang sesuai.</Copy>}
      {matching.map(item => <Item key={item.id} title={item.title} meta={`${item.channel} · ${item.messageCount} jawaban`} onPress={() => setActive(item.id)} />)}
    </Section>}
  </Screen>;
}

function DiscussionDetail({ thread, onBack, reload }: { thread: NonNullable<ReturnType<typeof useRead<"discussions">>["data"]>[number]; onBack: () => void; reload: () => void }) {
  const messages = useRead("discussion", thread.id);
  const action = useAction();
  const draft = useDraft(`discussion:${thread.id}`, "");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [resolved, setResolved] = useState(thread.status === "resolved");
  return <Screen title={thread.title} description={thread.channel} back={{ label: "Diskusi", run: () => { reload(); onBack(); } }}>
    <View style={styles.row}><Action busy={action.busy} onPress={() => action.run({ type: "discussion.resolve", id: thread.id, resolved: !resolved }, () => setResolved(!resolved))}>{resolved ? "Buka kembali" : "Tandai selesai"}</Action></View>
    <LoadState {...messages} retry={messages.reload} />
    {messages.data && <Section>{messages.data.map(message => <Item key={message.id} title={message.author} meta={message.body} />)}</Section>}
    <Feedback {...action} />
    {!resolved && <Section title="Balasan">
      <Field label="Tulis balasan" value={draft.value} onChangeText={draft.change} multiline />
      <Action variant="default" busy={action.busy} disabled={!draft.value.trim()} onPress={() => setConfirm({ title: "Kirim balasan?", description: "Balasan akan tampil di diskusi.", label: "Kirim", run: () => action.run({ type: "discussion.reply", id: thread.id, body: draft.value }, () => { draft.change(""); draft.clear(); messages.reload(); }, "Balasan terkirim.") })}>Kirim balasan</Action>
    </Section>}
    <Confirm value={confirm} onClose={() => setConfirm(null)} />
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
