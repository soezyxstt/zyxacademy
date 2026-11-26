import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  maxTryoutBankImport, targetVersion, tryoutDraftValidationError, type AssessmentContext, type AssessmentGateway, type AssessmentTryout,
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
  const recovery = gateway.pendingTryoutDraft?.(context);
  const canSaveMetadata = Boolean(gateway.canSaveTryoutMetadata && result?.ok && result.value.canSaveMetadata);
  const canChangeStatus = gateway.canMutate || canSaveMetadata;
  const canAuthorContent = gateway.canMutate || Boolean(gateway.canManageTryoutContent && result?.ok && result.value.canManageContent);
  const unknownDraft = !gateway.canMutate && Boolean(recovery) && mutation.problem?.code === "unavailable";
  const denial = mutation.problem?.code === "forbidden" ? mutation.problem
    : result && !result.ok && result.code === "forbidden" ? result : null;
  const accessDenied = Boolean(denial);

  useEffect(() => {
    if (!accessDenied) return;
    setModal(null);
    setSelected([]);
    setActiveId("");
    setNotice("");
    setSearch("");
    setListPage(0);
    setQuestionPage(0);
  }, [accessDenied]);

  function close() {
    if (mutation.pending || unknownDraft) return;
    mutation.reset();
    setModal(null);
    setSelected([]);
  }

  function open(action: TryoutAction) {
    mutation.reset();
    setSelected([]);
    setModal(action);
  }

  function finished(effect: MutationEffect, requestId: string) {
    gateway.confirmTryoutDraft?.(context, requestId);
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
      const canManageBank = gateway.canSaveTryoutDraft && active.status === "draft" && Boolean(active.questionSetRevision);
      const canEditQuestions = canAuthorContent && (gateway.canMutate || Boolean(active.authoringRevision));
      return <>
        {canEditQuestions || canManageBank ? <View style={layout.row}>
          {canEditQuestions ? <Action label="Tambah soal" variation="default" disabled={Boolean(recovery)}
            onPress={() => open({ kind: "question", exam: active })} testID="academic-tryout-add-question" /> : null}
          {gateway.canMutate || canManageBank
            ? <Action label="Impor dari bank" disabled={Boolean(recovery)} onPress={() => open({ kind: "import", exam: active })} testID="academic-tryout-import" /> : null}
        </View> : null}
        {!questions.length ? <AssessmentNotice message="Tryout belum memiliki soal." /> : null}
        {questions.slice(shown * pageSize, (shown + 1) * pageSize).map((question) => (
          <SectionRow key={question.id}>
            <Ink kind="meta" tone="muted">Soal {question.order}</Ink>
            <QuestionContent question={question} />
            {question.acceptsFile ? <Ink kind="meta" tone="muted">Menerima lampiran</Ink> : null}
            {canEditQuestions || (canManageBank && question.bankQuestionId) ? <View style={layout.row}>
              {canEditQuestions ? <Action label="Edit" disabled={Boolean(recovery)} testID={`academic-tryout-edit-question-${question.id}`}
                onPress={() => open({ kind: "question", exam: active, question })} /> : null}
              {gateway.canMutate || (canManageBank && question.bankQuestionId)
                ? <Action label="Hapus" variation="ghost" disabled={Boolean(recovery)} onPress={() => open({ kind: "deleteQuestion", exam: active, question })}
                  testID={`academic-tryout-remove-${question.id}`} /> : null}
            </View> : null}
          </SectionRow>
        ))}
        <Pagination page={shown} count={questions.length} size={pageSize} change={setQuestionPage} />
      </>;
    }
    const filtered = data.tryouts.filter((tryout) => tryout.title.toLowerCase().includes(search.trim().toLowerCase()));
    const shown = Math.min(listPage, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
    const canSaveDraft = gateway.canSaveTryoutDraft && data.canSaveDraft !== false;
    return <>
      {canSaveDraft ? <View style={layout.row}><Action label={gateway.canMutate ? "Buat tryout" : "Buat draf tryout"} variation="default" disabled={Boolean(recovery)}
        onPress={() => open({ kind: "edit" })} testID="academic-tryout-new" /></View> : null}
      <SearchBox label="Cari tryout" value={search} onChange={(value) => { setSearch(value); setListPage(0); }} />
      {!filtered.length ? <AssessmentNotice message={search ? "Tryout yang cocok tidak ditemukan." : "Belum ada tryout."} /> : null}
      {filtered.slice(shown * pageSize, (shown + 1) * pageSize).map((exam) => (
        <SectionRow key={exam.id} testID={`academic-tryout-row-${exam.id}`}>
          <Ink kind="heading">{exam.title}</Ink>
          <Ink kind="meta" tone="muted">{statuses[exam.status]} · {exam.questions.length} soal · {exam.timeLimitMinutes} menit · {exam.maxAttempts} percobaan</Ink>
          <View style={layout.row}>
            <Action label={canAuthorContent || (gateway.canSaveTryoutDraft && exam.status === "draft" && exam.questionSetRevision) ? "Kelola soal" : "Lihat soal"} onPress={() => { setNotice(""); setQuestionPage(0); setActiveId(exam.id); }} testID={`academic-tryout-questions-${exam.id}`} />
            {canSaveDraft && (gateway.canMutate || (exam.metadataRevision && (canSaveMetadata || exam.status === "draft")))
              ? <Action label="Edit" disabled={Boolean(recovery)} onPress={() => open({ kind: "edit", exam })} testID={`academic-tryout-edit-${exam.id}`} /> : null}
            {canAuthorContent && (gateway.canMutate || (exam.canDelete && exam.authoringRevision))
              ? <Action label="Hapus" variation="ghost" disabled={Boolean(recovery)} testID={`academic-tryout-delete-${exam.id}`}
                onPress={() => open({ kind: "delete", exam })} /> : null}
          </View>
        </SectionRow>
      ))}
      <Pagination page={shown} count={filtered.length} size={pageSize} change={setListPage} />
    </>;
  }

  if (denial) {
    return <AssessmentPage title="Kelola tryout" back={back} backLabel="Kembali">
      <AssessmentNotice message={denial.message} error
        action={<Action label="Muat ulang" onPress={() => { mutation.reset(); retry(); }} testID="academic-tryout-access-reload" />} />
    </AssessmentPage>;
  }

  const feedback = <MutationProblem mutation={mutation} reload={reload} />;
  return <AssessmentPage title={active?.title ?? "Kelola tryout"} subtitle={result?.ok ? result.value.course.title : undefined}
    back={active ? () => { setNotice(""); setActiveId(""); } : back}
    backLabel={active ? "Kembali ke tryout" : "Kembali"}>
    {notice ? <AssessmentNotice message={notice} /> : null}
    <ReadState result={result} retry={retry}>{(data) => <>
      {recovery && !modal ? <AssessmentNotice
        error={!recovery.confirmed}
        message={recovery.confirmed ? "Perubahan tryout tersimpan." : "Hasil penyimpanan tryout belum diketahui."}
        action={<Action label={recovery.confirmed ? "Muat daftar" : "Coba lagi"} disabled={mutation.pending}
          onPress={() => mutation.resume(recovery.requestId, recovery.command, finished)} testID="academic-tryout-restore" />}
      /> : null}
      {!modal && !recovery && mutation.problem ? feedback : null}
      {render(data)}
      {modal?.kind === "edit" ? <CourseDialog title={modal.exam ? "Edit tryout" : "Buat tryout"} onClose={close}>
        <TryoutEditor initial={modal.exam} canChangeStatus={canChangeStatus} busy={mutation.pending || unknownDraft} feedback={feedback} cancel={close}
          save={(input) => mutation.send({
            kind: canSaveMetadata ? "tryout.metadata.save" : "tryout.save", target: modal.exam ? { ...targetVersion(modal.exam), metadataRevision: modal.exam.metadataRevision } : null,
            input, courseId: data.course.id,
          }, finished)} />
      </CourseDialog> : null}
      {modal?.kind === "delete" ? <ConfirmAction title="Hapus tryout" message={`Hapus “${modal.exam.title}” beserta soalnya?`}
        confirmLabel="Hapus tryout" destructive busy={mutation.pending || unknownDraft} cancel={close}
        confirm={() => mutation.send({ kind: "tryout.delete", target: targetVersion(modal.exam),
          courseId: data.course.id, authoringRevision: modal.exam.authoringRevision }, finished)}>{feedback}</ConfirmAction> : null}
      {modal?.kind === "question" ? <CourseDialog title={modal.question ? "Edit soal" : "Tambah soal"} onClose={close}>
        <QuestionEditor bank={false} initial={modal.question} busy={mutation.pending || unknownDraft} feedback={feedback} cancel={close}
          order={Math.max(0, ...modal.exam.questions.map((question) => question.order)) + 1}
          save={(input) => mutation.send({
            kind: "tryout.question.save", examId: modal.exam.id,
            target: modal.question ? targetVersion(modal.question) : null, input,
            courseId: data.course.id, authoringRevision: modal.exam.authoringRevision,
          }, finished)} />
      </CourseDialog> : null}
      {modal?.kind === "deleteQuestion" ? <ConfirmAction title="Hapus soal tryout" message={modal.question.prompt}
        confirmLabel="Hapus soal" destructive busy={mutation.pending || unknownDraft} cancel={close}
        confirm={() => mutation.send({
          kind: "tryout.question.delete", examId: modal.exam.id, target: targetVersion(modal.question),
          courseId: data.course.id, questionSetRevision: modal.exam.questionSetRevision,
        }, finished)}>
        {feedback}
      </ConfirmAction> : null}
      {modal?.kind === "import" ? <CourseDialog title="Impor dari bank soal" onClose={close}>
        <QuestionPicker bank={data.bank} ids={selected} change={(ids) => { if (!mutation.pending && !unknownDraft) setSelected(ids); }}
          disabledIds={modal.exam.questions.flatMap((question) => question.bankQuestionId ? [question.bankQuestionId] : [])} />
        {!gateway.canMutate && selected.length > maxTryoutBankImport
          ? <AssessmentNotice message={`Pilih maksimal ${maxTryoutBankImport} soal per impor.`} error /> : null}
        {feedback}
        <View style={layout.row}>
          <Action label="Impor soal" onPress={() => mutation.send({
            kind: "tryout.question.import", exam: targetVersion(modal.exam), bankIds: selected,
            courseId: data.course.id, questionSetRevision: modal.exam.questionSetRevision,
          }, finished)}
            disabled={!selected.length || mutation.pending || unknownDraft || (!gateway.canMutate && selected.length > maxTryoutBankImport)}
            variation="default" testID="academic-tryout-import-confirm" />
          <Action label="Batal" variation="ghost" onPress={close} disabled={mutation.pending || unknownDraft} />
        </View>
      </CourseDialog> : null}
    </>}</ReadState>
  </AssessmentPage>;
}

function TryoutEditor({ initial, busy, canChangeStatus, feedback, cancel, save }: {
  initial?: TryoutInput; busy: boolean; canChangeStatus: boolean; feedback: React.ReactNode; cancel(): void; save(value: TryoutInput): void;
}) {
  const [input, setInput] = useState<TryoutInput>(initial ?? {
    title: "", status: "draft", openAt: null, closeAt: null, timeLimitMinutes: 90, maxAttempts: 2,
  });
  const [duration, setDuration] = useState(String(input.timeLimitMinutes));
  const [maxAttempts, setMaxAttempts] = useState(String(input.maxAttempts));
  const [validation, setValidation] = useState("");
  const statusChanged = canChangeStatus && input.status !== (initial?.status ?? "draft");
  const saveLabel = !canChangeStatus ? "Simpan draf" : !statusChanged ? "Simpan tryout"
    : { draft: "Kembalikan ke draf", published: "Terbitkan tryout", ended: "Akhiri tryout" }[input.status];

  function submit() {
    const value = {
      ...input, title: input.title.trim(), timeLimitMinutes: Number(duration), maxAttempts: Number(maxAttempts),
      openAt: input.openAt?.trim() || null, closeAt: input.closeAt?.trim() || null,
    };
    const issue = tryoutDraftValidationError(value);
    setValidation(issue ?? "");
    if (!issue) save(value);
  }

  return (
    <View style={layout.group}>
      <Field label="Judul tryout" value={input.title} editable={!busy} onChangeText={(title) => setInput({ ...input, title })} testID="academic-tryout-title" />
      {canChangeStatus ? <SelectField label="Status" options={statuses} value={input.status} disabled={busy} testID="academic-tryout-status" change={(status) => setInput({ ...input, status })} /> : null}
      <Field label="Durasi dalam menit" keyboardType="number-pad" value={duration} editable={!busy} onChangeText={setDuration} />
      <Field label="Batas percobaan" keyboardType="number-pad" value={maxAttempts} editable={!busy} onChangeText={setMaxAttempts} />
      <ScheduleFields openAt={input.openAt} closeAt={input.closeAt} disabled={busy}
        setOpen={(openAt) => setInput({ ...input, openAt })} setClose={(closeAt) => setInput({ ...input, closeAt })} />
      {validation ? <AssessmentNotice message={validation} error /> : null}
      {feedback}
      <View style={layout.row}>
        <Action label={saveLabel} onPress={submit} disabled={busy} variation="default" testID="academic-tryout-save" />
        <Action label="Batal" onPress={cancel} disabled={busy} variation="ghost" />
      </View>
    </View>
  );
}
