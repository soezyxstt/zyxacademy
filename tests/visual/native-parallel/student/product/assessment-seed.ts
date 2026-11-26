import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../../../../../db/schema";
import { PERAN_SEEDS, membershipIdFor } from "../../../../../lib/auth/peran";
import { solutionCollectionFixture } from "../../../../../app/visual-fixtures/solution-collection/fixture";
import { assessmentEvidence as data } from "./assessment-data";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/student_evidence") {
  throw new Error("Expected the disposable loopback Student evidence database");
}
const [learner, free] = data.accounts.map((account) => `student-evidence-${account}`);
const chapterId = `${data.course}-chapter`;
const canonicalId = `${data.course}-canonical`;
const importId = `${data.course}-import`;
const now = new Date();
const expiresAt = new Date(now.getTime() + 7 * 86_400_000);
const submittedAt = new Date(data.dates.submitted);
const bank = [
  { id: `${data.quiz}-1`, prompt: "Pilih nilai limit dari $2x + 1$ saat $x$ mendekati $2$.", question_type: "multiple_choice" as const,
    options: ["Tiga", "Empat", "Lima", "Enam"], correct_indices: [2], explanation: "Substitusikan $x=2$ karena fungsi linear kontinu." },
  { id: `${data.quiz}-2`, prompt: "Jelaskan cara menentukan nilai limit tersebut.", question_type: "essay" as const,
    options: [], correct_indices: [], explanation: "Gunakan sifat kekontinuan untuk mengevaluasi nilai limit." },
];
const tryoutQuestion = { id: `${data.tryout}-1`, order: 1, type: "multiple_choice", prompt: "Pilih bilangan genap.", options: ["Satu", "Dua", "Tiga"],
  correctIndex: 1, explanation: "Dua habis dibagi dua." };
const essay = { id: `${data.tryout}-2`, order: 2, type: "essay", prompt: "Jelaskan alasan jawaban Anda.", options: [] };
const collection = { ...solutionCollectionFixture, id: data.solution, course: { id: canonicalId, title: data.courseTitle },
  chapter: { id: chapterId, title: "Limit dan kekontinuan" } };
const connection = new Client({ connectionString: url.href });
await connection.connect();
try {
  await drizzle(connection).transaction(async tx => {
    await tx.insert(schema.peran).values([...PERAN_SEEDS]).onConflictDoNothing();
    for (const [id, name] of [[learner, "Laras"], [free, "Bayu"]]) {
      await tx.insert(schema.user).values({ id, name, email: `${id}@example.invalid`, role: "student", faculty: "FMIPA", major: "Matematika", entryYear: 2025 }).onConflictDoNothing();
      await tx.insert(schema.pengguna).values({ id, status: "active" }).onConflictDoNothing();
      await tx.insert(schema.penggunaPeran).values({ id: membershipIdFor(id, "murid"), penggunaId: id,
        peranId: "peran-murid", source: "better_auth_user_create" }).onConflictDoNothing();
      const values = { token: randomUUID(), expiresAt };
      await tx.insert(schema.session).values({ id, userId: id, ...values }).onConflictDoUpdate({ target: schema.session.id, set: values });
    }
    await tx.insert(schema.courses).values({ id: data.course, title: data.courseTitle, category: "Matematika" }).onConflictDoNothing();
    await tx.insert(schema.mataKuliah).values({ id: canonicalId, code: "MA-ASSESSMENT", title: data.courseTitle, legacyCourseId: data.course }).onConflictDoNothing();
    await tx.insert(schema.bab).values({ id: chapterId, mataKuliahId: canonicalId, code: "B1", orderIndex: 0, title: collection.chapter.title }).onConflictDoNothing();
    await tx.insert(schema.enrollments).values({ id: learner, userId: learner, courseId: data.course, expiresAt }).onConflictDoUpdate({ target: schema.enrollments.id, set: { expiresAt } });
    await tx.insert(schema.pendaftaranMurid).values({ id: learner, penggunaId: learner, mataKuliahId: canonicalId, endAt: expiresAt }).onConflictDoUpdate({ target: schema.pendaftaranMurid.id, set: { endAt: expiresAt } });
    await tx.insert(schema.quizTemplates).values({ id: data.quiz, courseId: data.course, title: data.quizTitle, category: "chapter", status: "published", visibility: "paid",
      timeLimitSeconds: 900, maxAttempts: 3, manualStatus: "open", selectionRules: { count: bank.length, fixedQuestionIds: bank.map(({ id }) => id), explanationRelease: "immediate" } }).onConflictDoNothing();
    await tx.insert(schema.aiQuestionBank).values(bank.map((question) => ({ id: question.id, courseId: data.course, prompt: question.prompt,
      options: question.options, correctIndices: question.correct_indices, questionType: question.question_type, explanation: question.explanation, reviewStatus: "published" as const }))).onConflictDoNothing();
    await tx.insert(schema.studentQuizAttempts).values({ id: data.active, studentId: learner, templateId: data.quiz,
      startedAt: now, status: "in_progress", questionsSnapshot: bank }).onConflictDoUpdate({
        target: schema.studentQuizAttempts.id,
        set: { startedAt: now, submittedAt: null, status: "in_progress", gradingStatus: "not_required", score: null,
          durationSeconds: null, questionsSnapshot: bank, answersSnapshot: null },
      });
    await tx.insert(schema.studentQuizAttempts).values({ id: data.finished, studentId: learner, templateId: data.quiz, startedAt: new Date(submittedAt.getTime() - 78_000), submittedAt,
      status: "completed", score: 85, durationSeconds: 78, gradingStatus: "graded", questionsSnapshot: bank,
      answersSnapshot: { [bank[0].id]: [2], [bank[1].id]: { text: "Substitusi pada fungsi linear." } } }).onConflictDoNothing();
    const computedMetrics = { quizTitle: data.quizTitle, courseId: data.course, templateId: data.quiz, attemptId: data.finished, score: 85,
      correctCount: 1, incorrectCount: 1, unansweredCount: 0, totalQuestions: 2, durationSeconds: 78,
      conceptMastery: [{ concept: "Limit fungsi", totalQuestions: 2, correctCount: 1, incorrectCount: 1, accuracyPercent: 50, status: "developing" }],
      cognitiveSkills: [], difficultyBreakdown: [], timeAnalysis: { totalDurationSeconds: 78, avgTimePerQuestionSeconds: 39, fastAnswerCount: 0, fastIncorrectCount: 0, slowAnswerCount: 0 },
      historicalComparison: { totalAttemptsAnalyzed: 1, scoreTrend: [85], overallImprovementDelta: 0, consistentlyWeakConcepts: [], improvedConcepts: [] } };
    await tx.insert(schema.studentQuizAnalytics).values({ id: `${data.finished}-analytics`, attemptId: data.finished, studentId: learner, courseId: data.course,
      templateId: data.quiz, status: "completed", computedMetrics }).onConflictDoNothing();
    await tx.insert(schema.exams).values({ id: data.tryout, courseId: data.course, title: data.tryoutTitle, type: "tryout", status: "published",
      settings: { timeLimitMinutes: 90, maxAttempts: 2 } }).onConflictDoNothing();
    await tx.insert(schema.questions).values([tryoutQuestion, essay].map(({ id, order, type, ...content }) => ({ id, examId: data.tryout, order, type, content }))).onConflictDoNothing();
    const snapshots = {
      answersSnapshot: { [tryoutQuestion.id]: { type: tryoutQuestion.type, index: 1 }, [essay.id]: { type: essay.type, text: "Dua habis dibagi dua." } },
      questionsSnapshot: [tryoutQuestion, essay],
    };
    await tx.insert(schema.submissions).values({ id: data.submission, userId: learner, examId: data.tryout, status: "pending_review", attemptNumber: 1,
      submittedAt, ...snapshots }).onConflictDoUpdate({ target: schema.submissions.id, set: snapshots });
    await tx.insert(schema.imporBundle).values({ id: importId, bundleId: importId, courseId: data.course, checksum: "b".repeat(64), bundleType: "product",
      sourceUriOrKey: "local-synthetic.zip", status: "published", requestedBy: learner }).onConflictDoNothing();
    await tx.insert(schema.solutionCollections).values({ id: data.solution, productId: collection.id, version: 1, courseId: canonicalId, chapterId,
      importId, title: collection.title, content: collection, trace: {}, generationHash: "a".repeat(64), status: "published", publishedAt: submittedAt }).onConflictDoNothing();
  });
} finally {
  await connection.end();
}
console.log("Synthetic assessment evidence accounts and content ready");
