import { useState } from "react";
import { View } from "react-native";
import { adminCoursePath } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminCourseArchiver, AdminCourseEditor, AdminMaterialEditor } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseLiveRead } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { CourseLeaderboard } from "./leaderboard";
import { CourseDeleteDialog } from "./live-delete";
import { LiveFlashcards } from "./live-flashcards";
import { LiveVideos } from "./live-videos";
import { AdminCoursePdfPreview } from "./admin-pdf-preview";
import { LivePdfTitleEdit } from "./live-material";
import { LiveCourseEdit } from "./live-settings";
import { LiveCourseArchive } from "./live-management";
import { QuizAttemptsTable, QuizResultsTable } from "./tables";
import { Action, CourseDialog, CourseStatus, DataRow, Ink, Metrics, Panel, Picker, SearchBox, Tabs, layout } from "./ui";

type SectionOf<T extends AdminCourseSectionResult["type"]> = AdminCourseSectionResult & { type: T };
type Query = Readonly<Record<string, string>>;
type Navigate = (path: string) => void;

const labels: Record<string, string> = {
  published: "Terbit", draft: "Draf", in_review: "Dalam tinjauan", validated: "Tervalidasi",
  approved: "Disetujui", rejected: "Ditolak", changes_requested: "Perlu revisi", retired: "Diarsipkan",
  withdrawn: "Publikasi ditarik", validation_failed: "Validasi gagal", applied: "Diterapkan",
  failed: "Gagal", free: "Gratis", premium: "Premium", limited_time_free: "Gratis sementara",
  zyx_original: "Zyx asli", historical_reference: "Referensi historis", itb_example: "Contoh ITB",
  easy: "Mudah", medium: "Sedang", hard: "Sulit",
  in_progress: "Berlangsung", completed: "Selesai", abandoned: "Ditinggalkan",
};

function localLabel(value: string | null) {
  return value && (Object.hasOwn(labels, value) ? labels[value] : value);
}

function match(text: string, query: string) {
  return text.toLocaleLowerCase("id").includes(query.trim().toLocaleLowerCase("id"));
}

export function LiveCourseSection({ data, query, navigate, updateSettings, updateMaterial, removeVideo, removeQuestion, flashcardEditor, videoPlayer, archiveCourse, onArchived, refresh }: Pick<AdminCourseLiveRead, "removeVideo" | "removeQuestion" | "videoPlayer" | "flashcardEditor"> & {
  data: AdminCourseSectionResult; query: Query; navigate: Navigate; updateSettings?: AdminCourseEditor; updateMaterial?: AdminMaterialEditor; refresh(): void;
  archiveCourse?: AdminCourseArchiver; onArchived(): void;
}) {
  switch (data.type) {
    case "analytics":
    case "results":
      return <LiveAnalytics data={data} navigate={navigate} />;
    case "quiz-insight":
      return <LiveQuizInsight data={data} initialTab={query.tab} />;
    case "documents":
      return <LiveDocuments data={data} query={query} navigate={navigate} />;
    case "document": {
      const { document, chapters, titleEdit } = data;
      const editTitle = titleEdit && updateMaterial ? (
        <LivePdfTitleEdit initial={titleEdit} target={updateMaterial(data.course.id, document.id)} refresh={refresh} onDeleted={() => navigate(adminCoursePath(data.course.slug, "documents"))} />
      ) : null;
      return (
        <Panel title={document.title} action={editTitle}>
          <Ink kind="meta" tone="muted">{document.category}{document.year ? ` · ${document.year}` : ""}</Ink>
          {document.status ? <DataRow title="Status" detail={localLabel(document.status) ?? undefined} /> : null}
          {chapters.filter(({ id }) => document.chapterIds.includes(id)).map(({ id, title }) => <DataRow key={id} title={title} description="Bab" />)}
          {data.pdfPreview ? <AdminCoursePdfPreview courseId={data.course.id} materialId={document.id} title={document.title} /> : null}
          {!data.pdfPreview ? <CourseStatus label={editTitle ? "Pratinjau dokumen tersedia di Zyx web." : "Pratinjau dan penyuntingan dokumen tersedia di Zyx web."} /> : null}
        </Panel>
      );
    }
    case "review":
      return <LiveReview data={data} query={query} navigate={navigate} />;
    case "leaderboard":
      return <CourseLeaderboard attempts={data.attempts} />;
    case "videos":
      return <LiveVideos data={data} player={videoPlayer} remove={removeVideo} refresh={refresh} />;
    case "flashcards":
      return <LiveFlashcards data={data} editor={flashcardEditor} refresh={refresh} />;
    case "settings":
      return (
        <>
          <Panel title="Informasi mata kuliah" action={updateSettings ? <LiveCourseEdit data={data} save={updateSettings} refresh={refresh} /> : null}>
            {data.description ? <Ink>{data.description}</Ink> : null}
            <DataRow title="Akses peserta" detail={localLabel(data.pricing.category) ?? undefined} />
            {data.pricing.startsAt && data.pricing.endsAt ? (
              <View style={layout.group}>
                <DataRow title="Mulai gratis" detail={displayWib(data.pricing.startsAt)} />
                <DataRow title="Akhir gratis" detail={displayWib(data.pricing.endsAt)} />
              </View>
            ) : null}
          </Panel>
          <Panel title="Demo publik">
            <Ink>{data.isDemo ? "Aktif untuk demo publik" : "Belum dipilih untuk demo publik"}</Ink>
            {data.demoChecks.map((check) => <DataRow key={check.label} title={check.label} description={`${check.count} tersedia`} detail={check.ready ? "Siap" : "Belum siap"} />)}
          </Panel>
          {archiveCourse ? <LiveCourseArchive target={archiveCourse(data.course.id)} title={data.course.title}
            revision={data.revision} saved={onArchived} refresh={refresh} /> : null}
        </>
      );
    case "questions":
      return <LiveQuestions data={data} query={query} remove={removeQuestion} refresh={refresh} />;
  }
}

function displayWib(timestamp: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(timestamp));
}

function LiveAnalytics({ data, navigate }: { data: SectionOf<"analytics" | "results">; navigate: Navigate }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = [...new Set(data.quizzes.map((row) => row.category))];
  const filtered = data.quizzes.filter((quiz) => (!category || quiz.category === category) && match(quiz.title, search));
  return (
    <>
      <Metrics values={[
        { label: "Pengerjaan selesai", value: data.stats.totalAttempts },
        { label: "Rata-rata skor", value: data.stats.totalAttempts ? data.stats.avgScore : "-" },
        { label: "Kelulusan", value: data.stats.totalAttempts ? `${data.stats.passRate}%` : "-" },
      ]} />
      {data.type === "analytics" ? (
        <>
          <SearchBox label="Cari kuis" value={search} onChange={setSearch} testID="course-analytics-search" />
          <Picker label="Kategori kuis" selected={category} onSelect={setCategory}
            options={[{ id: "", label: "Semua kategori" }, ...categories.map((id) => ({ id, label: id }))]} />
        </>
      ) : null}
      <Panel title="Hasil per kuis">
        <QuizResultsTable rows={filtered} slug={data.course.slug} navigate={navigate} />
      </Panel>
    </>
  );
}

const insightTabs = [
  { id: "ai-insights", label: "Analisis" }, { id: "questions", label: "Butir soal" }, { id: "score-dist", label: "Distribusi skor" },
  { id: "attempts-sheet", label: "Pengerjaan" },
] as const;

function LiveQuizInsight({ data, initialTab }: { data: SectionOf<"quiz-insight">; initialTab?: string }) {
  const [tab, setTab] = useState(() => insightTabs.find(({ id }) => id === initialTab)?.id ?? "ai-insights");
  const [selected, setSelected] = useState<string | null>(null);
  const ranges = ["0 sampai 20", "21 sampai 40", "41 sampai 60", "61 sampai 80", "81 sampai 100"];
  const summary = data.summary;
  return (
    <>
      <Ink kind="heading">{data.quiz.title}</Ink>
      <Ink kind="meta" tone="muted">{data.quiz.category} · {localLabel(data.quiz.status)}</Ink>
      <Metrics values={[
        { label: "Dimulai", value: summary.totalStarted },
        { label: "Selesai", value: `${summary.totalCompleted} (${summary.completionRate}%)` },
        { label: "Rata-rata skor", value: summary.totalCompleted ? summary.avgScore : "-" },
        { label: "Median", value: summary.totalCompleted ? summary.medianScore : "-" },
      ]} />
      <Tabs<(typeof insightTabs)[number]["id"]> selected={tab} options={insightTabs} onSelect={setTab} testID="course-analytics-tab" />
      {tab === "ai-insights" ? (
        <Panel title="Analisis performa">
          {data.latestInsight ? (
            <>
              {data.latestInsight.summary ? <Ink>{data.latestInsight.summary}</Ink> : null}
              <Ink kind="meta" tone="muted">{data.latestInsight.sampleSize} pengerjaan dianalisis</Ink>
            </>
          ) : <CourseStatus label="Belum ada analisis tersimpan." />}
        </Panel>
      ) : null}
      {tab === "score-dist" ? (
        <Panel title="Distribusi skor">
          {summary.totalCompleted ? ranges.map((label, index) => <DataRow key={label} title={label} detail={String(summary.scoreRanges[index] ?? 0)} />)
            : <CourseStatus label="Belum ada skor." />}
        </Panel>
      ) : null}
      {tab === "attempts-sheet" ? <QuizAttemptRows attempts={data.attempts} /> : null}
      {tab === "questions" ? (
        <Panel title="Akurasi per soal">
          {data.questions.length ? data.questions.map((row) => (
            <View key={row.questionId}>
              <DataRow title={row.prompt} detail={`${row.accuracyRate}%`} expanded={selected === row.questionId}
                onPress={() => setSelected(selected === row.questionId ? null : row.questionId)} />
              {selected === row.questionId ? (
                <>
                  <Ink kind="meta" tone="muted">{row.totalAnswers} jawaban</Ink>
                  {row.options.map((option, index) => <DataRow key={`${row.questionId}-${index}`} title={option}
                    description={row.correctIndices.includes(index) ? "Jawaban benar" : undefined} detail={`${row.optionCounts[index] ?? 0} dipilih`} />)}
                </>
              ) : null}
            </View>
          )) : <CourseStatus label="Belum ada hasil per soal." />}
        </Panel>
      ) : null}
    </>
  );
}

function QuizAttemptRows({ attempts }: { attempts: SectionOf<"quiz-insight">["attempts"] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const visible = attempts.filter((item) => (!status || item.status === status) && match(item.name ?? "", search));
  const size = 20;
  const pages = Math.ceil(visible.length / size);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <Panel title="Pengerjaan peserta">
      <SearchBox label="Cari peserta" value={search} onChange={(value) => { setSearch(value); setPage(0); }} />
      <Picker label="Status pengerjaan" selected={status}
        onSelect={(value) => { setStatus(value); setPage(0); }}
        options={[{ id: "", label: "Semua status" }, ...["completed", "in_progress", "abandoned"].map((id) => ({ id, label: labels[id] }))]} />
      <QuizAttemptsTable rows={visible.slice(current * size, (current + 1) * size).map((item) => ({
        id: item.id, name: item.name ?? "Peserta", status: localLabel(item.status) || item.status,
        dateLabel: displayWib(item.submittedAt ?? item.startedAt),
        score: item.status === "completed" ? item.score : null, duration: item.durationSeconds,
      }))} />
      {pages > 1 ? (
        <View style={layout.row}>
          <Action label="Sebelumnya" onPress={() => setPage(current - 1)} disabled={current === 0} />
          <Ink kind="meta" tone="muted">{current + 1} / {pages}</Ink>
          <Action label="Berikutnya" onPress={() => setPage(current + 1)} disabled={current + 1 === pages} />
        </View>
      ) : null}
    </Panel>
  );
}

const documentTabs = [
  { id: "all", label: "Semua" }, { id: "materi", label: "Materi" }, { id: "diktat", label: "Diktat" },
  { id: "bank_soal", label: "Bank soal" }, { id: "pdf", label: "PDF" },
] as const;

function LiveDocuments({ data, query, navigate }: { data: SectionOf<"documents">; query: Query; navigate: Navigate }) {
  const [tab, setTab] = useState(() => documentTabs.find(({ id }) => id === (query.tab === "bank-soal" ? "bank_soal" : query.tab))?.id ?? "all");
  const [chapter, setChapter] = useState(query.chapter ?? "");
  const [search, setSearch] = useState("");
  const visible = data.documents.filter((row) => (tab === "all" || row.tab === tab || (tab === "pdf" && row.kind === "pdf")) &&
    (!chapter || row.chapterIds.includes(chapter)) && match(row.title, search));
  return (
    <>
      <Tabs<(typeof documentTabs)[number]["id"]> options={documentTabs} selected={tab} onSelect={setTab} testID="course-document-tab" />
      <SearchBox label="Cari dokumen" value={search} onChange={setSearch} />
      {data.chapters.length ? <ChapterPicker chapters={data.chapters} chapter={chapter} onSelect={setChapter} /> : null}
      {visible.length ? visible.map((row) => (
        <DataRow key={row.id} title={row.title} description={row.year ? `${row.category} · ${row.year}` : row.category}
          detail={localLabel(row.status) ?? undefined} onPress={() => navigate(adminCoursePath(data.course.slug, "documents", row.id))} />
      )) : <CourseStatus label="Belum ada dokumen pada pilihan ini." />}
    </>
  );
}

function LiveReview({ data, query, navigate }: { data: SectionOf<"review">; query: Query; navigate: Navigate }) {
  const [tab, setTab] = useState<"idea" | "product">((query.tab ?? query.section) === "product" ? "product" : "idea");
  const list = data.bundles.filter((row) => row.type === tab);
  return (
    <>
      <Tabs<"idea" | "product"> options={[{ id: "idea", label: "Idea Bundle" }, { id: "product", label: "Product Bundle" }]} selected={tab} onSelect={setTab} />
      {list.length ? list.map((row) => <DataRow key={row.id} title={row.title} description={row.subtitle} detail={localLabel(row.status) ?? undefined}
        onPress={() => navigate(adminCoursePath(data.course.slug, `review/${tab}`, row.id))} testID={`course-review-${row.id}`} />)
        : <CourseStatus label="Belum ada bundle untuk ditinjau." />}
    </>
  );
}

type ChapterFilterProps = {
  chapters: readonly { id: string; title: string }[];
  chapter: string;
  onSelect(id: string): void;
};

function ChapterPicker({ chapters, chapter, onSelect }: ChapterFilterProps) {
  return <Picker label="Filter bab" options={[{ id: "", label: "Semua bab" }, ...chapters.map(({ id, title }) => ({ id, label: title }))]}
    selected={chapter} onSelect={onSelect} />;
}

function LiveQuestions({ data, query, remove, refresh }: { data: SectionOf<"questions">; query: Query;
  remove?: AdminCourseLiveRead["removeQuestion"]; refresh(): void;
}) {
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState(query.chapter ?? "");
  const [difficulty, setDifficulty] = useState("");
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const questions = data.questions.filter((question) => (!chapter || question.chapterId === chapter) &&
    (!difficulty || question.difficulty === difficulty) && (!origin || (origin === "zyx_original" ? question.origin === origin : question.origin !== "zyx_original")) &&
    match(`${question.prompt} ${question.explanation ?? ""}`, search));
  const question = questions.find(({ id }) => id === selected);
  const target = question?.origin === "zyx_original" && question.deleteRevision ? remove?.(data.course.id, question.id) : undefined;
  return (
    <>
      <SearchBox label="Cari soal" value={search} onChange={setSearch} />
      <View style={layout.row}>
        {data.chapters.length ? <ChapterPicker chapters={data.chapters} chapter={chapter} onSelect={setChapter} /> : null}
        <Picker label="Asal soal" selected={origin} onSelect={setOrigin} options={[{ id: "", label: "Semua asal" },
          { id: "zyx_original", label: "Zyx asli" }, { id: "reference", label: "Referensi" }]} />
        <Picker label="Kesulitan" selected={difficulty} onSelect={setDifficulty} options={[{ id: "", label: "Semua tingkat" },
          ...["easy", "medium", "hard"].map((id) => ({ id, label: labels[id] }))]} />
      </View>
      {questions.length ? questions.map((row) => <DataRow key={row.id} title={row.prompt} description={[localLabel(row.origin), localLabel(row.difficulty)].filter(Boolean).join(" · ")}
        onPress={() => { setAnswers(false); setDeleting(false); setSelected(row.id); }} />) : <CourseStatus label="Tidak ada soal pada pilihan ini." />}
      {question && deleting && target && question.deleteRevision ? (
        <CourseDeleteDialog label="Hapus soal" name={question.prompt} detail="Soal ini akan dihapus permanen."
          dependencyError="Soal masih digunakan pada kuis, materi, atau referensi terkait."
          revision={question.deleteRevision} target={target} close={() => setDeleting(false)} refresh={() => {
            setSelected(null);
            refresh();
          }} />
      ) : question ? (
        <CourseDialog title="Detail soal" onClose={() => setSelected(null)}>
          <Ink kind="strong">{question.prompt}</Ink>
          {question.options.map((option, index) => <DataRow key={index} title={option}
            detail={answers && question.correctIndices.includes(index) ? "Jawaban benar" : undefined} />)}
          <Action label={answers ? "Sembunyikan pembahasan" : "Lihat pembahasan"} onPress={() => setAnswers(!answers)} />
          {answers && question.explanation ? <Ink>{question.explanation}</Ink> : null}
          {target ? <Action label={target.pending() ? "Periksa penghapusan" : "Hapus soal"} variation="ghost"
            onPress={() => setDeleting(true)} testID="admin-course-question-delete" /> : null}
        </CourseDialog>
      ) : null}
    </>
  );
}
