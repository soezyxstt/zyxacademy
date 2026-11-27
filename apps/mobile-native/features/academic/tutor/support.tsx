import { useRef, useState, useSyncExternalStore, type ComponentRef } from "react";
import { View } from "react-native";
import { parseTutorWeek } from "../../../../../packages/academic/tutor-support";
import { addTutorDays, slotEndTime, tutorFixtureWeek, type TutorFixtureRepository, type TutorSlotDraft } from "../../../../../packages/native-parity/academic/tutor/fixture-interactions";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { AcademicScreenProps } from "../contracts";
import { SharedDialog } from "../../shared-ui";
import { TutorWeekCalendar } from "./schedule-calendar";
import { Choices, Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout } from "./ui";

type Props = Pick<AcademicScreenProps, "theme" | "navigate" | "back" | "query">;

type ScheduleTab = "calendar" | "tickets" | "groups";

export function TutorSchedule({ theme, back, query, populated, repository }: Props & { populated: boolean; repository: TutorFixtureRepository }) {
  const [week, setWeek] = useState(() => parseTutorWeek(query.week));
  const [tab, setTab] = useState<ScheduleTab>(query.tab === "tickets" ? "tickets" : "calendar");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>();
  const { slots } = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
  const [draft, setDraft] = useState<TutorSlotDraft | null>(null);
  const [error, setError] = useState("");
  const addSlotRef = useRef<ComponentRef<typeof Button>>(null);
  const dateInputRef = useRef<ComponentRef<typeof Input>>(null);
  const monday = addTutorDays(tutorFixtureWeek, week * 7);
  const sunday = addTutorDays(monday, 6);
  const visible = slots.filter((slot) => slot.date >= monday && slot.date <= sunday &&
    `${slot.topic} ${slot.date} ${slot.time} ${slot.location}`.toLowerCase().includes(search.trim().toLowerCase()));
  const activeDate = selectedDate ?? visible[0]?.date ?? monday;

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
    setSelectedDate(draft.date);
    setDraft(null);
  }

  return <>
    <TutorPage title="Jadwal mengajar" theme={theme} onBack={back}>
      <Choices<ScheduleTab> theme={theme} label="Bagian jadwal" value={tab} change={setTab}
        options={[["calendar", "Kalender"], ["tickets", "Tiket"], ["groups", "Kelas dan kelompok"]]} />
      {tab === "calendar" ? <>
        <Button ref={addSlotRef} theme={theme} style={tutorLayout.action} onPress={() => {
          setError("");
          setDraft({ date: selectedDate ?? monday, time: "09:00", mode: "online", topic: "", location: "" });
        }}>Tambah slot</Button>
        <Input theme={theme} accessibilityLabel="Cari slot" placeholder="Cari slot, topik, kelompok" value={search}
          onChangeText={(value) => { setSearch(value); setSelectedDate(undefined); }} style={tutorLayout.input} />
        <TutorWeekCalendar theme={theme} start={monday} week={week} today="2026-11-26" selectedDate={activeDate}
          events={visible.map((slot) => ({
            id: slot.id,
            dateId: slot.date,
            title: slot.topic || "Slot ketersediaan",
            caption: [`${slot.time} sampai ${slotEndTime(slot.time)}`, slot.mode === "online" ? "Daring" : slot.location, slot.booked ? "Terisi" : "Tersedia"].join(" · "),
            disabled: slot.booked,
          }))}
          onDateChange={setSelectedDate}
          onWeekChange={(direction) => { setSelectedDate(undefined); setWeek((current) => current + direction); }}
          onEventPress={(id) => {
            const slot = visible.find((item) => item.id === id);
            if (slot && !slot.booked) {
              setError("");
              setDraft(slot);
            }
          }}
        />
      </> : null}
      {tab === "tickets" ? (populated ? <Row theme={theme} title="Penjadwalan ulang" subtitle="Kelompok Sel · Biologi Dasar" meta="Menunggu keputusan">
        <Label theme={theme}>Kelompok meminta waktu pengganti.</Label>
      </Row> : <Empty theme={theme} title="Tidak ada tiket penjadwalan ulang atau pembatalan" />) : null}
      {tab === "groups" ? (populated ? <Row theme={theme} title="Kelompok Sel" subtitle="Biologi Dasar · Tutorial reguler" meta="2/8 sesi" />
        : <Empty theme={theme} title="Belum ada kelompok aktif" />) : null}
    </TutorPage>
    <SharedDialog open={Boolean(draft)} theme={theme} title={draft?.id ? "Edit slot ketersediaan" : "Tambah slot ketersediaan"}
      description="90 menit" closeLabel="Kembali" onDismiss={() => setDraft(null)} dismissOnBackdrop={false}
      initialFocusRef={dateInputRef} returnFocusRef={addSlotRef} testID="tutor-schedule-slot-dialog"
      footer={<Button theme={theme} style={tutorLayout.action} onPress={saveSlot}>Simpan slot</Button>}>
      {draft ? <>
        <Label theme={theme} tone="strong">Tanggal (YYYY-MM-DD)</Label>
        <Input ref={dateInputRef} theme={theme} accessibilityLabel="Tanggal" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} />
        <Label theme={theme} tone="strong">Mulai (HH:MM)</Label>
        <Input theme={theme} accessibilityLabel="Waktu mulai" value={draft.time} onChangeText={(time) => setDraft({ ...draft, time })} />
        <Choices<TutorSlotDraft["mode"]> theme={theme} label="Mode sesi" value={draft.mode} change={(mode) => setDraft({ ...draft, mode })}
          options={[["online", "Daring"], ["offline", "Tatap muka"]]} />
        {draft.mode === "offline" ? <Input theme={theme} accessibilityLabel="Lokasi" placeholder="Lokasi atau ruangan" value={draft.location}
          onChangeText={(location) => setDraft({ ...draft, location })} /> : null}
        <Input theme={theme} accessibilityLabel="Topik sesi" placeholder="Topik sesi (opsional)" value={draft.topic} onChangeText={(topic) => setDraft({ ...draft, topic })} />
        {error ? <Label theme={theme} tone="error">{error}</Label> : null}
      </> : null}
    </SharedDialog>
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
