import { useState } from "react";
import { View } from "react-native";
import { adminCoursePath } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminCourseArchiver, AdminCourseEditor, AdminMaterialEditor } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseLiveRead } from "../../../../../packages/native-parity/academic/courses/model";
import type { AdminCourseSectionResult } from "../../../../../packages/native-parity/academic/courses/sections";
import { Pagination } from "../../shared-ui/data-controls";
import { CourseLeaderboard } from "./leaderboard";
import { CourseDeleteDialog } from "./live-delete";
import { LiveQuizAttempts } from "./live-quiz-attempts";
import { QuizAnalysisAction, QuizInsightDetails } from "./live-quiz-insight";
import { LiveFlashcards } from "./live-flashcards";
import { LiveVideos } from "./live-videos";
import { AdminCoursePdfPreview } from "./admin-pdf-preview";
import { LivePdfTitleEdit } from "./live-material";
import { LiveDemoSelection } from "./live-demo-selection";
import { LiveCourseEdit } from "./live-settings";
import { LivePdfIntake } from "./live-pdf-intake";
import { LiveBundleIntake } from "./live-bundle-intake";
import { LiveTextCourseDocument } from "./live-text-document";
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

export function LiveCourseSection({ data, query, navigate, updateSettings, updateDemo, updateMaterial, removeVideo, removeQuestion, flashcardEditor, videoPlayer, archiveCourse, onArchived, refresh }: Pick<AdminCourseLiveRead, "updateDemo" | "removeVideo" | "removeQuestion" | "videoPlayer" | "flashcardEditor"> & {
  data: AdminCourseSectionResult; query: Query; navigate: Navigate; updateSettings?: AdminCourseEditor; updateMaterial?: AdminMaterialEditor; refresh(): void;
  archiveCourse?: AdminCourseArchiver; onArchived(): void;
}) {
  switch (data.type) {
    case "analytics":
    case "results":
      return <LiveAnalytics data={data} navigate={navigate} />;
    case "quiz-insight":
      return <LiveQuizInsight data={data} initialTab={query.tab} refresh={refresh} />;
    case "documents":
      return <LiveDocuments data={data} query={query} navigate={navigate} refresh={refresh} />;
    case "document": {
      const { document, chapters, titleEdit } = data;
      const editTitle = titleEdit && updateMaterial ? (
        <LivePdfTitleEdit slug={data.course.slug} documentId={document.id} initial={titleEdit} target={updateMaterial(data.course.id, document.id)} refresh={refresh} onDeleted={() => navigate(adminCoursePath(data.course.slug, "documents"))} />
      ) : null;
      return (
        <Panel title={document.title} action={editTitle}>
          <Ink kind="meta" tone="muted">{document.category}{document.year ? ` · ${document.year}` : ""}</Ink>
          {document.status ? <DataRow title="Status" detail={localLabel(document.status) ?? undefined} /> : null}
          {chapters.filter(({ id }) => document.chapterIds.includes(id)).map(({ id, title }) => <DataRow key={id} title={title} description="Bab" />)}
          {data.pdfPreview ? <AdminCoursePdfPreview courseId={data.course.id} materialId={document.id} title={document.title} /> : null}
          {document.kind === "article" ? <LiveTextCourseDocument slug={data.course.slug} courseId={data.course.id}
            documentId={document.id} initialEdit={query.mode === "edit"} refresh={refresh} />
            : !data.pdfPreview ? <CourseStatus label="Pratinjau dokumen tidak tersedia." /> : null}
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
            {updateDemo && data.demoSelection && <LiveDemoSelection course={data.course} revision={data.revision} active={data.isDemo}
              selection={data.demoSelection} target={updateDemo(data.course.id)} refresh={refresh} />}
            <Ink>{data.isDemo ? "Aktif untuk demo publik" : "Belum dipilih untuk demo publik"}</Ink>
            {data.demoChecks.map((check) => <DataRow key={check.label} title={check.label} description={`${check.count} tersedia`} detail={check.ready ? "Siap" : "Belum siap"} />)}
          </Panel>
          {archiveCourse ? <LiveCourseArchive target={archiveCourse(data.course.id)} title={data.course.title}
            revision={data.revision} saved={onArchived} refresh={refresh} /> : null}
        </>
      );
    case "questions":
      return <LiveQuestions data={data} query={query} navigate={navigate} remove={removeQuestion} refresh={refresh} />;
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

function LiveQuizInsight({ data, initialTab, refresh }: { data: SectionOf<"quiz-insight">; initialTab?: string; refresh(): void }) {
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
          {data.quiz.courseId ? <QuizAnalysisAction quizId={data.quiz.id} courseId={data.quiz.courseId} totalCompleted={summary.totalCompleted} refresh={refresh} /> : null}
          {data.latestInsight ? (
            <>
              <Ink>{data.latestInsight.summary || data.latestInsight.report?.summaryOverview}</Ink>
              {data.latestInsight.report ? <QuizInsightDetails report={data.latestInsight.report} /> : null}
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
      {tab === "attempts-sheet" && (data.quiz.courseId
        ? <LiveQuizAttempts key={data.quiz.courseId + ":" + data.quiz.id} courseId={data.quiz.courseId} quizId={data.quiz.id} title={data.quiz.title} />
        : <QuizAttemptRows attempts={data.attempts} />)}
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

function LiveDocuments({ data, query, navigate, refresh }: { data: SectionOf<"documents">; query: Query; navigate: Navigate; refresh(): void }) {
  const [tab, setTab] = useState(() => documentTabs.find(({ id }) => id === (query.tab === "bank-soal" ? "bank_soal" : query.tab))?.id ?? "all");
  const [chapter, setChapter] = useState(query.chapter ?? "");
  const [search, setSearch] = useState("");
  const visible = data.documents.filter((row) => (tab === "all" || row.tab === tab || (tab === "pdf" && row.kind === "pdf")) &&
    (!chapter || row.chapterIds.includes(chapter)) && match(row.title, search));
  return (
    <>
      <Tabs<(typeof documentTabs)[number]["id"]> options={documentTabs} selected={tab} onSelect={setTab} testID="course-document-tab" />
      {data.pdfUpload && data.chapters.length ? <LivePdfIntake courseId={data.course.id} refresh={refresh}
        chapters={data.chapters.map((row, index) => ({ ...row, orderIndex: row.orderIndex ?? index + 1 }))} /> : null}
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
      {data.bundleUpload?.[tab] ? <LiveBundleIntake key={tab + ":" + data.course.id} courseId={data.course.id} kind={tab}
        onStaged={id => navigate(adminCoursePath(data.course.slug, `review/${tab}`, id))} /> : null}
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

function LiveQuestions({ data, query, navigate, remove, refresh }: { data: SectionOf<"questions">; query: Query; navigate: Navigate;
  remove?: AdminCourseLiveRead["removeQuestion"]; refresh(): void;
}) {
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState(query.chapter ?? "");
  const [difficulty, setDifficulty] = useState("");
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const changeFilter = (update: (value: string) => void) => (value: string) => { update(value); setPage(1); };
  const questions = data.questions.filter((question) => (!chapter || question.chapterId === chapter) &&
    (!difficulty || question.difficulty === difficulty) && (!origin || (origin === "zyx_original" ? question.origin === origin : (question.origin === "historical_reference" || question.origin === "itb_example"))) &&
    match(`${question.prompt} ${question.explanation ?? ""} ${question.sourceEventName ?? ""}`, search));
  const pageCount = Math.ceil(questions.length / size);
  const current = Math.max(1, Math.min(pageCount, page));
  const question = questions.find(({ id }) => id === selected);
  const target = question?.origin === "zyx_original" && question.deleteRevision ? remove?.(data.course.id, question.id) : undefined;
  return (
    <>
      <SearchBox label="Cari soal" value={search} onChange={changeFilter(setSearch)} />
      <View style={layout.row}>
        {data.chapters.length ? <ChapterPicker chapters={data.chapters} chapter={chapter} onSelect={changeFilter(setChapter)} /> : null}
        <Picker label="Asal soal" selected={origin} onSelect={changeFilter(setOrigin)} options={[{ id: "", label: "Semua asal" },
          { id: "zyx_original", label: "Zyx asli" }, { id: "reference", label: "Referensi" }]} />
        <Picker label="Kesulitan" selected={difficulty} onSelect={changeFilter(setDifficulty)} options={[{ id: "", label: "Semua tingkat" },
          ...["easy", "medium", "hard"].map((id) => ({ id, label: labels[id] }))]} />
        <Picker label="Soal per halaman" selected={String(size)} onSelect={value => { setSize(Number(value)); setPage(1); }}
          options={[10, 25, 50].map(value => ({ id: String(value), label: String(value) }))} />
        <Action label="Buka studio bank soal" onPress={() => navigate("/admin/questions?qCourse=" + encodeURIComponent(data.course.id))} />
      </View>
      {questions.length ? questions.slice((current - 1) * size, current * size).map((row) => <DataRow key={row.id} title={row.prompt} description={[row.sourceEventName || localLabel(row.origin), localLabel(row.difficulty)].filter(Boolean).join(" · ")}
        onPress={() => { setAnswers(false); setDeleting(false); setSelected(row.id); }} />) : <CourseStatus label="Tidak ada soal pada pilihan ini." />}
      {pageCount > 1 && <Pagination page={current} pageCount={pageCount} onPageChange={setPage} testID="course-questions-page"
        labels={{ previous: "Halaman sebelumnya", next: "Halaman berikutnya", busy: "Memuat soal" }}
        formatSummary={(number, total) => `Halaman ${number} dari ${total}`} />}
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
