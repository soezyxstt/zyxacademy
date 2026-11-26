import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { getTutorDocBySlug, getTutorDocs, searchTutorDocs } from "../../../../../packages/academic/docs/tutor";
import { addTutorDays, slotEndTime, tutorFixtureWeek, type TutorFixtureRepository, type TutorSlotDraft } from "../../../../../packages/native-parity/academic/tutor/fixture-interactions";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { AcademicScreenProps } from "../contracts";
import { Choices, Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout } from "./ui";

type Props = Pick<AcademicScreenProps, "theme" | "navigate" | "back" | "query">;

function plainText(source: string) {
  return source.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|\x60/g, "");
}

export function TutorDocs({ slug, theme, navigate, back }: Props & { slug?: string }) {
  const [search, setSearch] = useState("");
  if (!slug) {
    const docs = searchTutorDocs(search);
    const categories = [...new Set(docs.map((doc) => doc.category))];
    return <TutorPage title="Dokumentasi tutor" theme={theme} onBack={back}>
      <Input theme={theme} placeholder="Cari dokumentasi" accessibilityLabel="Cari dokumentasi" value={search} onChangeText={setSearch} style={tutorLayout.input} />
      {categories.map((category) => <View key={category}>
        <Heading theme={theme} title={category} />
        {docs.filter((doc) => doc.category === category).map((doc) =>
          <Row key={doc.slug} theme={theme} title={doc.title} subtitle={doc.summary} onPress={() => navigate(`/tutor/docs/${encodeURIComponent(doc.slug)}`)} />)}
      </View>)}
      {docs.length === 0 ? <Empty theme={theme} title="Dokumentasi tidak ditemukan" description="Coba kata kunci lain atau hapus pencarian." /> : null}
    </TutorPage>;
  }

  const doc = getTutorDocBySlug(slug);
  if (!doc) return <TutorPage title="Dokumentasi tutor" theme={theme} onBack={back}><Empty theme={theme} title="Panduan tidak ditemukan" /></TutorPage>;
  const docs = getTutorDocs();
  const index = docs.findIndex((entry) => entry.slug === slug);
  const adjacent = [docs[index - 1], docs[index + 1]];
  return <TutorPage title={doc.title} subtitle={doc.category} theme={theme} onBack={back}>
    <Label theme={theme}>{doc.summary}</Label>
    {doc.sections.map((section) => <View key={section.title} style={tutorLayout.group}>
      <Heading theme={theme} title={section.title} />
      {section.paragraphs?.map((paragraph) => <Label key={paragraph} theme={theme}>{plainText(paragraph)}</Label>)}
      {section.steps?.map((step, index) => {
        const body = typeof step === "string" ? step : step.body;
        return <View key={body} style={tutorLayout.group}>
          {typeof step !== "string" && step.title ? <Label theme={theme} tone="strong">{index + 1}. {step.title}</Label> : null}
          <Label theme={theme}>{plainText(body)}</Label>
        </View>;
      })}
      {section.callouts?.map((callout) => <View key={callout.body} style={tutorLayout.group}>
        {callout.title ? <Label theme={theme} tone="strong">{callout.title}</Label> : null}
        <Label theme={theme}>{plainText(callout.body)}</Label>
      </View>)}
      {section.examples?.map((example) => <Label key={example} theme={theme}>{plainText(example)}</Label>)}
      {section.codeBlocks?.map((block) => <Row key={block.code} theme={theme} title={block.label ?? "Kode"} subtitle={block.code} />)}
      {section.table?.rows.map((row, rowIndex) =>
        <Row key={rowIndex} theme={theme} title={row[0] ?? ""}>
          {row.slice(1).map((value, index) =>
            <Label key={index} theme={theme}>{section.table?.headers[index + 1]} · {plainText(value)}</Label>)}
        </Row>)}
    </View>)}
    {doc.quickLinks?.length ? <View>
      <Heading theme={theme} title="Akses cepat" />
      {doc.quickLinks.filter((link) => link.href.startsWith("/tutor")).map((link) =>
        <Row key={link.href} theme={theme} title={link.label} subtitle={link.description} onPress={() => navigate(link.href)} />)}
    </View> : null}
    <View>
      {adjacent.map((entry, index) => entry ? <Row key={entry.slug} theme={theme}
        title={entry.title} subtitle={index === 0 ? "Panduan sebelumnya" : "Panduan berikutnya"}
        onPress={() => navigate(`/tutor/docs/${encodeURIComponent(entry.slug)}`)} /> : null)}
    </View>
  </TutorPage>;
}

const sessionDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" });

type ScheduleTab = "calendar" | "tickets" | "groups";

export function TutorSchedule({ theme, back, query, populated, repository }: Props & { populated: boolean; repository: TutorFixtureRepository }) {
  const offset = Number(query.week ?? 0);
  const [week, setWeek] = useState(Number.isFinite(offset) ? Math.max(-520, Math.min(520, Math.trunc(offset))) : 0);
  const [tab, setTab] = useState<ScheduleTab>(query.tab === "tickets" ? "tickets" : "calendar");
  const [search, setSearch] = useState("");
  const { slots } = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
  const [draft, setDraft] = useState<TutorSlotDraft | null>(null);
  const [error, setError] = useState("");
  const monday = addTutorDays(tutorFixtureWeek, week * 7);
  const sunday = addTutorDays(monday, 6);
  const visible = slots.filter((slot) => slot.date >= monday && slot.date <= sunday &&
    `${slot.topic} ${slot.date} ${slot.time} ${slot.location}`.toLowerCase().includes(search.trim().toLowerCase()));

  function saveSlot() {
    if (!draft) return;
    const result = repository.saveSlot(draft);
    if (!result.ok) {
      setError({
        invalid: "Periksa tanggal, waktu, dan lokasi untuk sesi tatap muka.",
        conflict: "Waktu ini bertabrakan dengan slot lain.",
        unavailable: "Slot ini sudah tidak tersedia.",
      }[result.reason]);
      return;
    }
    setWeek(Math.floor((Date.parse(draft.date) - Date.parse(tutorFixtureWeek)) / (7 * 86_400_000)));
    setDraft(null);
  }

  return <>
    <TutorPage title="Jadwal mengajar" theme={theme} onBack={back}>
      <Choices<ScheduleTab> theme={theme} label="Bagian jadwal" value={tab} change={setTab}
        options={[["calendar", "Kalender"], ["tickets", "Tiket"], ["groups", "Kelas dan kelompok"]]} />
      {tab === "calendar" ? <>
        <Label theme={theme} tone="heading">{sessionDate.format(new Date(monday))} sampai {sessionDate.format(new Date(sunday))}</Label>
        <View style={tutorLayout.cluster}>
          <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={week === -520} onPress={() => setWeek(week - 1)}>Pekan lalu</Button>
          <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={week === 520} onPress={() => setWeek(week + 1)}>Pekan depan</Button>
          <Button theme={theme} style={tutorLayout.action} onPress={() => {
            setError("");
            setDraft({ date: monday, time: "09:00", mode: "online", topic: "", location: "" });
          }}>Tambah slot</Button>
        </View>
        <Input theme={theme} accessibilityLabel="Cari slot" placeholder="Cari slot, topik, kelompok" value={search} onChangeText={setSearch} style={tutorLayout.input} />
        <View>
          <Heading theme={theme} title="Slot" count={`${visible.length} slot`} />
          {visible.length ? visible.map((slot) => <Row key={slot.id} theme={theme} title={slot.topic || "Slot ketersediaan"}
            subtitle={`${sessionDate.format(new Date(slot.date))} · ${slot.time} sampai ${slotEndTime(slot.time)}`}
            meta={slot.booked ? "Terisi" : "Tersedia"} onPress={slot.booked ? undefined : () => { setError(""); setDraft(slot); }}
          ><Label theme={theme} tone="muted">{slot.mode === "online" ? "Daring" : slot.location}</Label></Row>) : (
            <Empty theme={theme} title="Belum ada slot ketersediaan" description="Tambahkan slot 90 menit agar sesi tutorial kelompok dapat dijadwalkan." />
          )}
        </View>
      </> : null}
      {tab === "tickets" ? (populated ? <Row theme={theme} title="Penjadwalan ulang" subtitle="Kelompok Sel · Biologi Dasar" meta="Menunggu keputusan">
        <Label theme={theme}>Kelompok meminta waktu pengganti.</Label>
      </Row> : <Empty theme={theme} title="Tidak ada tiket penjadwalan ulang atau pembatalan" />) : null}
      {tab === "groups" ? (populated ? <Row theme={theme} title="Kelompok Sel" subtitle="Biologi Dasar · Tutorial reguler" meta="2/8 sesi" />
        : <Empty theme={theme} title="Belum ada kelompok aktif" />) : null}
    </TutorPage>
    {draft ? <TutorDetail theme={theme} title={draft.id ? "Edit slot ketersediaan" : "Tambah slot ketersediaan"} subtitle="90 menit" onBack={() => setDraft(null)}
      footer={<Button theme={theme} style={tutorLayout.action} onPress={saveSlot}>Simpan slot</Button>}>
      <Label theme={theme} tone="strong">Tanggal (YYYY-MM-DD)</Label>
      <Input theme={theme} accessibilityLabel="Tanggal" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} />
      <Label theme={theme} tone="strong">Mulai (HH:MM)</Label>
      <Input theme={theme} accessibilityLabel="Waktu mulai" value={draft.time} onChangeText={(time) => setDraft({ ...draft, time })} />
      <Choices<TutorSlotDraft["mode"]> theme={theme} label="Mode sesi" value={draft.mode} change={(mode) => setDraft({ ...draft, mode })}
        options={[["online", "Daring"], ["offline", "Tatap muka"]]} />
      {draft.mode === "offline" ? <Input theme={theme} accessibilityLabel="Lokasi" placeholder="Lokasi atau ruangan" value={draft.location}
        onChangeText={(location) => setDraft({ ...draft, location })} /> : null}
      <Input theme={theme} accessibilityLabel="Topik sesi" placeholder="Topik sesi (opsional)" value={draft.topic} onChangeText={(topic) => setDraft({ ...draft, topic })} />
      {error ? <Label theme={theme} tone="error">{error}</Label> : null}
    </TutorDetail> : null}
  </>;
}

const thread = {
  title: "Apa perbedaan difusi dan osmosis?",
  body: "Kapan perpindahan zat melalui membran disebut osmosis?",
  student: "Nadia Lestari",
};

export function TutorDiscussions({ courseTitle, courseId, populated, theme, back, repository }: Props & {
  courseTitle?: string;
  courseId?: string;
  populated: boolean;
  repository: TutorFixtureRepository;
}) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(false);
  const [answer, setAnswer] = useState("");
  const { discussionReplies: responses } = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
  const visible = populated && `${thread.title} ${thread.body} ${thread.student}`.toLowerCase().includes(search.trim().toLowerCase());
  return <>
    <TutorPage title="Diskusi" subtitle={courseTitle} theme={theme} onBack={back}>
      <Input theme={theme} accessibilityLabel="Cari diskusi" placeholder="Cari diskusi" value={search} onChangeText={setSearch} style={tutorLayout.input} />
      {visible ? <Row theme={theme} title={thread.title} subtitle={`${thread.student} · Biologi Dasar`} meta={`${responses.length} jawaban`} onPress={() => setActive(true)} />
        : <Empty theme={theme} title={search.trim() ? "Diskusi tidak ditemukan" : "Belum ada diskusi"} />}
    </TutorPage>
    {active ? <TutorDetail title={thread.title} subtitle={thread.student} theme={theme} onBack={() => setActive(false)}
      footer={<View style={tutorLayout.group}>
        <Input theme={theme} accessibilityLabel="Jawaban" placeholder="Tulis jawaban" multiline value={answer} onChangeText={setAnswer} />
        <Button theme={theme} style={tutorLayout.action} disabled={!answer.trim()} onPress={() => {
          if (repository.replyToDiscussion(courseId, answer)) setAnswer("");
        }}>Kirim jawaban</Button>
      </View>}>
      <Label theme={theme}>{thread.body}</Label>
      <Heading theme={theme} title="Jawaban" count={String(responses.length)} />
      {responses.map((response) => <Row key={response.id} theme={theme} title="Anda" subtitle={response.body} />)}
    </TutorDetail> : null}
  </>;
}
