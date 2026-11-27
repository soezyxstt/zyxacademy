import { useState } from "react";
import { View } from "react-native";
import type { CourseAttempt, CourseFixture, CourseQuiz } from "../../../../../packages/native-parity/academic/courses/fixtures";
import { completedCourseAttempts, summarizeCourseAttempts } from "../../../../../packages/native-parity/academic/courses/model";
import type { AcademicActor } from "../contracts";
import { formatDuration, QuizAttemptsTable, QuizResultsTable } from "./tables";
import { MutationStatus, useCourseMutation } from "./scope";
import { Action, CourseStatus, DataRow, Ink, Metrics, Panel, Picker, SearchBox, Tabs, layout, useCourseColors } from "./ui";

const quizCategories = ["Harian", "Mingguan", "Bab", "Premium", "Simulasi"] as const;
const analyticsTabs = [
  { id: "ai-insights", label: "Analisis" },
  { id: "questions", label: "Butir soal" },
  { id: "score-dist", label: "Distribusi skor" },
  { id: "attempts-sheet", label: "Pengerjaan" },
] as const;

export function CourseAnalytics({ data, navigate, results = false }: {
  data: CourseFixture; navigate(path: string): void; results?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const quizzes = data.quizzes.filter((item) => (!category || item.category === category) &&
    item.title.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")));
  const selectedIds = new Set(quizzes.map((item) => item.id));
  const filteredAttempts = data.attempts.filter((item) => selectedIds.has(item.quizId));
  const summary = summarizeCourseAttempts(filteredAttempts);

  return (
    <>
      {!results ? (
        <View style={layout.group}>
          <SearchBox label="Cari kuis" value={search} onChange={setSearch} testID="course-analytics-search" />
          <Picker label="Kategori kuis" selected={category} onSelect={setCategory} testID="course-analytics-category"
            options={[{ id: "", label: "Semua kategori" }, ...quizCategories.map((id) => ({ id, label: id }))]} />
        </View>
      ) : null}
      <Metrics values={[
        { label: "Pengerjaan selesai", value: summary.completed },
        { label: "Rata-rata skor", value: summary.completed ? summary.average : "-" },
        { label: "Kelulusan", value: summary.completed ? `${summary.passRate}%` : "-" },
      ]} />
      <Panel title={results ? "Hasil per kuis" : "Kuis"}>
        <QuizResultsTable slug={data.course.slug} navigate={navigate} rows={quizzes.map((quiz) => {
          const result = summarizeCourseAttempts(filteredAttempts.filter((attempt) => attempt.quizId === quiz.id));
          return {
            id: quiz.id, title: quiz.title, category: quiz.category, status: quiz.status, hasInsight: Boolean(quiz.insights),
            totalAttempts: result.completed, avgScore: result.average, passRate: result.passRate,
          };
        })} />
      </Panel>
    </>
  );
}

export function QuizAnalyticsDetail({ data, quiz, actor, initialTab }: {
  data: CourseFixture; quiz: CourseQuiz; actor: AcademicActor; initialTab?: string;
}) {
  const [tab, setTab] = useState(() => analyticsTabs.find((item) => item.id === initialTab)?.id ?? "ai-insights");
  const [selected, setSelected] = useState<string | null>(null);
  const attempts = data.attempts.filter((item) => item.quizId === quiz.id);
  const summary = summarizeCourseAttempts(attempts);
  const mutation = useCourseMutation(actor, () => undefined);
  const optionTotal = (options: readonly number[]) => options.reduce((total, value) => total + value, 0);

  function runAnalysis() {
    const highest = quiz.questionStats
      .flatMap(({ questionId, options }) => {
        const question = data.questions.find((item) => item.id === questionId);
        const total = optionTotal(options);
        return question && total ? [{ question, accuracy: Math.round((options[question.answer] ?? 0) * 100 / total) }] : [];
      })
      .sort((left, right) => left.accuracy - right.accuracy)[0];
    const insight = highest
      ? `${summary.completed} pengerjaan selesai dengan rata-rata skor ${summary.average}. Akurasi terendah ${highest.accuracy}% pada soal “${highest.question.prompt}”`
      : `${summary.completed} pengerjaan selesai dengan rata-rata skor ${summary.average}.`;
    mutation.submit({
      slug: data.course.slug, operation: "update", revision: data.revision,
      apply: (current) => current ? {
        ...current, quizzes: current.quizzes.map((item) => item.id === quiz.id ? { ...item, insights: insight } : item),
      } : "Mata kuliah tidak ditemukan.",
    });
  }

  return (
    <>
      <Ink kind="heading">{quiz.title}</Ink>
      <Ink kind="meta" tone="muted">{quiz.category} · {quiz.status === "published" ? "Terbit" : "Draf"}</Ink>
      <Metrics values={[
        { label: "Dimulai", value: summary.started },
        { label: "Selesai", value: `${summary.completed} (${summary.completion}%)` },
        { label: "Rata-rata skor", value: summary.completed ? summary.average : "-" },
        { label: "Rata-rata durasi", value: summary.duration ? formatDuration(summary.duration) : "-" },
      ]} />
      <Tabs<(typeof analyticsTabs)[number]["id"]> options={analyticsTabs} selected={tab} onSelect={setTab} testID="course-analytics-tab" />
      {tab === "ai-insights" ? (
        <Panel title="Analisis performa">
          {quiz.insights ? <Ink>{quiz.insights}</Ink> : <CourseStatus label={summary.completed ? "Belum ada analisis tersimpan." : "Analisis tersedia setelah ada pengerjaan selesai."} />}
          <MutationStatus mutation={mutation} reload={mutation.clear} />
          <Action label={quiz.insights ? "Perbarui analisis" : "Jalankan analisis"} onPress={runAnalysis}
            disabled={!summary.completed || mutation.result?.status === "retry"} testID="course-analytics-run" />
        </Panel>
      ) : null}
      {tab === "questions" ? (
        <Panel title="Akurasi per soal">
          {!quiz.questionStats.length ? <CourseStatus label="Belum ada hasil per soal." /> : null}
          {quiz.questionStats.map(({ questionId, options }) => {
            const question = data.questions.find((item) => item.id === questionId);
            if (!question) return null;
            const total = optionTotal(options);
            const correct = options[question.answer] ?? 0;
            return (
              <View key={questionId}>
                <DataRow title={question.prompt} detail={total ? `${Math.round(correct * 100 / total)}%` : "0 jawaban"}
                  onPress={() => setSelected(selected === questionId ? null : questionId)} expanded={selected === questionId} />
                {selected === questionId ? question.options.map((option, index) => (
                  <DataRow key={option} title={option} description={index === question.answer ? "Jawaban benar" : undefined}
                    detail={`${options[index] ?? 0} jawaban`} />
                )) : null}
              </View>
            );
          })}
        </Panel>
      ) : null}
      {tab === "score-dist" ? <ScoreDistribution attempts={attempts} /> : null}
      {tab === "attempts-sheet" ? <CourseAttempts attempts={attempts} /> : null}
    </>
  );
}

function ScoreDistribution({ attempts }: { attempts: readonly CourseAttempt[] }) {
  const completed = completedCourseAttempts(attempts);
  const palette = useCourseColors();
  return (
    <Panel title="Distribusi skor">
      {!completed.length ? <CourseStatus label="Belum ada skor." /> : null}
      {completed.length ? [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]].map(([start, end]) => {
        const count = completed.filter((attempt) => attempt.score >= start && attempt.score <= end).length;
        const percent = (count / completed.length) * 100;
        return (
          <View key={start} style={layout.compact} accessible accessibilityLabel={`Skor ${start} hingga ${end}, ${count} pengerjaan`}>
            <View style={layout.split}>
              <Ink kind="strong">{start} sampai {end}</Ink>
              <Ink kind="meta" tone="muted">{count} pengerjaan</Ink>
            </View>
            <View style={{ borderRadius: 4, height: 7, backgroundColor: palette.muted }}>
              <View style={{ borderRadius: 4, width: `${percent}%`, height: "100%", backgroundColor: palette.primary }} />
            </View>
          </View>
        );
      }) : null}
    </Panel>
  );
}

function CourseAttempts({ attempts }: { attempts: readonly CourseAttempt[] }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = attempts.filter((item) => (filter === "all" || (filter === "completed") === (item.score !== null)) &&
    item.name.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")));
  return (
    <Panel title="Pengerjaan peserta">
      <SearchBox label="Cari peserta" value={search} onChange={setSearch} />
      <Picker label="Status pengerjaan" selected={filter} onSelect={setFilter}
        options={[{ id: "all", label: "Semua status" }, { id: "completed", label: "Selesai" }, { id: "active", label: "Berlangsung" }]} />
      <QuizAttemptsTable rows={filtered.map((item) => ({
        id: item.id, name: item.name, dateLabel: formatDate(item.date),
        status: item.score === null ? "Berlangsung" : "Selesai",
        duration: item.score === null ? null : item.duration, score: item.score,
      }))} />
    </Panel>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(date));
}
