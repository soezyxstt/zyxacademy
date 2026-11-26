import { InteractiveAssessmentMarkdown } from "./InteractiveAssessmentMarkdown";
import { interactiveMarkdownFallback } from "../../../../../lib/materials/interactive-document-display";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { AssessmentPage, AssessmentResult, AssessmentRow, Review, ReviewedQuestion } from "../../../../../packages/native-parity/student/assessment/contract";
import { assessmentCoursePath, assessmentRequest, AssessmentRequestError, assessmentRoutePath, draftKey, isAssessmentRequestId, jsonBody, pkaReturnPath, quizAttemptPath } from "./client";
import { AssessmentPlay } from "./player";
import { ResultsHistory } from "./results-history";
import { QuizGatewayHistory, QuizGatewayIcon, QuizGatewayInstructions, quizGatewayStyles } from "./quiz-gateway-layout";
import { Body, Button, ButtonRow, Fact, fill, Frame, Heading, Markdown, Message, Row, Section, styles, useAssessment, useAssessmentColors, useAssessmentCopy } from "./ui";

function useCourse() { return assessmentCoursePath(useAssessment().route); }

function Activation({ detail }: { detail: string }) {
  const { navigate } = useAssessment();
  const course = useCourse();
  const { messages } = useAssessmentCopy();
  return <Message title={messages.quizPage.activationTitle} detail={detail} action={messages.documents.activateAccess} onPress={() => navigate(course)} />;
}

function useResultCopy() {
  const { messages } = useAssessmentCopy();
  const statuses: Record<string, string> = { completed: messages.results.status.completed, pending_review: messages.results.status.pendingReview,
    graded: messages.results.status.graded, late: messages.results.status.late };
  return { status: (item: AssessmentResult) => statuses[item.status] ?? item.status,
    score: (item: AssessmentResult) => item.score === null ? statuses[item.status] ?? messages.results.pending : `${item.score}%` };
}

function rowMetadata(row: AssessmentRow, tx: ReturnType<typeof useAssessmentCopy>["tx"]) {
  const duration = row.durationSeconds === null ? tx("Tanpa batas", "No time limit") : tx(`${Math.round(row.durationSeconds / 60)} menit`, `${Math.round(row.durationSeconds / 60)} min`);
  return [row.questionCount === null ? "" : tx(`${row.questionCount} soal`, `${row.questionCount} ${row.questionCount === 1 ? "question" : "questions"}`), duration].filter(Boolean).join(" · ");
}

export function AssessmentList({ data }: { data: Extract<AssessmentPage, { rows: AssessmentRow[] }> }) {
  const { route, navigate, replace } = useAssessment();
  const course = useCourse();
  const { messages, tx, date } = useAssessmentCopy();
  const kind = data.kind === "quiz-list" ? "quiz" : "tryout";
  const activeFilter = route.query.access === "premium" || route.query.access === "free" ? route.query.access : "all";
  return <Frame title={fill(kind === "quiz" ? messages.quizPage.title : messages.tryoutPage.title, { course: data.courseTitle })}>
    {kind === "quiz" ? <ButtonRow>{(["all", "free", "premium"] as const).map((filter) => <Button key={filter} size="sm" variant={filter === activeFilter ? "default" : "outline"}
      accessibilityRole="tab" accessibilityState={{ selected: filter === activeFilter }} onPress={() => replace(`${course}/quiz${filter === "all" ? "" : `?access=${filter}`}`)}>{messages.quizPage.filters[filter]}</Button>)}</ButtonRow> : null}
    {!data.fullAccess ? <Activation detail={kind === "quiz" ? messages.quizPage.activationDescription : messages.tryoutPage.activationDescription} /> : null}
    {data.rows.length === 0 ? kind === "quiz" ? <Message title={messages.quizList.emptyTitle} detail={messages.quizList.emptyDescription} />
      : <Message title={messages.tryoutList.emptyTitle} detail={messages.tryoutList.emptyDescription} action={messages.tryoutList.practiceWithQuiz} onPress={() => navigate(`${course}/quiz`)} /> : null}
    <View>{data.rows.map((row) => {
      const limitReached = row.maxAttempts !== null && row.attempts >= row.maxAttempts && !row.activeAttemptId;
      const trailing = row.availability === "locked" ? messages.quizList.locked : row.availability === "closed" ? (row.discussionAvailable ? messages.quizList.discussion : messages.quizList.closed)
        : row.availability === "upcoming" ? messages.quizList.notOpen : limitReached ? messages.tryoutList.attemptLimitReached : row.activeAttemptId ? messages.quizList.continue : messages.quizList.start;
      const schedule = row.availability === "upcoming" ? row.openAt : row.availability === "closed" ? row.closeAt : null;
      const description = [rowMetadata(row, tx), row.visibility === "free" && row.availability !== "locked" ? messages.quizList.free : "",
        row.bestScore !== undefined ? fill(messages.quizList.score, { score: row.bestScore }) : "", schedule ? date(schedule) : ""].filter(Boolean).join(" · ");
      const href = `${course}/${kind}/${encodeURIComponent(row.id)}${row.availability === "closed" && row.discussionAvailable ? "?viewDiscussion=true" : ""}`;
      return <Row key={row.id} testID={`student-assessment-${row.id}`} title={row.title} description={description} trailing={trailing} onPress={() => navigate(href)} />;
    })}</View>
  </Frame>;
}

export function ResultsPage({ data }: { data: Extract<AssessmentPage, { kind: "results" }> }) {
  const { navigate } = useAssessment();
  const course = useCourse();
  const { messages } = useAssessmentCopy();
  const { status } = useResultCopy();
  return <Frame title={fill(messages.results.title, { course: data.courseTitle })}>
    {data.fullAccess ? <ResultsHistory results={data.results} status={status}
      openResult={id => navigate(`${course}/my-results/${encodeURIComponent(id)}`)}
      startPractice={() => navigate(`${course}/quiz`)} /> : <Activation detail={messages.results.activateToView} />}
  </Frame>;
}

function AvailabilityMessage({ assessment, kind }: { assessment: AssessmentRow; kind: "quiz" | "tryout" }) {
  const { messages, tx, date } = useAssessmentCopy();
  if (assessment.stageLocked) return <Message title={tx("Tahap simulasi belum tersedia", "Simulation stage unavailable")} />;
  if (assessment.availability === "locked") return <Activation detail={fill(messages.tryoutTake.activateToOpen, { exam: assessment.title })} />;
  if (assessment.availability === "closed") return <Message title={kind === "quiz" ? messages.quizTake.closed : messages.tryoutTake.closed} detail={date(assessment.closeAt) || undefined} />;
  if (assessment.availability === "upcoming") return <Message title={kind === "quiz" ? messages.quizTake.notOpen : messages.tryoutTake.notOpen} detail={date(assessment.openAt) || undefined} />;
  if (assessment.maxAttempts !== null && assessment.attempts >= assessment.maxAttempts && !assessment.activeAttemptId) return <Message title={messages.tryoutList.attemptLimitReached} />;
  if (assessment.questionCount === 0) return <Message title={tx("Soal belum tersedia", "Questions unavailable")} />;
  return null;
}

function QuizGateway({ data }: { data: Extract<AssessmentPage, { kind: "quiz-detail" }> }) {
  const { route, request, drafts, navigate, replace } = useAssessment();
  const course = useCourse();
  const { messages, tx } = useAssessmentCopy();
  const { assessment, history } = data;
  const base = `${course}/quiz/${encodeURIComponent(assessment.id)}`;
  const stage = route.params.id === "tutorial-pka" ? pkaReturnPath(route.query.pkaStage) : undefined;
  const key = draftKey("start", route.params.id, assessment.id);
  const requestKey = useRef<string | null>(null);
  const working = useRef(false);
  const mounted = useRef(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(drafts));
  const [draftReadError, setDraftReadError] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    setDraftReadError(false);
    setLoadingDraft(Boolean(drafts));
    void drafts?.get(key).then((value) => {
      if (mounted.current && isAssessmentRequestId(value)) { requestKey.current = value; setPending(true); }
    }).catch(() => { if (mounted.current) setDraftReadError(true); }).finally(() => { if (mounted.current) setLoadingDraft(false); });
    return () => { mounted.current = false; };
  }, [drafts, draftRevision, key]);

  async function begin() {
    if (working.current || loadingDraft || draftReadError) return;
    working.current = true;
    setBusy(true);
    setError("");
    const requestId = requestKey.current ?? randomUUID();
    requestKey.current = requestId;
    setPending(true);
    try {
      try { await drafts?.set(key, requestId); }
      catch {
        if (mounted.current) setError(tx("Percobaan belum dapat disimpan. Coba lagi.", "Could not save this attempt. Try again."));
        return;
      }
      if (!mounted.current) return;
      const receipt = await assessmentRequest<{ attemptId?: string; templateId?: string }>(request, base, jsonBody({ requestId }));
      if (!receipt.attemptId || receipt.templateId !== assessment.id) throw new Error("Invalid attempt receipt");
      await drafts?.remove(key).catch(() => {});
      if (mounted.current) replace(quizAttemptPath(base, receipt.attemptId, stage));
    } catch (failure) {
      if (failure instanceof AssessmentRequestError && [400, 409, 422].includes(failure.status)) {
        await drafts?.remove(key).catch(() => {});
        requestKey.current = null;
        if (mounted.current) setPending(false);
      }
      if (mounted.current) setError(failure instanceof AssessmentRequestError && failure.status < 500 && failure.message ? failure.message : messages.quizStart.failed);
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const open = assessment.availability === "open" && !assessment.stageLocked;
  const exhausted = assessment.maxAttempts !== null && assessment.attempts >= assessment.maxAttempts;
  const canStart = open && assessment.questionCount !== 0 && !exhausted;
  const canResume = assessment.availability !== "locked" && Boolean(assessment.activeAttemptId) && !pending;
  const showUnavailable = open && !canResume && !pending;
  let actionMessage: string | undefined;
  if (showUnavailable && exhausted) {
    actionMessage = tx("Batas percobaan maksimal telah tercapai. Anda tidak dapat memulai kuis ini lagi.", "You’ve reached the attempt limit. You can’t start this quiz again.");
  } else if (showUnavailable && assessment.questionCount === 0) {
    actionMessage = tx("Soal kuis belum tersedia untuk kelas ini. Hubungi pengajar Anda untuk mempublikasikan soal kuis.", "No quiz questions are available for this course yet. Contact your instructor to publish questions.");
  }
  const { border, destructive } = useAssessmentColors();
  return <Frame title={assessment.title} subtitle={data.courseTitle} compactCourseHeader>
    {open ? <QuizGatewayInstructions assessment={assessment} completedCount={history.length} /> : <AvailabilityMessage kind="quiz" assessment={assessment} />}
    {error ? <View accessibilityLiveRegion="assertive"><Body tone="error">{error}</Body></View> : null}
    {draftReadError ? <Message title={tx("Percobaan tersimpan belum dapat dibuka", "Could not read the saved attempt")}
      action={tx("Coba lagi", "Try again")} onPress={() => setDraftRevision((value) => value + 1)} error /> : null}
    {open || canResume || pending || assessment.discussionAvailable ? <View style={[quizGatewayStyles.actions, { borderTopColor: border }]}>
      {actionMessage ? <View accessibilityLiveRegion="polite" style={quizGatewayStyles.actionMessage}>
        <QuizGatewayIcon name="warning" color={destructive} size={16} />
        <Body tone="error" style={quizGatewayStyles.actionMessageText}>{actionMessage}</Body>
      </View> : null}
      {open ? <Button variant="ghost" accessibilityRole="link" onPress={() => replace(stage ?? `${course}/quiz`)}>{messages.quizTake.cancel}</Button> : null}
      {canResume && assessment.activeAttemptId ? <Button accessibilityRole="link" testID="student-assessment-resume" onPress={() => navigate(quizAttemptPath(base, assessment.activeAttemptId!, stage))}>{messages.quizList.continue}</Button> : null}
      {assessment.availability !== "locked" && (pending || (canStart && !assessment.activeAttemptId)) ? <Button testID="student-assessment-start" isLoading={busy || loadingDraft}
        style={quizGatewayStyles.start} renderIcon={pending ? undefined : (color, size) => <QuizGatewayIcon name="play" color={color} size={size} />}
        disabled={draftReadError} onPress={() => void begin()}>{pending ? tx("Periksa percobaan", "Check attempt") : messages.quizStart.startQuiz}</Button> : null}
      {assessment.discussionAvailable ? <Button variant="outline" onPress={() => navigate(`${base}?viewDiscussion=true`)}>{messages.quizTake.viewDiscussion}</Button> : null}
    </View> : null}
    {assessment.availability !== "locked" ? <QuizGatewayHistory history={history} onReview={(id) => navigate(quizAttemptPath(base, id))} /> : null}
  </Frame>;
}

export function QuizDetail({ data }: { data: Extract<AssessmentPage, { kind: "quiz-detail" }> }) {
  const { route } = useAssessment();
  if (data.player && route.query.attemptId) return <AssessmentPlay key={route.query.attemptId} player={data.player} assessment={data.assessment} kind="quiz" attemptId={route.query.attemptId} />;
  if (data.review) return <ReviewPage review={data.review} title={data.assessment.title} quizRoute />;
  return <QuizGateway data={data} />;
}

export function TryoutDetail({ data }: { data: Extract<AssessmentPage, { kind: "tryout-detail" }> }) {
  const { route, request, drafts, navigate, replace } = useAssessment();
  const course = useCourse();
  const { messages, tx } = useAssessmentCopy();
  const [pending, setPending] = useState<{ requestId: string; answers: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = draftKey("tryout", route.params.id, data.assessment.id);
  const canRecover = !data.player && data.assessment.availability !== "locked";
  useEffect(() => {
    if (!canRecover || !drafts) return;
    let mounted = true;
    void drafts.get(key).then((raw) => {
      const receipt = raw ? JSON.parse(raw) : null;
      if (mounted && receipt?.pending === true && isAssessmentRequestId(receipt.requestId) && receipt.frozenAnswers) {
        setPending({ requestId: receipt.requestId, answers: receipt.frozenAnswers });
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [canRecover, drafts, key]);
  if (data.player) return <AssessmentPlay player={data.player} assessment={data.assessment} kind="tryout" />;

  async function retry() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const receipt = await assessmentRequest<{ success: boolean; submissionId: string }>(request, `${course}/tryout/${encodeURIComponent(data.assessment.id)}`, jsonBody(pending));
      if (!receipt.success || !receipt.submissionId) throw new Error("Invalid tryout receipt");
      await drafts?.remove(key).catch(() => {});
      replace(`${course}/my-results/${encodeURIComponent(receipt.submissionId)}`);
    } catch (failure) {
      setError(failure instanceof AssessmentRequestError && failure.status < 500 && failure.message ? failure.message : tx("Pengiriman belum terkonfirmasi. Coba lagi.", "Submission is unconfirmed. Try again."));
    } finally { setBusy(false); }
  }

  return <Frame title={data.assessment.title} subtitle={data.courseTitle}>
    <AvailabilityMessage kind="tryout" assessment={data.assessment} />
    {pending ? <Button testID="student-assessment-retry" isLoading={busy} onPress={() => void retry()}>{tx("Periksa pengiriman", "Check submission")}</Button> : null}
    {error ? <Body tone="error">{error}</Body> : null}
    {data.priorResult ? <Button variant="outline" onPress={() => navigate(`${course}/my-results/${encodeURIComponent(data.priorResult!.id)}`)}>{messages.summary.viewReview}</Button> : null}
  </Frame>;
}

function ReviewQuestion({ item, index, showAnswer, visualContext }: {
  item: ReviewedQuestion; index: number; showAnswer: boolean;
  visualContext?: { courseId: string; attemptId: string };
}) {
  const { messages, tx } = useAssessmentCopy();
  const scope = visualContext ? { ...visualContext, questionId: item.id } : null;
  return <Section border>
    <Heading level={3}>{fill(messages.quiz.questionNumber, { number: index + 1 })}{item.correct === null ? "" : ` · ${item.correct ? messages.review.correct : messages.review.incorrect}`}</Heading>
    {item.sourceEventName ? <Body tone="muted">{item.sourceEventName}</Body> : null}
    <InteractiveAssessmentMarkdown value={item.prompt} scope={scope && { ...scope, field: "prompt" }} />
    {item.options.map((option, optionIndex) => <View key={optionIndex} style={{ gap: 4 }}>
      <Body tone="muted">{String.fromCharCode(65 + optionIndex)}</Body>
      <InteractiveAssessmentMarkdown value={option} scope={scope && { ...scope, field: "option", option: optionIndex }} />
    </View>)}
    {showAnswer ? <><Body tone="muted">{messages.review.yourAnswer}</Body><Markdown value={item.selected ? interactiveMarkdownFallback(item.selected) : tx("Belum diisi", "Unanswered")} /></> : null}
    {item.expected ? <><Body tone="muted">{messages.review.correctAnswer}</Body><Markdown value={interactiveMarkdownFallback(item.expected)} /></> : null}
    {item.explanation ? <><Heading level={3}>{messages.review.explanation}</Heading><InteractiveAssessmentMarkdown value={item.explanation} scope={scope && { ...scope, field: "explanation" }} /></> : null}
    {item.feedback ? <><Body tone="muted">{messages.review.teacherNote}</Body><Markdown value={item.feedback} /></> : null}
  </Section>;
}

export function ReviewPage({ review, title, quizRoute = false }: { review: Review; title?: string; quizRoute?: boolean }) {
  const { navigate } = useAssessment();
  const course = useCourse();
  const { messages, tx, date } = useAssessmentCopy();
  const { score, status } = useResultCopy();
  const result = review.result;
  const visualContext = review.documentCourseId && result?.kind === "quiz"
    ? { courseId: review.documentCourseId, attemptId: result.id } : undefined;
  const [showMore, setShowMore] = useState(false);
  const quizPath = result ? `${course}/quiz/${encodeURIComponent(result.assessmentId)}` : `${course}/quiz`;
  return <Frame title={title ?? result?.assessmentTitle ?? messages.reviewPage.answerTitle} subtitle={messages.reviewPage.answerTitle}>
    {result ? <Section>
      <Fact label={messages.review.status} value={status(result)} /><Fact label={messages.review.finalScore} value={score(result)} />
      {result.submittedAt ? <Fact label={messages.quizTake.submittedAt} value={date(result.submittedAt)} /> : null}
      {result.status === "pending_review" ? <Body tone="muted">{messages.summary.pendingDescription}</Body> : null}
      {review.teacherNotes ? <><Heading level={3}>{messages.review.teacherNote}</Heading><Markdown value={review.teacherNotes} /></> : null}
      <ButtonRow>
        {result.kind === "quiz" ? <>
          {review.discussionAvailable ? <Button variant="outline" onPress={() => navigate(quizRoute ? `${quizPath}/summary/${encodeURIComponent(result.id)}` : `${course}/my-results/${encodeURIComponent(result.id)}/summary`)}>{messages.reviewPage.viewDiagnosis}</Button> : null}
          <Button variant="outline" onPress={() => navigate(quizPath)}>{messages.summary.retryQuiz}</Button>
        </> : null}
        <Button variant="ghost" onPress={() => navigate(`${course}/my-results`)}>{messages.summary.examHistory}</Button>
      </ButtonRow>
    </Section> : null}
    {!review.discussionAvailable ? <Message title={tx("Pembahasan belum tersedia", "Discussion unavailable")} /> : null}
    {review.items.map((item, index) => <ReviewQuestion key={item.id} item={item} index={index} showAnswer visualContext={visualContext} />)}
    {review.additionalItems?.length ? <Section border>
      <Button variant="outline" accessibilityState={{ expanded: showMore }} onPress={() => setShowMore(!showMore)}>{messages.quizTake.fullDiscussion}</Button>
      {showMore ? review.additionalItems.map((item, index) => <ReviewQuestion key={item.id} item={item} index={index} showAnswer={false} />) : null}
    </Section> : null}
  </Frame>;
}

export function SummaryPage({ data, reload }: { data: Extract<AssessmentPage, { kind: "summary" }>; reload: () => void }) {
  const { route, request, navigate } = useAssessment();
  const course = useCourse();
  const { messages, tx } = useAssessmentCopy();
  const { result, analytics } = data;
  const quizPath = `${course}/quiz/${encodeURIComponent(result.assessmentId)}`;
  const reviewPath = route.params.quizId ? quizAttemptPath(quizPath, result.id) : `${course}/my-results/${encodeURIComponent(result.id)}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (analytics.status !== "processing" && analytics.status !== "pending") return;
    const timer = setTimeout(reload, 4000);
    return () => clearTimeout(timer);
  }, [analytics, reload]);

  async function regenerate() {
    setBusy(true);
    setError(false);
    try { await assessmentRequest(request, assessmentRoutePath(route), { method: "POST" }); reload(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  const metrics = analytics.computedMetrics;
  const diagnosis = analytics.aiDiagnosis;
  return <Frame title={messages.summary.title} subtitle={result.assessmentTitle} onBack={() => navigate(reviewPath)}>
    <ButtonRow>
      <Button variant="ghost" size="sm" onPress={() => navigate(`${course}/my-results`)}>{messages.summary.examHistory}</Button>
      <Button variant="secondary" size="sm" onPress={() => navigate(quizPath)}>{messages.summary.retryQuiz}</Button>
    </ButtonRow>
    {result.status === "pending_review" ? <Message title={messages.summary.pendingTitle} detail={messages.summary.pendingDescription} /> :
      !data.discussionAvailable ? <Message title={tx("Pembahasan belum tersedia", "Discussion unavailable")} /> : <>
        {analytics.status === "processing" || analytics.status === "pending" ? <Message title={tx("Diagnosis sedang diproses", "Preparing diagnosis")} action={tx("Periksa status", "Refresh status")} onPress={reload} /> : null}
        {analytics.status === "failed" || (!metrics && !diagnosis && analytics.status !== "processing" && analytics.status !== "pending") ?
          <Message title={tx("Diagnosis belum tersedia", "Diagnosis unavailable")} /> : null}
        {metrics ? <Section border>
          <Heading>{tx("Ringkasan hasil", "Results overview")}</Heading>
          <Fact label={messages.quizTake.finalScore} value={`${metrics.score}%`} />
          <Fact label={messages.review.correct} value={`${metrics.correctCount}/${metrics.totalQuestions}`} />
          <Fact label={messages.review.incorrect} value={metrics.incorrectCount} />
          <Fact label={messages.quiz.unanswered} value={metrics.unansweredCount} />
          {metrics.conceptMastery.length ? <Heading level={3}>{tx("Penguasaan konsep", "Concept mastery")}</Heading> : null}
          {metrics.conceptMastery.map((item) => <Fact key={item.concept} label={item.concept} value={`${item.accuracyPercent}%`} />)}
          {metrics.cognitiveSkills.length ? <Heading level={3}>{tx("Keterampilan kognitif", "Cognitive skills")}</Heading> : null}
          {metrics.cognitiveSkills.map((item) => <Fact key={item.skill} label={item.skill} value={`${item.accuracyPercent}%`} />)}
          {metrics.difficultyBreakdown.length ? <Heading level={3}>{tx("Tingkat kesulitan", "Difficulty breakdown")}</Heading> : null}
          {metrics.difficultyBreakdown.map((item) => <Fact key={item.difficulty} label={item.difficulty} value={`${item.accuracyPercent}%`} />)}
          <Fact label={messages.quizTake.duration} value={tx(`${metrics.timeAnalysis.totalDurationSeconds} detik`, `${metrics.timeAnalysis.totalDurationSeconds} s`)} />
          {metrics.historicalComparison.scoreTrend.length ? <Fact label={messages.quizTake.attemptHistory} value={metrics.historicalComparison.scoreTrend.map((score) => `${score}%`).join(" · ")} /> : null}
        </Section> : null}
        {diagnosis ? <Section border>
          <Heading>{diagnosis.headline}</Heading><Markdown value={diagnosis.overall_summary} />
          {[...diagnosis.strengths, ...diagnosis.focus_areas].map((item, index) => <Section key={index}>
            <Heading level={3}>{item.title}</Heading><Markdown value={item.description} />
            {item.evidence.map((detail, i) => <Markdown key={i} value={detail.observation} />)}
          </Section>)}
          {diagnosis.concept_diagnostics.map((item, index) => <Section key={index}><Heading level={3}>{item.concept}</Heading><Markdown value={`${item.summary}\n\n${item.recommended_action}`} /></Section>)}
          {diagnosis.error_patterns.map((item, index) => <Section key={index}><Heading level={3}>{item.title}</Heading><Markdown value={`${item.description}\n\n${item.correction_strategy}`} /></Section>)}
          {diagnosis.skill_diagnostics.map((item, index) => <Section key={index}><Heading level={3}>{item.skill}</Heading><Markdown value={item.summary} /></Section>)}
          {diagnosis.time_insights.map((item, index) => <Section key={index}><Heading level={3}>{item.observation}</Heading><Markdown value={`${item.interpretation}\n\n${item.suggestion}`} /></Section>)}
          {diagnosis.study_plan.map((item, index) => <Section key={index}><Heading level={3}>{item.focus}</Heading>
            <Markdown value={`${item.reason}\n\n${item.action}\n\n${item.success_check}`} />
            {item.resource_url?.startsWith(`${course}/`) && !item.resource_url.includes("\\") ? <Button variant="outline" size="sm" onPress={() => navigate(item.resource_url!)}>{messages.quizList.open}</Button> : null}
          </Section>)}
          <Markdown value={diagnosis.encouragement} />{diagnosis.limitations.map((item, index) => <Body key={index} tone="muted" style={styles.caption}>{item}</Body>)}
        </Section> : null}
        {analytics.status !== "processing" && analytics.status !== "pending" ? <Button isLoading={busy} variant="outline" size="sm" onPress={() => void regenerate()}>{tx("Analisis ulang", "Reanalyze")}</Button> : null}
        {error ? <Body tone="error">{tx("Analisis ulang gagal. Coba lagi.", "Could not reanalyze. Try again.")}</Body> : null}
      </>}
  </Frame>;
}
