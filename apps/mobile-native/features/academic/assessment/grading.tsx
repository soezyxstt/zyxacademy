import { useCallback, useState } from "react";
import { View } from "react-native";
import {
  canGrade, questionTypes, type AssessmentContext, type AssessmentGateway, type GradeItem,
  type QuizAttempt, type QuizAttemptSummary,
} from "../../../../../packages/native-parity/academic/assessment";
import { Action, DataRow, Field, Ink, SearchBox, layout } from "../courses/ui";
import type { AcademicScreenProps } from "../contracts";
import { AssessmentNotice, AssessmentPage, dateLabel, MutationProblem, Pagination, ReadState, SectionRow, SelectField, useMutation, useRead } from "./ui";

type Props = AcademicScreenProps & { gateway: AssessmentGateway; context: AssessmentContext; base: string };
const pageSize = 10;
const attemptStatuses = { in_progress: "Berlangsung", pending: "Menunggu penilaian", graded: "Sudah dinilai", abandoned: "Ditinggalkan" };

export function QuizAttempts({ gateway, context, params, base, replace }: Props) {
  const { result, retry } = useRead(useCallback((signal: AbortSignal) => gateway.listQuizAttempts(context, params.templateId, signal), [gateway, context, params.templateId]));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<keyof typeof attemptStatuses | "all">("all");
  const [expanded, setExpanded] = useState("");
  const title = result?.ok ? result.value.quizTitle : undefined;
  return <AssessmentPage title="Hasil kuis" subtitle={title} back={() => replace(`${base}/quizzes`)} backLabel="Kembali ke kuis">
    <ReadState result={result} retry={retry}>{({ attempts }) => {
      const matches = attempts.filter((attempt) => matchesSearch(attempt, search) && (status === "all" || status === attempt.status));
      const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
      return <>
        <SearchBox label="Cari peserta" value={search} onChange={(value) => { setSearch(value); setPage(0); }} />
        <SelectField label="Status" options={{ all: "Semua status", ...attemptStatuses }} value={status}
          change={(value) => { setStatus(value); setPage(0); }} />
        <Ink kind="meta" tone="muted">{matches.length === attempts.length ? attempts.length : `${matches.length} dari ${attempts.length}`} percobaan</Ink>
        {!matches.length ? <AssessmentNotice message={search || status !== "all" ? "Peserta yang cocok tidak ditemukan." : "Belum ada percobaan."} /> : null}
        {matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((attempt) => (
          <SectionRow key={attempt.id} testID={`academic-quiz-result-${attempt.id}`}>
            <Ink kind="heading">{attempt.studentName}</Ink>
            <Ink kind="meta" tone="muted">{attempt.studentEmail}</Ink>
            <Ink>{attemptStatuses[attempt.status]}{attempt.score === null ? "" : ` · Nilai ${attempt.score}/100`}</Ink>
            <Ink kind="meta" tone="muted">{dateLabel(attempt.submittedAt)}{attempt.submittedAt ? ` · ${Math.floor(attempt.durationSeconds / 60)} menit ${attempt.durationSeconds % 60} detik` : ""}</Ink>
            {attempt.questions.length ? <View style={layout.row}>
              <Action label={expanded === attempt.id ? "Sembunyikan jawaban" : `Jawaban (${attempt.questions.length})`}
                onPress={() => setExpanded(expanded === attempt.id ? "" : attempt.id)} />
            </View> : null}
            {expanded === attempt.id ? attempt.questions.map((question, index) => <SectionRow key={question.id}>
              <Ink kind="meta" tone="muted">Soal {index + 1}</Ink>
              <Ink kind="strong">{question.prompt}</Ink>
              <Ink>Jawaban peserta: {question.answer || "Kosong"}</Ink>
              {question.answerKey ? <Ink>Kunci jawaban: {question.answerKey}</Ink> : null}
            </SectionRow>) : null}
          </SectionRow>
        ))}
        <Pagination page={currentPage} count={matches.length} size={pageSize} change={setPage} />
      </>;
    }}</ReadState>
  </AssessmentPage>;
}

function matchesSearch(attempt: QuizAttemptSummary, search: string) {
  return [attempt.quizTitle, attempt.studentName, attempt.studentEmail].join(" ").toLowerCase().includes(search.trim().toLowerCase());
}

export function QuizGrading({ gateway, context, base, replace, query }: Props) {
  const [attemptId, setAttemptId] = useState(query.attemptId || "");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const queue = useRead(useCallback((signal: AbortSignal) => gateway.pendingGrading(context, signal), [gateway, context]));

  if (attemptId) {
    return <GradingDetails key={attemptId} gateway={gateway} context={context} attemptId={attemptId}
      back={() => setAttemptId("")} onSaved={(notice) => {
        setAttemptId("");
        setMessage(notice);
        queue.retry();
      }} />;
  }

  return <AssessmentPage title="Penilaian kuis" back={() => replace(`${base}/quizzes`)} backLabel="Kembali ke kuis">
    {message ? <AssessmentNotice message={message} /> : null}
    <ReadState result={queue.result} retry={queue.retry}>{(attempts) => {
      const filtered = attempts.filter((attempt) => matchesSearch(attempt, search));
      const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
      return <>
        <SearchBox label="Cari peserta atau kuis" value={search} onChange={(value) => { setSearch(value); setPage(0); }} />
        <Ink kind="meta" tone="muted">{attempts.length} percobaan menunggu penilaian</Ink>
        {!filtered.length ? <AssessmentNotice message={search ? "Percobaan yang cocok tidak ditemukan." : "Semua percobaan sudah dinilai."} /> : null}
        {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((attempt) => (
          <DataRow key={attempt.id} title={attempt.studentName}
            description={`${attempt.quizTitle} · ${dateLabel(attempt.submittedAt)}`} detail={`${attempt.remainingEssays} esai`}
            onPress={() => { setMessage(""); setAttemptId(attempt.id); }} testID={`academic-grade-attempt-${attempt.id}`} />
        ))}
        <Pagination page={currentPage} count={filtered.length} size={pageSize} change={setPage} />
      </>;
    }}</ReadState>
  </AssessmentPage>;
}

function GradingDetails({ gateway, context, attemptId, back, onSaved }: {
  gateway: AssessmentGateway; context: AssessmentContext; attemptId: string; back(): void; onSaved(message: string): void;
}) {
  const { result, retry } = useRead(useCallback((signal: AbortSignal) => gateway.loadGradingAttempt(context, attemptId, signal), [gateway, context, attemptId]));
  const mutation = useMutation(gateway, context);

  function reload() {
    mutation.reset();
    retry();
  }

  return <AssessmentPage title={result?.ok ? result.value.studentName : "Detail penilaian"}
    subtitle={result?.ok ? result.value.quizTitle : undefined}
    back={() => { if (!mutation.pending) back(); }} backLabel="Kembali ke antrean">
    <ReadState result={result} retry={retry}>{(attempt) => (
      <GradeForm attempt={attempt} readOnly={!gateway.canGrade} busy={mutation.pending || mutation.problem?.code === "unavailable"} feedback={<MutationProblem mutation={mutation} reload={reload} />}
        save={(items, finalize) => mutation.send({ kind: "grading.save", attemptId, items, finalize }, (effect) => onSaved(effect.message))} />
    )}</ReadState>
  </AssessmentPage>;
}

function GradeForm({ attempt, busy, save, feedback, readOnly }: {
  attempt: QuizAttempt; readOnly: boolean; busy: boolean; save(items: GradeItem[], finalize: boolean): void;
  feedback: React.ReactNode;
}) {
  type Draft = { score: string; notes: string };
  const [draft, setDraft] = useState<Record<string, Draft>>(() => Object.fromEntries(
    attempt.answers.filter((answer) => canGrade(answer.type)).map((answer) => [
      answer.questionId, { score: answer.reviewScore?.toString() ?? "", notes: answer.reviewNotes },
    ]),
  ));
  const [validation, setValidation] = useState("");

  function update(key: string, patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function submit(finalize: boolean) {
    const items: GradeItem[] = [];
    for (const answer of attempt.answers) {
      const input = draft[answer.questionId];
      if (!input) continue;
      if (!input.score.trim()) {
        if (finalize && answer.type === "essay") {
          setValidation("Berikan nilai untuk semua jawaban esai.");
          return;
        }
        continue;
      }
      const score = Number(input.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        setValidation("Nilai harus antara 0 dan 100.");
        return;
      }
      if (score === answer.reviewScore && input.notes.trim() === answer.reviewNotes) continue;
      items.push({ questionId: answer.questionId, score, reviewNotes: input.notes.trim() || null, expectedRevision: answer.revision });
    }
    if (!items.length) {
      setValidation("Isi atau ubah nilai untuk minimal satu jawaban.");
      return;
    }
    setValidation("");
    save(items, finalize);
  }

  return <>
    <Ink kind="meta" tone="muted">{dateLabel(attempt.submittedAt)}</Ink>
    {attempt.answers.map((answer, index) => (
      <SectionRow key={answer.questionId}>
        <Ink kind="meta" tone="muted">Soal {index + 1} · {questionTypes[answer.type]}</Ink>
        <Ink kind="strong">{answer.prompt}</Ink>
        <Ink>{answer.submittedAnswer || "Tidak ada jawaban"}</Ink>
        {answer.attachmentLabel ? <Ink>{answer.attachmentLabel}</Ink> : null}
        {answer.automaticScore !== null ? <Ink kind="meta" tone="muted">Nilai otomatis {answer.automaticScore}/100</Ink> : null}
        {readOnly ? <>
          {answer.reviewScore !== null ? <Ink>Nilai penilaian {answer.reviewScore}/100</Ink> : null}
          {answer.reviewNotes ? <Ink>{answer.reviewNotes}</Ink> : null}
        </> : draft[answer.questionId] ? <>
          <Field label={`Nilai soal ${index + 1}, 0 sampai 100`} keyboardType="decimal-pad" editable={!busy} value={draft[answer.questionId].score}
            onChangeText={(score) => update(answer.questionId, { score })} testID={`academic-grade-score-${answer.questionId}`} />
          <Field label={`Catatan soal ${index + 1}`} multiline editable={!busy} maxLength={2000} value={draft[answer.questionId].notes}
            onChangeText={(notes) => update(answer.questionId, { notes })} />
        </> : null}
      </SectionRow>
    ))}
    {validation ? <AssessmentNotice message={validation} error /> : null}
    {feedback}
    {readOnly ? <AssessmentNotice message="Pengisian nilai tersedia di web." /> : <View style={layout.row}>
      <Action label="Simpan draf" onPress={() => submit(false)} disabled={busy} testID="academic-grade-save" />
      <Action label="Selesaikan penilaian" onPress={() => submit(true)} disabled={busy} variation="default" testID="academic-grade-finalize" />
    </View>}
  </>;
}
