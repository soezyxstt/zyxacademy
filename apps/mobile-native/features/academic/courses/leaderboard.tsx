import { useContext, useState } from "react";
import { rankCourseLeaderboard, type CourseLeaderboardAttempt } from "../../../../../packages/native-parity/academic/courses/sections";
import { ResponsiveTable, type ResponsiveTableColumn } from "../../shared-ui/data-layout";
import { CourseTableLink, formatDuration } from "./tables";
import { CourseDialog, CourseStatus, CourseTheme, DataRow, Metrics, Panel, Picker, SearchBox } from "./ui";

export function CourseLeaderboard({ attempts }: { attempts: readonly CourseLeaderboardAttempt[] }) {
  const theme = useContext(CourseTheme);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { standings, totalAttempts } = rankCourseLeaderboard(attempts, type, search);
  const participant = standings.find((item) => item.id === selected);
  const columns: readonly ResponsiveTableColumn<(typeof standings)[number]>[] = [
    { id: "name", label: "Peserta", weight: 3, renderCell: (item) => (
      <CourseTableLink title={`${item.rank}. ${item.name}`} onPress={() => setSelected(item.id)} />
    ) },
    { id: "score", label: "Rata-rata skor", align: "end", renderCell: (item) => item.average },
    { id: "attempts", label: "Pengerjaan selesai", align: "end", renderCell: (item) => item.records.length },
    { id: "duration", label: "Rata-rata durasi", align: "end", renderCell: (item) => formatDuration(item.duration) },
  ];
  return (
    <>
      <SearchBox label="Cari peserta" value={search} onChange={setSearch} />
      <Picker label="Jenis kuis" selected={type} onSelect={setType}
        options={[{ id: "", label: "Semua jenis" }, { id: "quiz", label: "Kuis" }, { id: "simulation", label: "Simulasi" }]} />
      <Metrics values={[{ label: "Peserta berperingkat", value: standings.length }, { label: "Pengerjaan selesai", value: totalAttempts }]} />
      <Panel title="Peringkat peserta">
        <ResponsiveTable theme={theme} rows={standings} columns={columns} getRowKey={(item) => item.id}
          testID="course-leaderboard" empty={<CourseStatus label="Belum ada peserta pada pilihan ini." />} />
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

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(date)) : undefined;
}
