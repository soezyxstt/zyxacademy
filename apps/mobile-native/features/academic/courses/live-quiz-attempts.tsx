import { useContext, useEffect, useState } from "react";
import { View } from "react-native";
import { courseQuizApi } from "../../../../../packages/academic/quiz-insight";
import { quizAttemptSheet, readQuizAttempts, snapshotAnswer, type QuizSheetAttempt, type QuizSheetFormat } from "../../../../../packages/academic/quiz-attempt-sheet";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { NativeSpreadsheetExport } from "../spreadsheet-export";
import { TextDocumentTransport } from "./document-transport";
import { Action, CourseStatus, DataRow, Ink, Panel, Picker, SearchBox, layout } from "./ui";

const statuses: Record<string, string> = { completed: "Selesai", in_progress: "Berlangsung", abandoned: "Ditinggalkan" };
const pageSize = 20;

export function LiveQuizAttempts({ quizId, courseId, title }: { quizId: string; courseId: string; title: string }) {
  const transport = useContext(TextDocumentTransport);
  const { suspended } = useProtectedInteraction();
  const [includeOpen, setIncludeOpen] = useState(true);
  const [attempts, setAttempts] = useState<QuizSheetAttempt[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string>();
  const [format, setFormat] = useState<QuizSheetFormat>("matrix");

  useEffect(() => {
    const task = new AbortController();
    setAttempts(undefined);
    setError("");
    setExpanded(undefined);
    setPage(0);
    if (transport && !suspended) void (async () => {
      try {
        const response = await transport.get(courseQuizApi(quizId, courseId, "attempts", includeOpen), task.signal);
        if (!response.ok) {
          if (!task.signal.aborted) setError([401, 403, 404].includes(response.status) ? "Pengerjaan tidak dapat diakses." : "Pengerjaan gagal dimuat.");
          return;
        }
        const rows = readQuizAttempts(await response.json(), quizId, courseId);
        if (!task.signal.aborted) setAttempts(rows);
      } catch { if (!task.signal.aborted) setError("Pengerjaan gagal dimuat."); }
    })();
    return () => task.abort();
  }, [quizId, courseId, transport, includeOpen, suspended, retry]);

  const query = search.trim().toLocaleLowerCase("id");
  const filtered = attempts?.filter(a => (!status || a.status === status) &&
    [a.studentEmail, a.studentName].some(value => value.toLocaleLowerCase("id").includes(query))) ?? [];
  return <Panel title="Pengerjaan peserta">
    <SearchBox label="Cari nama atau email peserta" value={search} onChange={value => { setSearch(value); setPage(0); }} />
    <Picker label="Pengerjaan yang dimuat" selected={includeOpen ? "all" : "completed"} onSelect={value => { setIncludeOpen(value === "all"); setStatus(""); }}
      options={[{ id: "all", label: "Semua pengerjaan" }, { id: "completed", label: "Hanya yang selesai" }]} />
    {includeOpen && <Picker label="Status" selected={status} onSelect={value => { setStatus(value); setPage(0); }}
      options={[{ id: "", label: "Semua status" }, ...Object.entries(statuses).map(([id, label]) => ({ id, label }))]} />}
    {error ? <><CourseStatus label={error} /><Action label="Muat ulang" onPress={() => setRetry(n => n + 1)} /></>
      : !attempts ? <CourseStatus label="Memuat pengerjaan…" /> : !filtered.length ? <CourseStatus label="Tidak ada pengerjaan pada pilihan ini." /> : null}
    {filtered.slice(page * pageSize, (page + 1) * pageSize).map(a => <View key={a.id} style={layout.group}>
      <DataRow title={a.studentName} description={[a.studentEmail, statuses[a.status], a.startedAt && new Date(a.startedAt).toLocaleString("id-ID")].filter(Boolean).join(" · ")}
        detail={a.status === "completed" ? "Skor " + a.score : undefined} expanded={expanded === a.id} onPress={() => setExpanded(expanded === a.id ? undefined : a.id)} />
      {expanded === a.id && <>
        <Ink kind="meta">Durasi {a.durationSeconds} detik{a.submittedAt ? " · Dikumpulkan " + new Date(a.submittedAt).toLocaleString("id-ID") : ""}</Ink>
        {a.questionsSnapshot.length ? a.questionsSnapshot.map((q, i) => {
          const key = snapshotAnswer(q.correct_indices ?? q.correctIndices, q.options);
          return <DataRow key={q.id} title={q.prompt || q.content || "Soal " + (i + 1)}
            description={["Jawaban: " + (snapshotAnswer(a.answersSnapshot[q.id], q.options) || "Tidak dijawab"), key && "Kunci: " + key].filter(Boolean).join("\n")} />;
        }) : <CourseStatus label="Rincian jawaban tidak tersedia." />}
      </>}
    </View>)}
    {filtered.length > pageSize && <View style={layout.row}>
      <Action label="Sebelumnya" disabled={!page} onPress={() => setPage(n => n - 1)} />
      <Ink kind="meta">{page + 1} / {Math.ceil(filtered.length / pageSize)}</Ink>
      <Action label="Berikutnya" disabled={(page + 1) * pageSize >= filtered.length} onPress={() => setPage(n => n + 1)} />
    </View>}
    {attempts && transport && <><Picker label="Format ekspor" selected={format} onSelect={value => setFormat(value === "summary" ? "summary" : "matrix")}
      options={[{ id: "matrix", label: "Matriks jawaban" }, { id: "summary", label: "Ringkasan" }]} />
      <NativeSpreadsheetExport key={quizId + ":" + format} entityId={quizId + ":" + format} entityType="quiz" transport={transport}
        count={filtered.length} filtered={Boolean(query || status || !includeOpen)} build={() => quizAttemptSheet({ id: quizId, title }, attempts, filtered, format)} />
    </>}
  </Panel>;
}
