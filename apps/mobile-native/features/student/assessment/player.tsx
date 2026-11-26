import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, StyleSheet, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { Answer, AssessmentKind, AssessmentPlayer, AssessmentQuestion, AssessmentRow } from "../../../../../packages/native-parity/student/assessment/contract";
import { Input } from "../../../components/Input";
import { hapticSelection } from "../../../device/haptics";
import { assessmentCoursePath, assessmentRequest, AssessmentRequestError, answered, choice, draftKey, jsonBody, pkaReturnPath, playerDeadline, quizAttemptPath, remaining, restoreAssessmentDraft, toTryoutAnswers, type AssessmentDraft } from "./client";
import { Body, Busy, Button, ButtonRow, fill, Frame, Heading, Markdown, Message, Section, styles, useAssessment, useAssessmentColors, useAssessmentCopy } from "./ui";

function secondsLabel(value: number) {
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function assessmentText(answer: Answer | undefined) {
  return typeof answer === "string" ? { text: answer } : typeof answer === "object" && !Array.isArray(answer) ? answer : { text: "" };
}

export function AssessmentPlay({ player, assessment, kind, attemptId }: {
  player: AssessmentPlayer; assessment: AssessmentRow; kind: AssessmentKind; attemptId?: string;
}) {
  const props = useAssessment();
  const { request, drafts, route, replace, pickAssessmentFile } = props;
  const { messages, tx, tryout } = useAssessmentCopy();
  const colors = useAssessmentColors();
  const course = assessmentCoursePath(route);
  const base = `${course}/${kind}/${encodeURIComponent(assessment.id)}`;
  const storageKey = draftKey(kind, route.params.id, attemptId ?? assessment.id);
  const stage = route.params.id === "tutorial-pka" ? pkaReturnPath(route.query.pkaStage) : undefined;
  const pendingRequest = useRef(false);
  const writing = useRef<Promise<boolean>>(Promise.resolve(true));
  const state = useRef<AssessmentDraft | null>(null);
  const alive = useRef(false);
  const auto = useRef(false);
  const [draft, setDraft] = useState<AssessmentDraft | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [readRevision, setReadRevision] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInProgress = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [map, setMap] = useState(false);

  const update = useCallback((next: AssessmentDraft) => {
    state.current = next;
    setDraft(next);
    if (!drafts) return Promise.resolve(true);
    const result = writing.current.then(() => drafts.set(storageKey, JSON.stringify(next))).then(() => true, () => false);
    writing.current = result;
    return result.then((saved) => {
      if (alive.current) setStorageError(!saved);
      return saved;
    });
  }, [drafts, storageKey]);

  useEffect(() => {
    let mounted = true;
    alive.current = true;
    setReadError(false);
    const restore = (raw: string | null) => {
      if (!mounted) return;
      const next = restoreAssessmentDraft(raw, player, randomUUID, Date.now());
      void update(next.pending && kind === "tryout" && !next.frozenAnswers ? { ...next, frozenAnswers: toTryoutAnswers(player.questions, next.answers) } : next);
    };
    void (drafts?.get(storageKey) ?? Promise.resolve(null)).then(restore, () => { if (mounted) setReadError(true); });
    const subscription = AppState.addEventListener("change", (visibility) => { if (visibility === "active") setNow(Date.now()); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted = false; alive.current = false; subscription.remove(); clearInterval(timer); };
  }, [drafts, kind, player, readRevision, storageKey, update]);

  const submit = useCallback(async () => {
    const current = state.current;
    if (!current || pendingRequest.current || uploadInProgress.current) return;
    pendingRequest.current = true;
    setBusy(true);
    setConfirm(false);
    setSubmitError("");
    const frozen = kind === "tryout" ? current.frozenAnswers ?? toTryoutAnswers(player.questions, current.answers) : undefined;
    try {
      if (!await update({ ...current, pending: true, frozenAnswers: frozen })) {
        state.current = current;
        if (alive.current) {
          setDraft(current);
          setSubmitError(tx("Simpan draf lalu coba kirim lagi.", "Save the draft, then retry submission."));
        }
        return;
      }
      if (!alive.current) return;
      let destination = `${course}/my-results`;
      if (kind === "quiz" && attemptId) {
        const durationSeconds = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
        const body = await assessmentRequest<{ attemptId: string; status: string }>(request, `${base}/attempt/${encodeURIComponent(attemptId)}`, jsonBody({ answers: current.answers, durationSeconds }));
        if (body.status !== "completed" || body.attemptId !== attemptId) throw new Error("Invalid quiz receipt");
        destination = stage ? `${stage}?attemptId=${encodeURIComponent(attemptId)}` : `${quizAttemptPath(base, attemptId)}&submitted=1`;
      } else {
        const body = await assessmentRequest<{ submissionId?: string; success?: boolean }>(request, base, jsonBody({ requestId: current.requestId, answers: frozen }));
        if (!body.success || !body.submissionId) throw new Error("Invalid tryout receipt");
      }
      await drafts?.remove(storageKey).catch(() => {});
      if (alive.current) replace(destination);
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof AssessmentRequestError && [401, 403, 404].includes(error.status)) {
        setAccessLost(true);
      } else if (error instanceof AssessmentRequestError && (error.status === 400 || error.status === 422)) {
        void update({ ...current, pending: false, frozenAnswers: undefined });
        setSubmitError(error.message || tx("Periksa jawaban dan lampiran.", "Check your answers and attachments."));
      } else {
        setSubmitError(error instanceof AssessmentRequestError && error.status < 500 && error.message
          ? error.message : tx("Pengiriman belum terkonfirmasi. Coba lagi untuk memeriksa jawaban ini.", "Submission is unconfirmed. Retry to check these answers."));
      }
    } finally {
      pendingRequest.current = false;
      if (alive.current) setBusy(false);
    }
  }, [attemptId, base, course, drafts, kind, player.questions, replace, request, stage, storageKey, tx, update]);

  const totalEnd = draft ? playerDeadline(player, draft.startedAt) : null;
  const totalLeft = totalEnd === null ? null : remaining(totalEnd, now);
  const question = draft ? player.questions[draft.index] : undefined;
  const questionDuration = question ? player.perQuestionSeconds?.[question.id] : undefined;
  const questionLeft = questionDuration && draft ? remaining(draft.enteredAt + questionDuration * 1000, now) : null;

  useEffect(() => {
    if (totalLeft !== 0 || !draft || uploading || auto.current || draft.pending) return;
    auto.current = true;
    setNotice(kind === "quiz" ? tx("Waktu kuis habis.", "Quiz time expired.") : tryout.timeExpired);
    void submit();
  }, [draft, kind, submit, totalLeft, tryout.timeExpired, tx, uploading]);

  useEffect(() => {
    if (!draft || draft.pending || questionLeft !== 0 || totalLeft === 0 || confirm || uploading) return;
    if (draft.index < player.questions.length - 1) {
      setNotice(messages.quiz.questionTimeEnded);
      update({ ...draft, index: draft.index + 1, enteredAt: Date.now() });
    } else {
      setNotice(messages.quiz.questionTimeEndedFinal);
    }
  }, [confirm, draft, messages.quiz.questionTimeEnded, messages.quiz.questionTimeEndedFinal, player.questions.length, questionLeft, totalLeft, update, uploading]);

  if (accessLost) return <Frame title={tx("Asesmen tidak tersedia", "Assessment unavailable")}>
    <Message title={tx("Akses asesmen perlu diperiksa kembali", "Assessment access needs to be checked again")}
      action={tx("Kembali ke daftar", "Back to list")} onPress={() => replace(`${course}/${kind}`)} error />
  </Frame>;
  if (readError) return <Frame title={assessment.title}><Message title={tx("Draf belum dapat dibuka", "Could not open the draft")}
    action={tx("Coba lagi", "Try again")} onPress={() => setReadRevision((value) => value + 1)} error /></Frame>;
  if (!draft) return <Frame title={assessment.title}><Busy /></Frame>;
  if (!question) return <Frame title={assessment.title}><Message title={tx("Soal belum tersedia", "Questions unavailable")} /></Frame>;

  const count = player.questions.filter(({ id }) => answered(draft.answers[id])).length;
  const blocked = busy || draft.pending || uploading || totalLeft === 0;
  const value = draft.answers[question.id];
  const text = assessmentText(value);
  const isQuiz = kind === "quiz";
  const answerLabel = question.type === "essay" ? (isQuiz ? messages.quiz.essayLabel : tryout.essayAnswer) : (isQuiz ? messages.quiz.shortAnswerLabel : tryout.shortAnswer);
  function setText(item: AssessmentQuestion, answer: string) {
    changeAnswer(item.id, isQuiz && item.type === "short_answer" ? answer : { ...assessmentText(state.current?.answers[item.id]), text: answer });
  }

  function selectQuestion(next: number) {
    const current = state.current;
    if (!current || blocked || next < 0 || next >= player.questions.length || (!player.canGoBack && next < current.index)) return;
    if (next === current.index) { setMap(false); return; }
    update({ ...current, index: next, enteredAt: Date.now() });
    setMap(false);
    setNotice("");
  }

  function changeAnswer(id: string, answer: Answer) {
    const current = state.current;
    if (!current || current.pending) return;
    update({ ...current, answers: { ...current.answers, [id]: answer } });
  }

  async function attach(currentQuestion: AssessmentQuestion) {
    if (!pickAssessmentFile || blocked || uploadInProgress.current) return;
    const local = state.current;
    if (!local) return;
    uploadInProgress.current = true;
    setUploading(true);
    setNotice("");
    try {
      const file = await pickAssessmentFile();
      if (!file || !alive.current) return;
      if (file.size !== undefined && file.size > (kind === "quiz" ? 4 : 10) * 1024 * 1024) {
        setNotice(tx("Ukuran berkas melebihi batas.", "The file exceeds the size limit."));
        return;
      }
      const data = new FormData();
      data.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      const params = new URLSearchParams({ questionId: currentQuestion.id, ...(attemptId ? { attemptId } : { requestId: local.requestId }) });
      const result = await assessmentRequest<{ key?: string; fileName?: string; fileSize?: string; receipt?: string }>(request, `${base}/attachment?${params}`, { method: "POST", body: data });
      if (!result.key || !result.fileName) throw new Error("Invalid attachment receipt");
      if (alive.current) changeAnswer(currentQuestion.id, {
        ...assessmentText(state.current?.answers[currentQuestion.id]),
        fileName: result.fileName, fileSize: result.fileSize, fileKey: result.key, receipt: result.receipt,
      });
    } catch {
      if (alive.current) setNotice(tryout.uploadFailed);
    } finally {
      uploadInProgress.current = false;
      if (alive.current) setUploading(false);
    }
  }

  async function remove(currentQuestion: AssessmentQuestion) {
    if (blocked || uploadInProgress.current) return;
    const currentText = assessmentText(state.current?.answers[currentQuestion.id]);
    if (!currentText.fileKey) return;
    uploadInProgress.current = true;
    setUploading(true);
    try {
      if (attemptId) await assessmentRequest(request, `${base}/attachment?attemptId=${encodeURIComponent(attemptId)}`, jsonBody({ fileKey: currentText.fileKey }, "DELETE"));
      if (alive.current) changeAnswer(currentQuestion.id, { text: currentText.text });
    } catch {
      if (alive.current) setNotice(tx("Lampiran belum dapat dihapus. Coba lagi.", "Could not remove the attachment. Try again."));
    } finally {
      uploadInProgress.current = false;
      if (alive.current) setUploading(false);
    }
  }

  function requestSubmit() {
    if (blocked) return;
    if (player.requireAllAnswered && count < player.questions.length) {
      setNotice(tx("Lengkapi semua jawaban sebelum mengumpulkan.", "Answer all questions before submitting."));
      return;
    }
    setConfirm(true);
  }

  return <Frame title={assessment.title} subtitle={kind === "tryout" ? tryout.examSimulation : undefined}>
    <ButtonRow>
      <Body>{fill(tryout.questionProgress, { current: draft.index + 1, total: player.questions.length })}</Body>
      {totalLeft !== null ? <Body tone={totalLeft <= 60 ? "error" : "primary"}>{tryout.timeRemaining} {secondsLabel(totalLeft)}</Body> : null}
      {questionLeft !== null ? <Body tone="muted">{tx("Sisa waktu soal", "Question time remaining")} {secondsLabel(questionLeft)}</Body> : null}
    </ButtonRow>
    <Section border>
      {question.sourceEventName ? <Body tone="muted">{question.sourceEventName}</Body> : null}
      <Markdown value={question.prompt} />
      {question.options.length && (question.type === "multiple_choice" || question.type === "multiple_choices") ? <>
        <Body tone="muted">{question.type === "multiple_choices" ? tryout.chooseAll : tryout.chooseOne}</Body>
        {question.options.map((option, index) => {
          const selected = value === index || (Array.isArray(value) && value.includes(index));
          return <Pressable key={index} testID={`student-assessment-option-${index}`} accessibilityRole={question.type === "multiple_choice" ? "radio" : "checkbox"}
            accessibilityLabel={`${String.fromCharCode(65 + index)}. ${option}`} accessibilityState={{ checked: selected, disabled: blocked }}
            disabled={blocked} style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}16` : colors.background }]}
            onPress={() => {
              void hapticSelection();
              changeAnswer(question.id, choice(state.current?.answers[question.id], index, question.type === "multiple_choices"));
            }}>
            <Body tone={selected ? "primary" : "normal"}>{String.fromCharCode(65 + index)}</Body><View style={styles.rowText}><Markdown value={option} /></View>
          </Pressable>;
        })}
      </> : question.type === "short_answer" || question.type === "essay" ? <>
        <Body>{answerLabel}</Body>
        <Input testID="student-assessment-answer" value={text.text} accessibilityLabel={answerLabel}
          onChangeText={(answer) => setText(question, answer)}
          placeholder={question.type === "essay" ? (isQuiz ? messages.quiz.essayPlaceholder : tryout.essayPlaceholder) : (isQuiz ? messages.quiz.shortAnswerPlaceholder : tryout.shortAnswerPlaceholder)} multiline={question.type === "essay"} maxLength={20_000} disabled={blocked} />
        <ButtonRow>{["π", "√", "∞", "±", "≤", "≥"].map((symbol) => <Button key={symbol} size="sm" variant="outline" disabled={blocked}
          accessibilityLabel={`${tx("Sisipkan", "Insert")} ${symbol}`} onPress={() => setText(question, `${text.text}${symbol}`.slice(0, 20_000))}>{symbol}</Button>)}</ButtonRow>
        {text.fileName ? <ButtonRow><Body>{text.fileName}{text.fileSize ? ` · ${text.fileSize}` : ""}</Body><Button size="sm" variant="ghost" disabled={blocked} onPress={() => void remove(question)}>{tryout.removeAttachment}</Button></ButtonRow> : null}
        {pickAssessmentFile && (question.acceptsFile || question.acceptsImage) && !text.fileName ? <Button variant="outline" size="sm" isLoading={uploading} disabled={blocked} onPress={() => void attach(question)}>{tx("Pilih lampiran", "Choose attachment")}</Button> : null}
      </> : null}
    </Section>
    <ButtonRow>
      <Button variant="outline" size="sm" disabled={blocked} accessibilityState={{ selected: Boolean(draft.flags[question.id]) }} onPress={() => update({ ...draft, flags: { ...draft.flags, [question.id]: !draft.flags[question.id] } })}>
        {draft.flags[question.id] ? tx("Hapus tanda ragu-ragu", "Clear mark") : tryout.markUnsure}
      </Button>
      <Button variant="outline" size="sm" onPress={() => setMap(!map)} accessibilityState={{ expanded: map }}>{tryout.questionNavigation}</Button>
    </ButtonRow>
    {map ? <ButtonRow>{player.questions.map((entry, index) => {
      const selected = index === draft.index;
      const marked = draft.flags[entry.id];
      const done = answered(draft.answers[entry.id]);
      const unavailable = blocked || (!player.canGoBack && index < draft.index);
      return <Pressable key={entry.id} disabled={unavailable} onPress={() => selectQuestion(index)} accessibilityRole="button"
        accessibilityLabel={`${index + 1}, ${marked ? tryout.unsure : done ? tryout.answered : tryout.unanswered}`} accessibilityState={{ selected, disabled: unavailable }}
        style={[styles.questionNumber, { borderColor: selected ? colors.primary : colors.border, backgroundColor: marked ? `${colors.accent}26` : done ? `${colors.primary}16` : colors.background }]}>
        <Body>{index + 1}</Body>
      </Pressable>;
    })}</ButtonRow> : null}
    <Body tone="muted">{count}/{player.questions.length} {tryout.answered}</Body>
    {storageError ? <Message title={tx("Draf belum tersimpan di perangkat", "The draft could not be saved on this device")}
      action={tx("Coba simpan lagi", "Retry saving")} onPress={() => { if (state.current) void update(state.current); }} error /> : null}
    {notice ? <View accessibilityLiveRegion="polite"><Body tone="muted">{notice}</Body></View> : null}
    {submitError ? <View accessibilityLiveRegion="assertive"><Body tone="error">{submitError}</Body></View> : null}
    <ButtonRow>
      {player.canGoBack ? <Button size="sm" variant="outline" disabled={blocked || draft.index === 0} onPress={() => selectQuestion(draft.index - 1)}>{tryout.previous}</Button> : null}
      {draft.index < player.questions.length - 1 ? <Button size="sm" disabled={blocked} onPress={() => selectQuestion(draft.index + 1)}>{tryout.next}</Button> : null}
      {draft.pending || totalLeft === 0 ? <Button testID="student-assessment-retry" isLoading={busy} disabled={uploading} onPress={() => void submit()}>{tx("Coba kirim lagi", "Retry submission")}</Button>
        : <Button variant="secondary" testID="student-assessment-submit" disabled={blocked} onPress={requestSubmit}>{isQuiz ? messages.quiz.submitAnswers : tryout.submitAnswers}</Button>}
    </ButtonRow>
    <Modal transparent visible={confirm} animationType="none" onRequestClose={() => setConfirm(false)}>
      <View style={dialog.overlay}>
        <View accessibilityViewIsModal style={[dialog.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Heading>{isQuiz ? messages.quiz.confirmSubmitTitle : tryout.confirmTitle}</Heading>
          <Body>{isQuiz ? messages.quiz.cannotEditAfterSubmit : tryout.confirmDescription}</Body>
          {count < player.questions.length ? <Body tone="muted">{fill(tryout.unansweredWarning, { count: player.questions.length - count })}</Body> : null}
          <ButtonRow><Button variant="outline" onPress={() => setConfirm(false)}>{tryout.reviewAgain}</Button><Button testID="student-assessment-confirm" onPress={() => void submit()}>{tryout.confirmSubmit}</Button></ButtonRow>
        </View>
      </View>
    </Modal>
  </Frame>;
}

const dialog = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: 16, backgroundColor: "#00000070" },
  panel: { borderWidth: 1, borderRadius: 10, padding: 16, gap: 12, maxWidth: 520, width: "100%", alignSelf: "center" },
});
