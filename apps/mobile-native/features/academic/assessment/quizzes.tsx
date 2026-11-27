import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  canEditQuiz, commaList, defaultQuiz, difficulties, questionTypes, quizCategories, targetVersion,
  type AssessmentContext, type AssessmentGateway, type AssessmentQuiz, type BankQuestion, type MutationEffect, type QuizCollection,
} from "../../../../../packages/native-parity/academic/assessment";
import { Action, CourseDialog, DataRow, Ink, SearchBox, Tabs, layout } from "../courses/ui";
import type { AcademicScreenProps } from "../contracts";
import { QuizEditor } from "./editor";
import { QuestionContent, QuestionEditor } from "./question-editor";
import { AssessmentNotice, AssessmentPage, ConfirmAction, MutationProblem, Pagination, ReadState, SectionRow, SelectField, useMutation, useRead } from "./ui";

type Props = AcademicScreenProps & { gateway: AssessmentGateway; context: AssessmentContext; base: string };
type QuizMode = "list" | "new" | "edit";
type QuizRowAction = { kind: "preview" | "delete"; quiz: AssessmentQuiz };
type BankAction = { kind: "edit"; question?: BankQuestion } | { kind: "delete" | "view"; question: BankQuestion };
const tabs = [{ id: "quizzes", label: "Kuis" }, { id: "bank", label: "Bank soal" }] as const;
const pageSize = 8;

export function Quizzes({ mode, gateway, context, base, params, query, navigate, back, replace }: Props & { mode: QuizMode }) {
  const { result, retry } = useRead(useCallback((signal: AbortSignal) => gateway.listQuizzes(context, signal), [gateway, context]));
  const mutation = useMutation(gateway, context);
  const [message, setMessage] = useState("");
  const savedId = query.saved;
  useEffect(() => {
    if (mode !== "list" || !savedId) return;
    const notice = gateway.takeQuizSaveNotice?.(context, savedId);
    if (notice) setMessage(notice);
  }, [context, gateway, mode, savedId]);
  const isTutor = context.scope.kind === "tutor";
  const quizPath = `${base}/quizzes`;
  const quizId = isTutor ? params.templateId : params.id;
  const quiz = mode === "edit" && result?.ok ? result.value.quizzes.find((entry) => entry.id === quizId) : undefined;
  const title = { list: "Kelola kuis", new: "Buat kuis", edit: "Edit kuis" }[mode];
  const subtitle = result?.ok ? result.value.course.title : undefined;

  function refreshed(effect: MutationEffect) {
    setMessage(effect.message);
    retry();
  }

  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>(query.tab === "bank" ? "bank" : "quizzes");
  const [search, setSearch] = useState(query.search ?? "");
  const [category, setCategory] = useState<keyof typeof quizCategories | "all">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<QuizRowAction | null>(null);
  const [bankAction, setBankAction] = useState<BankAction | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankPage, setBankPage] = useState(0);
  const bankRecovery = gateway.pendingBankWrite?.(context);
  const recoveringBank = Boolean(bankRecovery) && mutation.problem?.code === "unavailable";

  function finishBank(effect: MutationEffect, requestId: string) {
    gateway.confirmBankWrite?.(context, requestId);
    setBankAction(null);
    setTab("bank");
    refreshed(effect);
  }

  function closeBank() {
    if (mutation.pending) return;
    mutation.reset();
    setBankAction(null);
  }

  function reload() {
    mutation.reset();
    setSelected(null);
    setBankAction(null);
    retry();
  }

  function list(data: QuizCollection) {
    const canWriteBank = isTutor && (gateway.canMutate || (gateway.canWriteBank && data.canWriteBank));
    const bankTarget = (question: BankQuestion) => ({ ...targetVersion(question), bankRevision: question.bankRevision });
    const filtered = data.quizzes.filter((entry) => (category === "all" || category === entry.category)
      && `${entry.title} ${entry.creatorName}`.toLowerCase().includes(search.trim().toLowerCase()));
    const shownPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
    const bank = data.bank.filter((question) => [question.prompt, ...question.tags].join(" ").toLowerCase().includes(bankSearch.trim().toLowerCase()));
    const displayedBankPage = Math.min(bankPage, Math.max(0, Math.ceil(bank.length / pageSize) - 1));
    return <>
      {isTutor ? <Tabs<(typeof tabs)[number]["id"]> options={tabs} selected={tab} onSelect={setTab} testID="academic-quizzes-tab" /> : null}
      {bankRecovery && !bankAction && !mutation.pending ? <AssessmentNotice
        message={bankRecovery.confirmed ? "Perubahan bank soal tersimpan." : "Hasil perubahan bank soal belum diketahui."}
        error={!bankRecovery.confirmed}
        action={<Action label={bankRecovery.confirmed ? "Muat bank soal" : "Coba lagi"}
          onPress={() => mutation.resume(bankRecovery.requestId, bankRecovery.command, finishBank)} testID="academic-bank-recover" />}
      /> : null}
      {tab === "quizzes" || !isTutor ? <>
        <View style={layout.row}>
          {gateway.canSaveQuiz ? <Action label="Buat kuis" variation="default" testID="academic-quiz-new" onPress={() => navigate(`${quizPath}/new`)} /> : null}
          {isTutor ? <Action label="Penilaian kuis" testID="academic-quiz-grading" onPress={() => navigate(`${quizPath}/grading`)} /> : null}
        </View>
        <SearchBox label="Cari kuis" value={search} onChange={(value) => { setSearch(value); setPage(0); }} testID="academic-quiz-search" />
        <SelectField label="Kategori" options={{ all: "Semua kategori", ...quizCategories }}
          value={category} change={(value) => { setCategory(value); setPage(0); }} />
        {!filtered.length ? <AssessmentNotice message={search || category !== "all" ? "Kuis yang cocok tidak ditemukan." : "Belum ada kuis."} /> : null}
        {filtered.slice(shownPage * pageSize, (shownPage + 1) * pageSize).map((entry) => {
          const editable = canEditQuiz(context.scope.kind, entry);
          return <SectionRow key={entry.id} testID={`academic-quiz-row-${entry.id}`}>
            <Ink kind="heading">{entry.title}</Ink>
            <Ink kind="meta" tone="muted">{quizCategories[entry.category]} · {entry.status === "published" ? "Terbit" : "Draf"} · {entry.creatorName}</Ink>
            <View style={layout.row}>
              <Action label="Pratinjau" onPress={() => setSelected({ kind: "preview", quiz: entry })} />
              {isTutor ? <Action label="Hasil" onPress={() => navigate(`${quizPath}/${entry.id}/attempts`)} testID={`academic-quiz-attempts-${entry.id}`} /> : (
                <Action label="Analitik" onPress={() => navigate(`${base}/analytics/${entry.id}`)} />
              )}
              {gateway.canSaveQuiz && editable ? <Action label="Edit" onPress={() => navigate(`${quizPath}/${entry.id}/edit`)} testID={`academic-quiz-edit-${entry.id}`} /> : null}
              {gateway.canSaveQuiz && editable && isTutor ? <Action label={entry.status === "published" ? "Jadikan draf" : "Terbitkan"}
                disabled={mutation.pending} onPress={() => mutation.send({
                  kind: "quiz.status", target: targetVersion(entry), status: entry.status === "published" ? "draft" : "published",
                  courseId: data.course.id,
                }, refreshed)} /> : null}
              {gateway.canSaveQuiz && editable ? <Action label="Hapus" variation="ghost"
                onPress={() => { mutation.reset(); setSelected({ kind: "delete", quiz: entry }); }} /> : null}
              {!editable ? <Ink kind="meta" tone="muted">Dikelola admin</Ink> : null}
            </View>
          </SectionRow>;
        })}
        <Pagination page={shownPage} count={filtered.length} size={pageSize} change={setPage} />
      </> : <>
        {canWriteBank ? <View style={layout.row}>
          <Action label="Tambah soal" variation="default" testID="academic-bank-add" disabled={Boolean(bankRecovery) || mutation.pending} onPress={() => { mutation.reset(); setBankAction({ kind: "edit" }); }} />
        </View> : null}
        <SearchBox label="Cari di bank soal" value={bankSearch} onChange={(value) => { setBankSearch(value); setBankPage(0); }} />
        {!bank.length ? <AssessmentNotice message={bankSearch ? "Soal yang cocok tidak ditemukan." : "Bank soal masih kosong."} /> : null}
        {bank.slice(displayedBankPage * pageSize, (displayedBankPage + 1) * pageSize).map((question) => (
          <SectionRow key={question.id}>
            <DataRow title={question.prompt} description={`${questionTypes[question.type]} · ${difficulties[question.difficulty]}`}
              onPress={() => setBankAction({ kind: "view", question })} />
            <View style={layout.row}>
              {question.origin === "zyx_original" && canWriteBank && (gateway.canMutate || question.bankRevision) ? <>
                <Action label="Edit" disabled={Boolean(bankRecovery) || mutation.pending} testID={`academic-bank-edit-${question.id}`}
                  onPress={() => { mutation.reset(); setBankAction({ kind: "edit", question }); }} />
                <Action label="Hapus" variation="ghost" disabled={Boolean(bankRecovery) || mutation.pending} testID={`academic-bank-delete-${question.id}`}
                  onPress={() => { mutation.reset(); setBankAction({ kind: "delete", question }); }} />
              </> : question.origin !== "zyx_original" ? <Ink kind="meta" tone="muted">Referensi historis</Ink> : null}
            </View>
          </SectionRow>
        ))}
        <Pagination page={displayedBankPage} count={bank.length} size={pageSize} change={setBankPage} />
      </>}
      {selected?.kind === "preview" ? <QuizPreview gateway={gateway} context={context} quiz={selected.quiz} close={() => setSelected(null)} /> : null}
      {selected?.kind === "delete" ? <ConfirmAction title="Hapus kuis" message={`Kuis “${selected.quiz.title}” beserta hasil percobaannya akan dihapus.`} confirmLabel="Hapus kuis"
        destructive busy={mutation.pending} cancel={() => { mutation.reset(); setSelected(null); }}
        confirm={() => mutation.send({ kind: "quiz.delete", target: targetVersion(selected.quiz), courseId: data.course.id }, (effect) => { setSelected(null); refreshed(effect); })}>
        <MutationProblem mutation={mutation} reload={reload} />
      </ConfirmAction> : null}
      {bankAction ? <CourseDialog title={bankAction.kind === "view" ? "Detail soal" : bankAction.kind === "delete" ? "Hapus soal" : bankAction.question ? "Edit soal" : "Tambah soal"}
        onClose={closeBank}>
        {bankAction.kind === "view" ? <QuestionContent question={bankAction.question} /> : null}
        {bankAction.kind === "edit" ? <QuestionEditor bank initial={bankAction.question} busy={mutation.pending || recoveringBank}
          feedback={<MutationProblem mutation={mutation} reload={reload} />}
          cancel={closeBank}
          save={(input) => mutation.send({ kind: "bank.save", target: bankAction.question ? bankTarget(bankAction.question) : null,
            input, courseId: data.course.id }, finishBank)} /> : null}
        {bankAction.kind === "delete" ? <>
          <Ink>Hapus soal ini dari bank?</Ink>
          <Ink>{bankAction.question.prompt}</Ink>
          <MutationProblem mutation={mutation} reload={reload} />
          <View style={layout.row}><Action label="Hapus soal" variation="destructive" disabled={mutation.pending || recoveringBank}
            testID="academic-bank-delete-confirm"
            onPress={() => mutation.send({ kind: "bank.delete", target: bankTarget(bankAction.question), courseId: data.course.id }, finishBank)} /></View>
        </> : null}
      </CourseDialog> : null}
      {!selected && !bankAction && !bankRecovery ? <MutationProblem mutation={mutation} reload={reload} /> : null}
    </>;
  }

  return <AssessmentPage title={title} subtitle={subtitle} back={mode === "list" ? back : () => replace(quizPath)} backLabel={mode === "list" ? "Kembali" : "Kembali ke kuis"}>
    {message ? <AssessmentNotice message={message} /> : null}
    <ReadState result={result} retry={retry}>{(data) => {
      if (mode === "list") return list(data);
      if (mode === "edit" && !quiz) return <AssessmentNotice error message="Kuis tidak ditemukan di kursus ini." />;
      const role = context.scope.kind;
      if (quiz && !canEditQuiz(role, quiz)) return <AssessmentNotice error message="Kuis simulasi hanya dapat diubah oleh admin." />;
      const outstanding = gateway.pendingQuizSave?.(context, quiz?.id ?? null);
      const initialValue = outstanding?.command.input ?? quiz ?? defaultQuiz(role, commaList(query.tags ?? ""));
      const finish = (_effect: MutationEffect, requestId: string) => replace(`${quizPath}?saved=${encodeURIComponent(requestId)}`);
      const recovery = outstanding && !mutation.problem && !mutation.pending ? <AssessmentNotice
        error={!outstanding.confirmed}
        message={outstanding.confirmed ? "Kuis sudah tersimpan." : "Hasil penyimpanan belum diketahui."}
        action={<Action label={outstanding.confirmed ? "Kembali ke kuis" : "Coba lagi"} testID="academic-quiz-restore"
          onPress={() => mutation.resume(outstanding.requestId, outstanding.command, finish)} />} /> : null;
      return <QuizEditor initialValue={initialValue} role={role} bank={data.bank} isSaving={mutation.pending || !!outstanding || mutation.problem?.code === "unavailable"}
        feedback={<>{recovery}<MutationProblem mutation={mutation} reload={reload} /></>}
        onCancel={() => replace(quizPath)} onSave={(input) => mutation.send({
          kind: "quiz.save", target: quiz ? targetVersion(quiz) : null, input, courseId: data.course.id,
        }, finish)} />;
    }}</ReadState>
  </AssessmentPage>;
}

function QuizPreview({ gateway, context, quiz, close }: {
  gateway: AssessmentGateway; context: AssessmentContext; quiz: AssessmentQuiz; close(): void;
}) {
  const { result, retry } = useRead(useCallback((signal: AbortSignal) => gateway.previewQuiz(context, quiz.id, signal), [gateway, context, quiz.id]));
  return <CourseDialog title={quiz.title} onClose={close}>
    <ReadState result={result} retry={retry}>{(questions) => questions.length ? questions.map((question) => (
      <SectionRow key={question.id}><QuestionContent question={question} /></SectionRow>
    )) : <AssessmentNotice message="Belum ada soal yang dapat ditampilkan." />}</ReadState>
  </CourseDialog>;
}
