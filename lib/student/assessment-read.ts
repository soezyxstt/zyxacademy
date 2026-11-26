import "server-only";

import { and, asc, count, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiQuestionBank, attemptFeedback, exams, questions, quizTemplates, studentQuizAttempts, submissions } from "@/db/schema";
import { getCourse, getStudentVisibleCourseQuizzes } from "@/lib/course-utils";
import { recordAttemptDisclosures, recordAuthorizedCourseDisclosures } from "@/lib/gamification/question-exposure";
import { canAccessQuizSnapshot, freeQuizQuestionScope } from "@/lib/quiz/question-scope";
import { canViewAttemptDiscussion, canViewQuizDiscussion, isQuizDiscussionClosed } from "@/lib/quiz/review-release";
import { canAccessStudentQuizTemplate, validatedQuizScope } from "@/lib/quiz/student-access";
import { isPkaStageAttemptAllowed } from "@/lib/pka-simulation";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getPublishedSolutionCollection } from "@/lib/solutions/repository";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { assessmentAvailability, objectRecord, projectQuestion, readQuizAnswers, records, reviewQuizQuestion, reviewTryoutQuestion } from "./assessment-projection";
import type { AssessmentPage, AssessmentPlayer, AssessmentResult, AssessmentRow, Review } from "@/packages/native-parity/student/assessment/contract";

type Quiz = typeof quizTemplates.$inferSelect;
type Exam = typeof exams.$inferSelect;
type Attempt = typeof studentQuizAttempts.$inferSelect;
type Submission = typeof submissions.$inferSelect;
type Context = NonNullable<Awaited<ReturnType<typeof loadAssessmentCourse>>>;
const iso = (date: Date | null) => date?.toISOString() ?? null;
const positiveInt = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
export function mayUseQuizStage(ctx: Context, quiz: Quiz) {
  return quiz.category !== "simulation" && !ctx.ids.includes(PKA_COURSE_ID) ? true : isPkaStageAttemptAllowed(ctx.userId, quiz.id);
}

export async function loadAssessmentCourse(courseId: string, userId: string) {
  const [course, access] = await Promise.all([getCourse(courseId), resolveCourseAccess({ courseId, userId })]);
  if (!course || access.reason || !access.isAuthenticated) return null;
  return { courseId, userId, access, courseTitle: course.title, ids: [...new Set([course.id, course.legacyId, course.canonicalId, access.legacyCourseId, access.canonicalCourseId].filter((id): id is string => Boolean(id)))] };
}

function quizResult(attempt: Pick<Attempt, "id" | "score" | "status" | "gradingStatus" | "submittedAt" | "durationSeconds">, template: Pick<Quiz, "id" | "title">): AssessmentResult {
  return {
    id: attempt.id, assessmentId: template.id, assessmentTitle: template.title, kind: "quiz",
    status: attempt.gradingStatus === "pending" ? "pending_review" : attempt.status,
    score: attempt.score, submittedAt: iso(attempt.submittedAt), durationSeconds: attempt.durationSeconds,
  };
}

function tryoutResult(submission: Pick<Submission, "id" | "score" | "status" | "submittedAt">, exam: Pick<Exam, "id" | "title">): AssessmentResult {
  return { id: submission.id, assessmentId: exam.id, assessmentTitle: exam.title, kind: "tryout", status: submission.status, score: submission.score, submittedAt: iso(submission.submittedAt) };
}

function quizRows(template: Quiz, attempts: Pick<Attempt, "id" | "status" | "score">[], allowed: boolean, questionCount?: number): AssessmentRow {
  const rules = objectRecord(template.selectionRules);
  const scores = attempts.flatMap((attempt) => attempt.status === "completed" && attempt.score !== null ? [attempt.score] : []);
  return {
    id: template.id, title: template.title, availability: assessmentAvailability(allowed, template),
    durationSeconds: template.timeLimitSeconds, maxAttempts: template.maxAttempts, questionCount: questionCount ?? (positiveInt(rules.count) ?? 10),
    attempts: attempts.filter((attempt) => attempt.status !== "abandoned").length,
    activeAttemptId: attempts.find((attempt) => attempt.status === "in_progress")?.id,
    bestScore: scores.length ? Math.max(...scores) : undefined,
    visibility: template.visibility, category: template.category, openAt: iso(template.openAt), closeAt: iso(template.closeAt),
    discussionAvailable: allowed && canViewQuizDiscussion({
      explanationRelease: rules.explanationRelease, showDiscussion: template.showDiscussion,
      isQuizClosed: isQuizDiscussionClosed({ ...template, now: new Date() }),
      hasCompletedAttempt: attempts.some((attempt) => attempt.status === "completed"),
    }),
  };
}

function examRow(exam: Exam, allowed: boolean, questionCount: number | null, attempts: number): AssessmentRow {
  const settings = objectRecord(exam.settings);
  return {
    id: exam.id, title: exam.title, availability: assessmentAvailability(allowed, exam), questionCount, attempts,
    durationSeconds: (positiveInt(settings.timeLimitMinutes) ?? 90) * 60,
    maxAttempts: positiveInt(settings.maxAttempts), openAt: iso(exam.openAt), closeAt: iso(exam.closeAt),
  };
}

const attemptProjection = {
  id: studentQuizAttempts.id, status: studentQuizAttempts.status, score: studentQuizAttempts.score,
  gradingStatus: studentQuizAttempts.gradingStatus, submittedAt: studentQuizAttempts.submittedAt, durationSeconds: studentQuizAttempts.durationSeconds,
};

export async function readQuizList(ctx: Context, filter: string | null): Promise<AssessmentPage> {
  const templates = (await getStudentVisibleCourseQuizzes(ctx.courseId, ctx.userId)).filter((template) => {
    if (!validatedQuizScope(template.selectionRules)) return false;
    if (ctx.access.tier === "free" && ctx.access.hasFullContentAccess && !canAccessStudentQuizTemplate(ctx.access, template)) return false;
    if (filter === "free") return template.visibility === "free";
    if (filter === "premium") return template.visibility === "paid";
    return true;
  });
  const allowed = new Set(templates.filter((template) => canAccessStudentQuizTemplate(ctx.access, template)).map(({ id }) => id));
  const attempts = allowed.size ? await db.select({ ...attemptProjection, templateId: studentQuizAttempts.templateId })
    .from(studentQuizAttempts).where(and(eq(studentQuizAttempts.studentId, ctx.userId), inArray(studentQuizAttempts.templateId, [...allowed])))
    .orderBy(desc(studentQuizAttempts.startedAt)) : [];
  const grouped = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const group = grouped.get(attempt.templateId) ?? [];
    group.push(attempt);
    grouped.set(attempt.templateId, group);
  }
  return { kind: "quiz-list", courseTitle: ctx.courseTitle, fullAccess: ctx.access.hasFullContentAccess,
    rows: templates.map((template) => quizRows(template, grouped.get(template.id) ?? [], allowed.has(template.id))) };
}

export async function findQuiz(ctx: Context, quizId: string) {
  const [quiz] = await db.select().from(quizTemplates).where(and(eq(quizTemplates.id, quizId), inArray(quizTemplates.courseId, ctx.ids), eq(quizTemplates.status, "published"))).limit(1);
  return quiz ?? null;
}

export async function findQuizAttempt(ctx: Context, attemptId: string, quizId?: string) {
  const [entry] = await db.select({ attempt: studentQuizAttempts, template: quizTemplates }).from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(and(eq(studentQuizAttempts.id, attemptId), eq(studentQuizAttempts.studentId, ctx.userId), inArray(quizTemplates.courseId, ctx.ids),
      eq(quizTemplates.status, "published"), quizId === undefined ? undefined : eq(quizTemplates.id, quizId))).limit(1);
  if (!entry || !canAccessStudentQuizTemplate(ctx.access, entry.template) || !await canAccessQuizSnapshot(ctx.access, entry.attempt.questionsSnapshot)) return null;
  if (entry.attempt.status === "in_progress" && !await mayUseQuizStage(ctx, entry.template)) return null;
  return entry;
}

/** Keep gateway availability and after-close discussion tied to the published source. */
async function quizQuestionFilters(ctx: Context, template: Quiz, excluded: string[] = []) {
  const rules = objectRecord(template.selectionRules);
  const fixed = rules.fixedQuestionIds ?? rules.fixed_question_ids ?? rules.questionIds ?? rules.question_ids;
  const fixedIds = Array.isArray(fixed) ? fixed.filter((id): id is string => typeof id === "string").map((id) => id.trim()) : [];
  const tags = Array.isArray(rules.tags) ? rules.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const tagFilters = tags.map((tag) => sql`exists (select 1 from jsonb_array_elements_text(${aiQuestionBank.tags}::jsonb) as tag_value where tag_value = ${tag})`);
  const where = and(
    eq(aiQuestionBank.courseId, template.courseId), eq(aiQuestionBank.reviewStatus, "published"),
    or(eq(aiQuestionBank.origin, "zyx_original"), eq(aiQuestionBank.origin, "itb_example"), eq(aiQuestionBank.quizEligible, true)),
    ctx.access.tier === "free" ? await freeQuizQuestionScope(ctx.access, template.selectionRules) : undefined,
    fixedIds.length ? inArray(aiQuestionBank.id, fixedIds) : tagFilters.length ? or(...tagFilters) : undefined,
    excluded.length ? notInArray(aiQuestionBank.id, excluded) : undefined,
  );
  return { where, fixedIds };
}

async function quizQuestionCount(ctx: Context, template: Quiz) {
  const { where, fixedIds } = await quizQuestionFilters(ctx, template);
  const [row] = await db.select({ value: count() }).from(aiQuestionBank).where(where);
  const found = row?.value ?? 0;
  return fixedIds.length && found !== fixedIds.length ? 0 : found;
}

async function quizReview(ctx: Context, template: Quiz, attempt: Attempt | null, released: boolean, includeAdditional: boolean): Promise<Review> {
  const result = attempt ? quizResult(attempt, template) : null;
  if (!released) return { result, discussionAvailable: false, items: [] };
  const snapshot = records(attempt?.questionsSnapshot);
  const questionIds = snapshot.map((row) => String(row.id));
  const [additionalRows, feedback] = await Promise.all([
    includeAdditional ? (async () => {
      const { where, fixedIds } = await quizQuestionFilters(ctx, template, questionIds);
      const rows = await db.select({ id: aiQuestionBank.id, prompt: aiQuestionBank.prompt, question_type: aiQuestionBank.questionType,
        options: aiQuestionBank.options, correct_indices: aiQuestionBank.correctIndices, acceptable_answers: aiQuestionBank.acceptableAnswers,
        explanation: aiQuestionBank.explanation, sourceEventName: aiQuestionBank.sourceEventName }).from(aiQuestionBank).where(where).orderBy(desc(aiQuestionBank.createdAt));
      return fixedIds.length ? rows.sort((a, b) => fixedIds.indexOf(a.id) - fixedIds.indexOf(b.id)) : rows;
    })() : [],
    attempt ? db.select({ index: attemptFeedback.questionIndex, payload: attemptFeedback.payload }).from(attemptFeedback).where(eq(attemptFeedback.attemptId, attempt.id)) : [],
  ]);
  const externalIds = additionalRows.map((row) => row.id);
  if (questionIds.length || externalIds.length) {
    const shared = { userId: ctx.userId, occurredAt: new Date(), requestId: crypto.randomUUID() };
    const canonicalCourseId = ctx.access.canonicalCourseId ?? ctx.access.courseId;
    if (!canonicalCourseId && externalIds.length) throw new Error("Missing course identity for quiz discussion");
    await db.transaction(async (tx) => {
      if (attempt) {
        await recordAttemptDisclosures(tx, { ...shared, attemptId: attempt.id, questionIds,
          outsideSnapshot: externalIds.length && canonicalCourseId ? { canonicalCourseId, questionIds: externalIds } : undefined });
      } else if (canonicalCourseId) {
        await recordAuthorizedCourseDisclosures(tx, { ...shared, canonicalCourseId, contextId: template.id, questionIds: externalIds });
      }
    });
  }
  const answers = objectRecord(attempt?.answersSnapshot);
  const feedbackByIndex = new Map(feedback.map(({ index, payload }) => [index, objectRecord(payload)]));
  return { result, discussionAvailable: true,
    items: snapshot.map((question, index) => {
      const notes = feedbackByIndex.get(index);
      const note = notes?.feedback ?? notes?.overview ?? notes?.teacherNote;
      return reviewQuizQuestion(question, answers[String(question.id)], typeof note === "string" ? note : undefined);
    }),
    additionalItems: additionalRows.map((question) => ({ ...reviewQuizQuestion(question, undefined), correct: null })),
  };
}

function quizPlayer(attempt: Attempt, template: Quiz): AssessmentPlayer {
  const rows = records(attempt.questionsSnapshot);
  const projected = rows.map((raw) => {
    const question = projectQuestion(raw);
    return question.type === "essay" ? { ...question, acceptsFile: true, acceptsImage: true } : question;
  });
  const rules = objectRecord(template.selectionRules);
  const timers = objectRecord(rules.perQuestionTimers);
  return {
    questions: projected, answers: readQuizAnswers(attempt.answersSnapshot, rows), startAt: iso(attempt.startedAt),
    durationSeconds: template.timeLimitSeconds, closeAt: iso(template.closeAt), canGoBack: rules.canGoBack !== false,
    requireAllAnswered: rules.requireAllAnswered === true,
    perQuestionSeconds: rules.perQuestionTimerEnabled === true ? Object.fromEntries(projected.map(({ id }) => [id, positiveInt(timers[id]) ?? positiveInt(rules.defaultQuestionTimerSeconds) ?? 60])) : null,
  };
}

export async function readQuizDetail(ctx: Context, quizId: string, attemptId: string | null, discussion: boolean): Promise<AssessmentPage | null> {
  const quiz = await findQuiz(ctx, quizId);
  if (!quiz) return null;
  const hasAccess = canAccessStudentQuizTemplate(ctx.access, quiz);
  const stageLocked = hasAccess && attemptId === null && !await mayUseQuizStage(ctx, quiz);
  if (!hasAccess || stageLocked) return attemptId ? null : {
    kind: "quiz-detail", courseTitle: ctx.courseTitle,
    assessment: { ...quizRows(quiz, [], false), stageLocked }, history: [], player: null, review: null,
  };
  const attempts = await db.select(attemptProjection).from(studentQuizAttempts)
    .where(and(eq(studentQuizAttempts.studentId, ctx.userId), eq(studentQuizAttempts.templateId, quizId)))
    .orderBy(desc(studentQuizAttempts.startedAt));
  const completed = attempts.filter((attempt) => attempt.status === "completed");
  const history = completed.map((attempt) => quizResult(attempt, quiz));
  let assessment = quizRows(quiz, attempts, true);
  let player: AssessmentPlayer | null = null;
  let review: Review | null = null;
  if (attemptId) {
    const entry = await findQuizAttempt(ctx, attemptId, quizId);
    if (!entry || entry.attempt.status === "abandoned") return null;
    if (entry.attempt.status === "in_progress") player = quizPlayer(entry.attempt, quiz);
    if (entry.attempt.status === "completed") review = await quizReview(ctx, quiz, entry.attempt, canViewAttemptDiscussion(quiz, entry.attempt.status), true);
  } else if (discussion && assessment.discussionAvailable) {
    const entry = completed[0] ? await findQuizAttempt(ctx, completed[0].id, quizId) : null;
    if (completed[0] && !entry) return null;
    review = await quizReview(ctx, quiz, entry?.attempt ?? null, true, true);
  } else if (assessment.availability === "open") {
    const available = await quizQuestionCount(ctx, quiz);
    const configured = positiveInt(objectRecord(quiz.selectionRules).count);
    assessment = { ...assessment, questionCount: configured === null ? available : Math.min(available, configured) };
  }
  return { kind: "quiz-detail", courseTitle: ctx.courseTitle, assessment, history, player, review };
}

async function findTryout(ctx: Context, examId: string) {
  const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), inArray(exams.courseId, ctx.ids), eq(exams.type, "tryout"), eq(exams.status, "published"))).limit(1);
  return exam ?? null;
}

export async function readTryoutList(ctx: Context): Promise<AssessmentPage> {
  const list = await db.select().from(exams).where(and(inArray(exams.courseId, ctx.ids), eq(exams.type, "tryout"), eq(exams.status, "published")));
  const ids = list.map(({ id }) => id);
  const [sizes, submitted] = ids.length ? await Promise.all([
    db.select({ examId: questions.examId, size: count() }).from(questions).where(inArray(questions.examId, ids)).groupBy(questions.examId),
    ctx.access.hasFullContentAccess ? db.select({ examId: submissions.examId, size: count() }).from(submissions).where(and(inArray(submissions.examId, ids), eq(submissions.userId, ctx.userId))).groupBy(submissions.examId) : [],
  ]) : [[], []];
  const sizesByExam = new Map(sizes.map(({ examId, size }) => [examId, size]));
  const submittedByExam = new Map(submitted.map(({ examId, size }) => [examId, size]));
  return { kind: "tryout-list", courseTitle: ctx.courseTitle, fullAccess: ctx.access.hasFullContentAccess,
    rows: list.map((exam) => examRow(exam, ctx.access.hasFullContentAccess, sizesByExam.get(exam.id) ?? 0, submittedByExam.get(exam.id) ?? 0)) };
}

export async function readTryoutDetail(ctx: Context, examId: string): Promise<AssessmentPage | null> {
  const exam = await findTryout(ctx, examId);
  if (!exam) return null;
  const base = examRow(exam, ctx.access.hasFullContentAccess, null, 0);
  const [attempts, questionRows] = await Promise.all([
    ctx.access.hasFullContentAccess ? db.select({ id: submissions.id, status: submissions.status, score: submissions.score, submittedAt: submissions.submittedAt })
      .from(submissions).where(and(eq(submissions.examId, examId), eq(submissions.userId, ctx.userId))).orderBy(desc(submissions.submittedAt)) : [],
    base.availability === "open" ? db.select().from(questions).where(eq(questions.examId, examId)).orderBy(asc(questions.order)) : [],
  ]);
  const assessment = { ...base, attempts: attempts.length, questionCount: base.availability === "open" ? questionRows.length : null };
  const reachedLimit = assessment.maxAttempts !== null && assessment.attempts >= assessment.maxAttempts;
  const player: AssessmentPlayer | null = base.availability === "open" && !reachedLimit && questionRows.length
    ? { questions: questionRows.map((row) => projectQuestion({ ...objectRecord(row.content), id: row.id, type: row.type })), answers: {}, startAt: null,
        durationSeconds: base.durationSeconds, closeAt: base.closeAt, canGoBack: true, requireAllAnswered: false, perQuestionSeconds: null }
    : null;
  return { kind: "tryout-detail", courseTitle: ctx.courseTitle, assessment, player, priorResult: attempts[0] ? tryoutResult(attempts[0], exam) : undefined };
}

export async function readResults(ctx: Context): Promise<AssessmentPage> {
  if (!ctx.access.hasFullContentAccess) return { kind: "results", courseTitle: ctx.courseTitle, fullAccess: false, results: [] };
  const [quizResults, tryoutResults] = await Promise.all([
    db.select({ attempt: attemptProjection, template: { id: quizTemplates.id, title: quizTemplates.title } }).from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id)).where(and(eq(studentQuizAttempts.studentId, ctx.userId),
        inArray(quizTemplates.courseId, ctx.ids), eq(studentQuizAttempts.status, "completed"))),
    db.select({ sub: { id: submissions.id, status: submissions.status, score: submissions.score, submittedAt: submissions.submittedAt }, exam: { id: exams.id, title: exams.title } }).from(submissions)
      .innerJoin(exams, eq(submissions.examId, exams.id)).where(and(eq(submissions.userId, ctx.userId), inArray(exams.courseId, ctx.ids), eq(exams.type, "tryout"))),
  ]);
  return { kind: "results", courseTitle: ctx.courseTitle, fullAccess: true,
    results: [...quizResults.map(({ attempt, template }) => quizResult(attempt, template)), ...tryoutResults.map(({ sub, exam }) => tryoutResult(sub, exam))]
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")) };
}

export async function readResultReview(ctx: Context, submissionId: string): Promise<AssessmentPage | null> {
  const entry = await findQuizAttempt(ctx, submissionId);
  if (entry?.attempt.status === "completed") {
    return { kind: "review", courseTitle: ctx.courseTitle, review: await quizReview(ctx, entry.template, entry.attempt, canViewAttemptDiscussion(entry.template, entry.attempt.status), false) };
  }
  if (!ctx.access.hasFullContentAccess) return null;
  const [tryout] = await db.select({ sub: submissions, exam: { id: exams.id, title: exams.title } }).from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id)).where(and(eq(submissions.id, submissionId), eq(submissions.userId, ctx.userId), inArray(exams.courseId, ctx.ids), eq(exams.type, "tryout"))).limit(1);
  if (!tryout) return null;
  const answers = objectRecord(tryout.sub.answersSnapshot);
  return { kind: "review", courseTitle: ctx.courseTitle, review: { result: tryoutResult(tryout.sub, tryout.exam), discussionAvailable: true,
    items: records(tryout.sub.questionsSnapshot).map((question) => reviewTryoutQuestion(question, answers[String(question.id)])), teacherNotes: tryout.sub.teacherNotes ?? undefined } };
}

export async function readSummary(ctx: Context, attemptId: string, quizId?: string) {
  const entry = await findQuizAttempt(ctx, attemptId, quizId);
  if (!entry || entry.attempt.status !== "completed") return null;
  return { result: quizResult(entry.attempt, entry.template), discussionAvailable: canViewAttemptDiscussion(entry.template, entry.attempt.status) };
}

export async function readSolutionCollection(ctx: Context, collectionId: string): Promise<AssessmentPage | null> {
  const result = await getPublishedSolutionCollection({ courseId: ctx.courseId, collectionId, userId: ctx.userId });
  if (!result) return null;
  return { kind: "solutions", courseTitle: ctx.courseTitle, ...result, canComplete: ctx.access.isEnrolled && ctx.access.hasFullContentAccess && !ctx.access.isDemo };
}
