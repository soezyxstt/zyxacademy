import { useState } from "react";
import { rankCourseLeaderboard, type CourseLeaderboardAttempt } from "../../../../../packages/native-parity/academic/courses/sections";
import { CourseDialog, CourseStatus, DataRow, Metrics, Panel, Picker, SearchBox } from "./ui";

export function CourseLeaderboard({ attempts }: { attempts: readonly CourseLeaderboardAttempt[] }) {
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { standings, totalAttempts } = rankCourseLeaderboard(attempts, type, search);
  const participant = standings.find((item) => item.id === selected);
  return (
    <>
      <SearchBox label="Cari peserta" value={search} onChange={setSearch} />
      <Picker label="Jenis kuis" selected={type} onSelect={setType}
        options={[{ id: "", label: "Semua jenis" }, { id: "quiz", label: "Kuis" }, { id: "simulation", label: "Simulasi" }]} />
      <Metrics values={[{ label: "Peserta berperingkat", value: standings.length }, { label: "Pengerjaan selesai", value: totalAttempts }]} />
      <Panel title="Peringkat peserta">
        {standings.length ? standings.map((item) => (
          <DataRow key={item.id} title={`${item.rank}. ${item.name}`} detail={`Skor ${item.average}`}
            description={`${item.records.length} pengerjaan · ${formatDuration(item.duration)}`}
            onPress={() => setSelected(item.id)} />
        )) : <CourseStatus label="Belum ada peserta pada pilihan ini." />}
      </Panel>
      {participant ? (
        <CourseDialog title={participant.name} onClose={() => setSelected(null)}>
          <Metrics values={[{ label: "Peringkat", value: participant.rank }, { label: "Rata-rata skor", value: participant.average }]} />
          {participant.records.map((item) => (
            <DataRow key={item.id} title={item.title} detail={`Skor ${item.score}`} description={formatDate(item.submittedAt)} />
          ))}
        </CourseDialog>
      ) : null}
    </>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} mnt ${seconds % 60} dtk` : `${seconds} dtk`;
}

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(date)) : undefined;
}
