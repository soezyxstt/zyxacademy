import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { aiQuestionBank, courses, exams, mataKuliah, questions, quizTemplates, studentQuizAttempts, submissions, user } from "@/db/schema";
import { getQuizTemplatePreviewAction } from "@/app/actions/tutor-management";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getAuthSession } from "@/lib/auth-session";
import { hasPeran, requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { normalizeDate } from "@/lib/date-utils";
import { authorizedSnapshotDisclosures, recordAuthorizedGlobalDisclosures, recordStaffCourseDisclosures } from "@/lib/gamification/question-exposure";
import { getCoursePendingQuizAttempts, getQuizAttemptDetailsForGrading } from "@/lib/tutor/quiz-grading";
import { getTutorQuestionBank, getTutorQuizzesWithAttribution, getTutorQuizWithAttribution, type TutorQuizWithAttribution } from "@/lib/tutor/quiz-read-model";
import { parseSelectionRulesInput, resolveEffectiveAssessmentType } from "@/lib/tutor/assessment-policy";
import { quizTemplateRevision } from "@/lib/asesmen/quiz-template-write";
import { defaultQuiz, questionTypes, type AssessmentCourse, type AssessmentQuiz, type AssessmentTryout, type BankQuestion, type QuestionType } from "@/packages/native-parity/academic/assessment/model";
import { selectableTryoutBankCondition, tryoutBankQuestionId, tryoutMetadataRevision, tryoutQuestionSetRevision } from "@/lib/tutor/tryout-authoring";
import { tryoutCorrectIndices } from "./tryout-answer";
import type { AssessmentReadScope, AssessmentReadServices } from "./handle-read";

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function object(value: unknown): Record<string, unknown> {
  const parsed = json(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  const parsed = json(value);
  return Array.isArray(parsed) ? parsed : [];
}

function strings(value: unknown): string[] {
  return array(value).filter((item): item is string => typeof item === "string");
}

function integers(value: unknown): number[] {
  return array(value).filter((item): item is number => typeof item === "number" && Number.isInteger(item));
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function type(value: unknown): QuestionType {
  return typeof value === "string" && Object.hasOwn(questionTypes, value) ? value as QuestionType : "multiple_choice";
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = normalizeDate(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function bankQuestion(row: typeof aiQuestionBank.$inferSelect): BankQuestion {
  const { id, prompt, questionType, difficulty, options, correctIndices, acceptableAnswers, tags, explanation, origin, sourceEventName, reviewStatus, quizEligible } = row;
  return {
    id, revision: 0, prompt, type: type(questionType), difficulty, origin,
    options: strings(options), correctIndices: integers(correctIndices), acceptableAnswers: strings(acceptableAnswers),
    tags: strings(tags), explanation, sourceEventName: sourceEventName ?? undefined,
    quizSelectable: reviewStatus === "published" && (origin !== "historical_reference" || quizEligible),
  };
}

function quizRow(row: TutorQuizWithAttribution, role: AssessmentReadScope["role"]): AssessmentQuiz {
  const rules = parseSelectionRulesInput(row.selectionRules);
  const defaults = defaultQuiz(role);
  const count = number(rules.count, 10);
  const proportions = object(rules.difficulty_proportions);
  const easy = number(proportions.easy, Math.round(count * 0.3));
  const medium = number(proportions.medium, Math.round(count * 0.5));
  const fixed = strings(rules.fixedQuestionIds);
  const release = rules.explanationRelease;
  const timers = Object.fromEntries(Object.entries(object(rules.perQuestionTimers))
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0));
  return {
    id: row.id, courseId: row.courseId, title: row.title, category: row.category,
    creatorName: row.creatorName ?? "Sistem", revision: quizTemplateRevision(row.updatedAt),
    effectiveType: resolveEffectiveAssessmentType(row.category, row.selectionRules),
    visibility: row.visibility, status: row.status, manualStatus: row.manualStatus,
    timeLimitSeconds: row.timeLimitSeconds, maxAttempts: row.maxAttempts,
    openAt: iso(row.openAt), closeAt: iso(row.closeAt),
    selection: fixed.length ? { mode: "specific", questionIds: fixed } : {
      mode: "distribution", count, difficulty: { easy, medium, hard: number(proportions.hard, count - easy - medium) },
      tags: strings(rules.tags),
    },
    settings: {
      canGoBack: bool(rules.canGoBack, defaults.settings.canGoBack),
      requireAllAnswered: bool(rules.requireAllAnswered, defaults.settings.requireAllAnswered),
      explanationRelease: release === "immediate" || release === "after_close" || release === "never"
        ? release : row.showDiscussion ? "after_close" : "never",
      shuffleQuestions: bool(rules.shuffleQuestions, defaults.settings.shuffleQuestions),
      shuffleOptions: bool(rules.shuffleOptions, defaults.settings.shuffleOptions),
      showScoreImmediate: bool(rules.showScoreImmediate, defaults.settings.showScoreImmediate),
      passingScore: rules.passingScore === null ? null : number(rules.passingScore, 70),
      perQuestionTimerEnabled: bool(rules.perQuestionTimerEnabled, defaults.settings.perQuestionTimerEnabled),
      defaultQuestionTimerSeconds: number(rules.defaultQuestionTimerSeconds, defaults.settings.defaultQuestionTimerSeconds),
      perQuestionTimers: timers,
    },
  };
}

async function authorizedCourse(scope: AssessmentReadScope): Promise<{ course: AssessmentCourse; legacyId: string | null; status?: string } | null> {
  if (scope.role === "tutor") {
    const access = await requireTutorCourseAccess(scope.actorId, scope.courseKey, { allowAdmin: false });
    const { courseId, legacyCourseId } = access;
    if (!courseId) return null;
    const [canonical] = await db.select({ title: mataKuliah.title }).from(mataKuliah).where(eq(mataKuliah.id, courseId)).limit(1);
    const [legacy] = canonical || !legacyCourseId ? [] : await db.select({ title: courses.title }).from(courses)
      .where(eq(courses.id, legacyCourseId)).limit(1);
    const title = canonical?.title ?? legacy?.title;
    return title ? { course: { id: courseId, slug: legacyCourseId ?? courseId, title }, legacyId: legacyCourseId } : null;
  }
  const identity = await resolveCourseIdentity(scope.courseKey);
  if (!identity || (identity.status !== "active" && !identity.legacyId)) return null;
  return { course: { id: identity.primaryId, slug: identity.slug, title: identity.title }, legacyId: identity.legacyId, status: identity.status };
}

function snapshotAnswer(value: unknown, options: string[]): string {
  if (typeof value === "number") return options[value] ?? String.fromCharCode(65 + value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((choice) => snapshotAnswer(choice, options)).filter(Boolean).join(", ");
  const { text, fileName } = object(value);
  return [text, fileName].filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).join(" ");
}

export const assessmentReadServices: AssessmentReadServices = {
  session: getAuthSession,
  async isAdmin(id) {
    await ensureLegacyIdentity(id);
    return hasPeran(id, "admin");
  },
  async isTutor(id) {
    await ensureLegacyIdentity(id);
    return hasPeran(id, "tutor", { allowAdmin: false });
  },

  async quizzes(scope) {
    const resolved = await authorizedCourse(scope);
    if (!resolved) return null;
    const { course } = resolved;
    const [rows, bankRows] = await Promise.all([
      getTutorQuizzesWithAttribution(course.id),
      getTutorQuestionBank(course.id) as Promise<Array<typeof aiQuestionBank.$inferSelect>>,
    ]);
    if (bankRows.length) {
      const requestId = crypto.randomUUID();
      await db.transaction((tx) => scope.role === "tutor" ? recordStaffCourseDisclosures(tx, {
        userId: scope.actorId, courseId: course.id, questionIds: bankRows.map((row) => row.id),
        contextId: "question-bank", requestId,
      }) : recordAuthorizedGlobalDisclosures(tx, {
        userId: scope.actorId, questions: bankRows.map((row) => ({ questionId: row.id, courseId: row.courseId })), requestId,
      }));
    }
    return { course, quizzes: rows.map((row) => quizRow(row, scope.role)), bank: bankRows.map(bankQuestion) };
  },

  async preview(scope, quizId) {
    const resolved = await authorizedCourse(scope);
    if (!resolved || !(await getTutorQuizWithAttribution(resolved.course.id, quizId))) return null;
    const preview = await getQuizTemplatePreviewAction(resolved.course.id, quizId);
    return preview.questions.map((row) => ({
      id: row.id, revision: 0, prompt: row.prompt, type: type(row.questionType),
      options: strings(row.options), correctIndices: integers(row.correctIndices),
      acceptableAnswers: [], explanation: row.explanation,
    }));
  },

  async attempts(scope, quizId) {
    const resolved = await authorizedCourse(scope);
    if (!resolved) return null;
    const quiz = await getTutorQuizWithAttribution(resolved.course.id, quizId);
    if (!quiz) return null;
    const rows = await db.select({
      id: studentQuizAttempts.id, studentName: user.name, studentEmail: user.email,
      durationSeconds: studentQuizAttempts.durationSeconds, score: studentQuizAttempts.score,
      status: studentQuizAttempts.status, gradingStatus: studentQuizAttempts.gradingStatus,
      submittedAt: studentQuizAttempts.submittedAt, questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
    }).from(studentQuizAttempts)
      .innerJoin(quizTemplates, and(eq(quizTemplates.id, studentQuizAttempts.templateId), eq(quizTemplates.courseId, quiz.courseId)))
      .leftJoin(user, eq(user.id, studentQuizAttempts.studentId))
      .where(eq(studentQuizAttempts.templateId, quizId))
      .orderBy(desc(studentQuizAttempts.startedAt));
    const questionsShown = authorizedSnapshotDisclosures(quiz.courseId, rows.map((row) => json(row.questionsSnapshot)));
    await db.transaction((tx) => recordAuthorizedGlobalDisclosures(tx, {
      userId: scope.actorId, questions: questionsShown, requestId: crypto.randomUUID(),
    }));
    return {
      quizTitle: quiz.title,
      attempts: rows.map((row) => {
        const answers = object(row.answersSnapshot);
        return {
          id: row.id, templateId: quizId, quizTitle: quiz.title,
          studentName: row.studentName ?? "Tanpa nama", studentEmail: row.studentEmail ?? "",
          durationSeconds: row.durationSeconds ?? 0, submittedAt: iso(row.submittedAt), score: row.score, remainingEssays: 0,
          status: row.status === "completed" ? row.gradingStatus === "pending" ? "pending" : "graded" : row.status,
          questions: array(row.questionsSnapshot).flatMap((value) => {
            const snapshot = object(value);
            if (typeof snapshot.id !== "string") return [];
            const options = strings(snapshot.options);
            return [{
              id: snapshot.id,
              prompt: typeof snapshot.prompt === "string" ? snapshot.prompt : typeof snapshot.content === "string" ? snapshot.content : "",
              answer: snapshotAnswer(answers[snapshot.id], options),
              answerKey: snapshotAnswer(snapshot.correct_indices ?? snapshot.correctIndices, options) || undefined,
            }];
          }),
        };
      }),
    };
  },

  async grading(scope) {
    const rows = await getCoursePendingQuizAttempts(scope.courseKey, scope.actorId);
    return rows.map((row) => ({
      id: row.id, templateId: row.templateId, quizTitle: row.quizTitle, studentName: row.studentName ?? "Tanpa nama",
      studentEmail: row.studentEmail ?? "", submittedAt: iso(row.submittedAt), score: null, status: "pending",
      durationSeconds: 0, remainingEssays: row.remainingEssayCount,
    }));
  },

  async gradeDetails(scope, attemptId) {
    const resolved = await authorizedCourse(scope);
    if (!resolved) return null;
    const [attempt] = await db.select({
      templateId: studentQuizAttempts.templateId, durationSeconds: studentQuizAttempts.durationSeconds,
    }).from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, attemptId), eq(studentQuizAttempts.status, "completed"))).limit(1);
    if (!attempt || !(await getTutorQuizWithAttribution(resolved.course.id, attempt.templateId))) return null;
    const detail = await getQuizAttemptDetailsForGrading(scope.courseKey, attemptId, scope.actorId);
    if (!detail) return null;
    return {
      id: detail.attemptId, templateId: detail.templateId, quizTitle: detail.quizTitle, studentName: detail.studentName ?? "Tanpa nama",
      studentEmail: detail.studentEmail ?? "", submittedAt: iso(detail.submittedAt), score: detail.score,
      status: detail.gradingStatus === "pending" ? "pending" : "graded", durationSeconds: attempt.durationSeconds ?? 0,
      remainingEssays: detail.questions.filter((row) => row.isEssay && row.currentScore === null).length,
      answers: detail.questions.map((row) => ({
        questionId: row.id, prompt: row.prompt, type: type(row.questionType), submittedAnswer: row.submittedText,
        attachmentLabel: row.fileName ?? undefined, attachmentAvailable: Boolean(row.fileKey),
        automaticScore: row.isEssay ? null : row.isDeterministicCorrect ? 100 : 0,
        reviewScore: row.reviewRevision > 0 ? row.currentScore : null, reviewNotes: row.reviewNotes, revision: row.reviewRevision,
      })),
    };
  },

  async tryouts(scope) {
    const resolved = await authorizedCourse(scope);
    if (!resolved) return null;
    const { course, legacyId } = resolved;
    const courseId = legacyId ?? course.id;
    const canSaveDraft = resolved.status === "active" && legacyId !== null;
    const [rows, bankRows] = await Promise.all([
      db.select().from(exams).where(and(eq(exams.courseId, courseId), eq(exams.type, "tryout"))).orderBy(desc(exams.createdAt)),
      canSaveDraft ? db.select({
        id: aiQuestionBank.id, courseId: aiQuestionBank.courseId, prompt: aiQuestionBank.prompt, type: aiQuestionBank.questionType,
        difficulty: aiQuestionBank.difficulty, tags: aiQuestionBank.tags,
      }).from(aiQuestionBank).where(selectableTryoutBankCondition([course.id, courseId]))
        .orderBy(desc(aiQuestionBank.createdAt), asc(aiQuestionBank.id)) : [],
    ]);
    const draftIds = canSaveDraft ? rows.filter((row) => row.status === "draft").map((row) => row.id) : [];
    const [contents, usedDrafts] = await Promise.all([
      rows.length ? db.select().from(questions)
        .where(inArray(questions.examId, rows.map((row) => row.id))).orderBy(asc(questions.order), asc(questions.id)) : [],
      draftIds.length ? db.selectDistinct({ examId: submissions.examId }).from(submissions)
        .where(inArray(submissions.examId, draftIds)) : [],
    ]);
    const usedDraftIds = new Set(usedDrafts.map((row) => row.examId));
    const disclosures = bankRows.map((row) => ({ questionId: row.id, courseId: row.courseId }));
    const questionsByExam = new Map<string, AssessmentTryout["questions"]>();
    const rowsByExam = new Map<string, (typeof questions.$inferSelect)[]>();
    for (const row of contents) {
      const fields = object(row.content);
      const bankQuestionId = tryoutBankQuestionId(row.content);
      if (bankQuestionId) disclosures.push({ questionId: bankQuestionId, courseId });
      else if (!Object.keys(fields).length) disclosures.push(...authorizedSnapshotDisclosures(courseId, [null]));
      const items = questionsByExam.get(row.examId) ?? [];
      const questionType = type(row.type);
      items.push({
        id: row.id, revision: 0, type: questionType, order: row.order,
        prompt: typeof fields.prompt === "string" ? fields.prompt : "", options: strings(fields.options),
        correctIndices: tryoutCorrectIndices(questionType, fields),
        acceptableAnswers: strings(fields.acceptableAnswers), acceptsFile: fields.acceptsFile === true, bankQuestionId,
      });
      questionsByExam.set(row.examId, items);
      const rawRows = rowsByExam.get(row.examId) ?? [];
      rawRows.push(row);
      rowsByExam.set(row.examId, rawRows);
    }
    await db.transaction((tx) => recordAuthorizedGlobalDisclosures(tx, {
      userId: scope.actorId, questions: disclosures, requestId: crypto.randomUUID(),
    }));
    return {
      course, canSaveDraft, canSaveMetadata: canSaveDraft,
      bank: bankRows.map((row) => ({ id: row.id, prompt: row.prompt, type: type(row.type), difficulty: row.difficulty, tags: strings(row.tags) })),
      tryouts: rows.map((row) => {
        const settings = object(row.settings);
        return {
          id: row.id, revision: 0, metadataRevision: tryoutMetadataRevision(row), title: row.title, status: row.status,
          questionSetRevision: canSaveDraft && row.status === "draft" && !usedDraftIds.has(row.id)
            ? tryoutQuestionSetRevision(row, rowsByExam.get(row.id) ?? []) : undefined,
          timeLimitMinutes: number(settings.timeLimitMinutes, 90), maxAttempts: number(settings.maxAttempts, 2),
          openAt: iso(row.openAt), closeAt: iso(row.closeAt), questions: questionsByExam.get(row.id) ?? [],
        };
      }),
    };
  },
};
