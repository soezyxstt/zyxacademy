import { useCallback, useState } from "react";
import { View } from "react-native";
import {
  dateRangeError, targetVersion, type AssessmentContext, type AssessmentGateway, type AssessmentTryout,
  type MutationEffect, type TryoutCollection, type TryoutInput, type TryoutQuestion,
} from "../../../../../packages/native-parity/academic/assessment";
import type { AcademicScreenProps } from "../contracts";
import { Action, CourseDialog, Ink, Field, SearchBox, layout } from "../courses/ui";
import { QuestionPicker, ScheduleFields } from "./editor";
import { QuestionContent, QuestionEditor } from "./question-editor";
import { AssessmentNotice, AssessmentPage, ConfirmAction, MutationProblem, Pagination, ReadState, SectionRow, SelectField, useMutation, useRead } from "./ui";

type Props = AcademicScreenProps & { gateway: AssessmentGateway; context: AssessmentContext; base: string };
type TryoutAction =
  | { kind: "edit"; exam?: AssessmentTryout }
  | { kind: "delete"; exam: AssessmentTryout }
  | { kind: "question"; exam: AssessmentTryout; question?: TryoutQuestion }
  | { kind: "deleteQuestion"; exam: AssessmentTryout; question: TryoutQuestion }
  | { kind: "import"; exam: AssessmentTryout };
const statuses = { draft: "Draf", published: "Terbit", ended: "Berakhir" };
const pageSize = 8;

export function Tryouts({ gateway, context, back }: Props) {
  const { result, retry } = useRead(useCallback((signal: AbortSignal) => gateway.listTryouts(context, signal), [gateway, context]));
  const mutation = useMutation(gateway, context);
  const [activeId, setActiveId] = useState("");
  const [modal, setModal] = useState<TryoutAction | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [listPage, setListPage] = useState(0);
  const [questionPage, setQuestionPage] = useState(0);
  const active = result?.ok ? result.value.tryouts.find((tryout) => tryout.id === activeId) : undefined;

  function close() {
    if (mutation.pending) return;
    mutation.reset();
    setModal(null);
    setSelected([]);
  }

  function open(action: TryoutAction) {
    mutation.reset();
    setSelected([]);
    setModal(action);
  }

  function finished(effect: MutationEffect) {
    setNotice(effect.message);
    setModal(null);
    setSelected([]);
    retry();
  }

  function reload() {
    close();
    retry();
  }

  function render(data: TryoutCollection) {
    if (active) {
      const questions = [...active.questions].sort((a, b) => a.order - b.order);
      const shown = Math.min(questionPage, Math.max(0, Math.ceil(questions.length / pageSize) - 1));
      return <>
        {gateway.canMutate ? <View style={layout.row}>
          <Action label="Tambah soal" variation="default" onPress={() => open({ kind: "question", exam: active })} testID="academic-tryout-add-question" />
          <Action label="Impor dari bank" onPress={() => open({ kind: "import", exam: active })} testID="academic-tryout-import" />
        </View> : null}
        {!questions.length ? <AssessmentNotice message="Tryout belum memiliki soal." /> : null}
        {questions.slice(shown * pageSize, (shown + 1) * pageSize).map((question) => (
          <SectionRow key={question.id}>
            <Ink kind="meta" tone="muted">Soal {question.order}</Ink>
            <QuestionContent question={question} />
            {question.acceptsFile ? <Ink kind="meta" tone="muted">Menerima lampiran</Ink> : null}
            {gateway.canMutate ? <View style={layout.row}>
              <Action label="Edit" onPress={() => open({ kind: "question", exam: active, question })} />
              <Action label="Hapus" variation="ghost" onPress={() => open({ kind: "deleteQuestion", exam: active, question })} />
            </View> : null}
          </SectionRow>
        ))}
        <Pagination page={shown} count={questions.length} size={pageSize} change={setQuestionPage} />
      </>;
    }
    const filtered = data.tryouts.filter((tryout) => tryout.title.toLowerCase().includes(search.trim().toLowerCase()));
    const shown = Math.min(listPage, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
    return <>
      {gateway.canMutate ? <View style={layout.row}><Action label="Buat tryout" variation="default" onPress={() => open({ kind: "edit" })} testID="academic-tryout-new" /></View> : null}
      <SearchBox label="Cari tryout" value={search} onChange={(value) => { setSearch(value); setListPage(0); }} />
      {!filtered.length ? <AssessmentNotice message={search ? "Tryout yang cocok tidak ditemukan." : "Belum ada tryout."} /> : null}
      {filtered.slice(shown * pageSize, (shown + 1) * pageSize).map((exam) => (
        <SectionRow key={exam.id} testID={`academic-tryout-row-${exam.id}`}>
          <Ink kind="heading">{exam.title}</Ink>
          <Ink kind="meta" tone="muted">{statuses[exam.status]} · {exam.questions.length} soal · {exam.timeLimitMinutes} menit · {exam.maxAttempts} percobaan</Ink>
          <View style={layout.row}>
            <Action label={gateway.canMutate ? "Kelola soal" : "Lihat soal"} onPress={() => { setNotice(""); setQuestionPage(0); setActiveId(exam.id); }} testID={`academic-tryout-questions-${exam.id}`} />
            {gateway.canMutate ? <><Action label="Edit" onPress={() => open({ kind: "edit", exam })} testID={`academic-tryout-edit-${exam.id}`} />
            <Action label="Hapus" variation="ghost" onPress={() => open({ kind: "delete", exam })} /></> : null}
          </View>
        </SectionRow>
      ))}
      <Pagination page={shown} count={filtered.length} size={pageSize} change={setListPage} />
    </>;
  }

  const feedback = <MutationProblem mutation={mutation} reload={reload} />;
  return <AssessmentPage title={active?.title ?? "Kelola tryout"} subtitle={result?.ok ? result.value.course.title : undefined}
    back={active ? () => { setNotice(""); setActiveId(""); } : back}
    backLabel={active ? "Kembali ke tryout" : "Kembali"}>
    {notice ? <AssessmentNotice message={notice} /> : null}
    <ReadState result={result} retry={retry}>{(data) => <>
      {render(data)}
      {modal?.kind === "edit" ? <CourseDialog title={modal.exam ? "Edit tryout" : "Buat tryout"} onClose={close}>
        <TryoutEditor initial={modal.exam} busy={mutation.pending} feedback={feedback} cancel={close}
          save={(input) => mutation.send({ kind: "tryout.save", target: modal.exam ? targetVersion(modal.exam) : null, input }, finished)} />
      </CourseDialog> : null}
      {modal?.kind === "delete" ? <ConfirmAction title="Hapus tryout" message={`Hapus “${modal.exam.title}” beserta soalnya?`}
        confirmLabel="Hapus tryout" destructive busy={mutation.pending} cancel={close}
        confirm={() => mutation.send({ kind: "tryout.delete", target: targetVersion(modal.exam) }, finished)}>{feedback}</ConfirmAction> : null}
      {modal?.kind === "question" ? <CourseDialog title={modal.question ? "Edit soal" : "Tambah soal"} onClose={close}>
        <QuestionEditor bank={false} initial={modal.question} busy={mutation.pending} feedback={feedback} cancel={close}
          order={Math.max(0, ...modal.exam.questions.map((question) => question.order)) + 1}
          save={(input) => mutation.send({
            kind: "tryout.question.save", examId: modal.exam.id,
            target: modal.question ? targetVersion(modal.question) : null, input,
          }, finished)} />
      </CourseDialog> : null}
      {modal?.kind === "deleteQuestion" ? <ConfirmAction title="Hapus soal tryout" message={modal.question.prompt}
        confirmLabel="Hapus soal" destructive busy={mutation.pending} cancel={close}
        confirm={() => mutation.send({ kind: "tryout.question.delete", examId: modal.exam.id, target: targetVersion(modal.question) }, finished)}>
        {feedback}
      </ConfirmAction> : null}
      {modal?.kind === "import" ? <CourseDialog title="Impor dari bank soal" onClose={close}>
        <QuestionPicker bank={data.bank} ids={selected} change={setSelected}
          disabledIds={modal.exam.questions.flatMap((question) => question.bankQuestionId ? [question.bankQuestionId] : [])} />
        {feedback}
        <View style={layout.row}>
          <Action label="Impor soal" onPress={() => mutation.send({ kind: "tryout.question.import", exam: targetVersion(modal.exam), bankIds: selected }, finished)}
            disabled={!selected.length || mutation.pending} variation="default" testID="academic-tryout-import-confirm" />
          <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.pending} />
        </View>
      </CourseDialog> : null}
    </>}</ReadState>
  </AssessmentPage>;
}

function TryoutEditor({ initial, busy, feedback, cancel, save }: {
  initial?: TryoutInput; busy: boolean; feedback: React.ReactNode; cancel(): void; save(value: TryoutInput): void;
}) {
  const [input, setInput] = useState<TryoutInput>(initial ?? {
    title: "", status: "draft", openAt: null, closeAt: null, timeLimitMinutes: 90, maxAttempts: 2,
  });
  const [duration, setDuration] = useState(String(input.timeLimitMinutes));
  const [maxAttempts, setMaxAttempts] = useState(String(input.maxAttempts));
  const [validation, setValidation] = useState("");

  function submit() {
    const value = {
      ...input, title: input.title.trim(), timeLimitMinutes: Number(duration), maxAttempts: Number(maxAttempts),
      openAt: input.openAt?.trim() || null, closeAt: input.closeAt?.trim() || null,
    };
    const issue = !value.title ? "Judul tryout wajib diisi." : dateRangeError(value.openAt, value.closeAt);
    setValidation(issue ?? "");
    if (!issue) save(value);
  }

  return (
    <View style={layout.group}>
      <Field label="Judul tryout" value={input.title} onChangeText={(title) => setInput({ ...input, title })} testID="academic-tryout-title" />
      <SelectField label="Status" options={statuses} value={input.status} change={(status) => setInput({ ...input, status })} />
      <Field label="Durasi dalam menit" keyboardType="number-pad" value={duration} onChangeText={setDuration} />
      <Field label="Batas percobaan" keyboardType="number-pad" value={maxAttempts} onChangeText={setMaxAttempts} />
      <ScheduleFields openAt={input.openAt} closeAt={input.closeAt}
        setOpen={(openAt) => setInput({ ...input, openAt })} setClose={(closeAt) => setInput({ ...input, closeAt })} />
      {validation ? <AssessmentNotice message={validation} error /> : null}
      {feedback}
      <View style={layout.row}>
        <Action label="Simpan tryout" onPress={submit} disabled={busy} variation="default" testID="academic-tryout-save" />
        <Action label="Batal" onPress={cancel} disabled={busy} variation="ghost" />
      </View>
    </View>
  );
}
