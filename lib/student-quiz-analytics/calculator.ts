import { db } from "@/db";
import {
  studentQuizAttempts,
  quizTemplates,
  aiQuestionBank,
  knowledgeObjects,
} from "@/db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type {
  CognitiveSkillFact,
  ComputedQuizMetrics,
  ConceptMasteryFact,
  ConceptMasteryStatus,
  DifficultyFact,
  HistoricalComparisonFact,
  TimeSpeedFact,
  TrendDirection,
} from "./types";

interface QuestionSnapshotItem {
  id: string;
  prompt: string;
  options: string[];
  correct_indices: number[];
  explanation?: string;
  difficulty?: string;
  time_spent_seconds?: number;
}

export async function computeQuizAnalyticsFacts(
  attemptId: string
): Promise<ComputedQuizMetrics> {
  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    throw new Error(`Attempt with id ${attemptId} not found`);
  }

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, attempt.templateId))
    .limit(1);

  const courseId = template?.courseId || "calc-1";
  const quizTitle = template?.title || "Kuis Zyx";

  const questionsSnapshot = (attempt.questionsSnapshot || []) as QuestionSnapshotItem[];
  const answersSnapshot = (attempt.answersSnapshot || {}) as Record<string, number[]>;

  const questionIds = questionsSnapshot.map((q) => q.id);

  // Fetch KO and metadata from bank if available
  const bankRows = questionIds.length > 0
    ? await db
        .select({
          id: aiQuestionBank.id,
          koId: aiQuestionBank.knowledgeObjectId,
          conceptName: knowledgeObjects.conceptName,
          tags: aiQuestionBank.tags,
          bloomLevel: aiQuestionBank.bloomLevel,
          difficulty: aiQuestionBank.difficulty,
          explanation: aiQuestionBank.explanation,
        })
        .from(aiQuestionBank)
        .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
        .where(inArray(aiQuestionBank.id, questionIds))
    : [];

  const bankMap = new Map(bankRows.map((r) => [r.id, r]));

  // Evaluate correctness per question
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const conceptStatsMap = new Map<string, { total: number; correct: number; subconcepts: Set<string> }>();
  const skillStatsMap = new Map<string, { total: number; correct: number }>();
  const difficultyStatsMap = new Map<string, { total: number; correct: number }>();

  let totalDuration = attempt.durationSeconds ?? 0;
  const avgTimePerQuestion = questionsSnapshot.length > 0 ? Math.round(totalDuration / questionsSnapshot.length) : 0;
  let fastAnswerCount = 0;
  let fastIncorrectCount = 0;

  for (const q of questionsSnapshot) {
    const submitted = answersSnapshot[q.id] || [];
    const bank = bankMap.get(q.id);

    if (!submitted || submitted.length === 0) {
      unansweredCount++;
    }

    const isCorrect =
      submitted.length === q.correct_indices.length &&
      submitted.every((val) => q.correct_indices.includes(val));

    if (isCorrect) {
      correctCount++;
    } else if (submitted.length > 0) {
      incorrectCount++;
    }

    // Time analysis
    const spentSec = q.time_spent_seconds ?? avgTimePerQuestion;
    if (spentSec > 0 && spentSec < 15) {
      fastAnswerCount++;
      if (!isCorrect) fastIncorrectCount++;
    }

    // Concept grouping
    const conceptName = (bank?.conceptName || "Konsep Umum").trim();
    if (!conceptStatsMap.has(conceptName)) {
      conceptStatsMap.set(conceptName, { total: 0, correct: 0, subconcepts: new Set() });
    }
    const cEntry = conceptStatsMap.get(conceptName)!;
    cEntry.total++;
    if (isCorrect) cEntry.correct++;

    // Extract subconcepts from tags or KO
    const rawTags = bank?.tags;
    if (Array.isArray(rawTags)) {
      for (const tag of rawTags) {
        if (typeof tag === "string" && tag.toLowerCase() !== conceptName.toLowerCase()) {
          cEntry.subconcepts.add(tag);
        }
      }
    }

    // Cognitive skills mapping
    const bloom = bank?.bloomLevel || "apply";
    const skillLabel = mapBloomToSkillLabel(bloom);
    if (!skillStatsMap.has(skillLabel)) {
      skillStatsMap.set(skillLabel, { total: 0, correct: 0 });
    }
    const sEntry = skillStatsMap.get(skillLabel)!;
    sEntry.total++;
    if (isCorrect) sEntry.correct++;

    // Difficulty mapping
    const diff = (q.difficulty || bank?.difficulty || "medium").toLowerCase();
    if (!difficultyStatsMap.has(diff)) {
      difficultyStatsMap.set(diff, { total: 0, correct: 0 });
    }
    const dEntry = difficultyStatsMap.get(diff)!;
    dEntry.total++;
    if (isCorrect) dEntry.correct++;
  }

  const score = attempt.score ?? (questionsSnapshot.length > 0 ? Math.round((correctCount / questionsSnapshot.length) * 100) : 0);

  // Fetch past completed attempts of this student for historical trends
  const pastAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      score: studentQuizAttempts.score,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.studentId, attempt.studentId),
        eq(studentQuizAttempts.templateId, attempt.templateId),
        eq(studentQuizAttempts.status, "completed"),
        ne(studentQuizAttempts.id, attemptId)
      )
    )
    .orderBy(desc(studentQuizAttempts.submittedAt))
    .limit(5);

  // Calculate concept mastery facts
  const conceptMastery: ConceptMasteryFact[] = [];
  for (const [concept, stats] of conceptStatsMap.entries()) {
    const accuracyPercent = Math.round((stats.correct / stats.total) * 100);
    const status = determineMasteryStatus(stats.total, accuracyPercent);

    // Compute previous accuracy for this concept from past attempts if available
    let prevAcc: number | undefined;
    let trend: TrendDirection = "insufficient_evidence";

    if (pastAttempts.length > 0) {
      const pastCorrect: number[] = [];
      for (const pAtt of pastAttempts) {
        const pQuestions = (pAtt.questionsSnapshot || []) as QuestionSnapshotItem[];
        const pAnswers = (pAtt.answersSnapshot || {}) as Record<string, number[]>;
        for (const pq of pQuestions) {
          const pBank = bankMap.get(pq.id);
          if ((pBank?.conceptName || "Konsep Umum").trim() === concept) {
            const pSubmitted = pAnswers[pq.id] || [];
            const pIsCorrect =
              pSubmitted.length === pq.correct_indices.length &&
              pSubmitted.every((val) => pq.correct_indices.includes(val));
            pastCorrect.push(pIsCorrect ? 1 : 0);
          }
        }
      }
      if (pastCorrect.length > 0) {
        prevAcc = Math.round((pastCorrect.reduce((a, b) => a + b, 0) / pastCorrect.length) * 100);
        if (accuracyPercent >= prevAcc + 10) trend = "improving";
        else if (accuracyPercent <= prevAcc - 10) trend = "declining";
        else trend = "stable";
      }
    }

    conceptMastery.push({
      concept,
      totalQuestions: stats.total,
      correctCount: stats.correct,
      incorrectCount: stats.total - stats.correct,
      accuracyPercent,
      status,
      previousAccuracyPercent: prevAcc,
      trend,
      subconcepts: Array.from(stats.subconcepts).slice(0, 3),
    });
  }

  // Calculate Cognitive skill facts
  const cognitiveSkills: CognitiveSkillFact[] = [];
  for (const [skill, stats] of skillStatsMap.entries()) {
    const acc = Math.round((stats.correct / stats.total) * 100);
    cognitiveSkills.push({
      skill,
      totalQuestions: stats.total,
      correctCount: stats.correct,
      accuracyPercent: acc,
      status: determineMasteryStatus(stats.total, acc),
    });
  }

  // Difficulty facts
  const difficultyBreakdown: DifficultyFact[] = [];
  for (const [diff, stats] of difficultyStatsMap.entries()) {
    difficultyBreakdown.push({
      difficulty: diff,
      totalQuestions: stats.total,
      correctCount: stats.correct,
      accuracyPercent: Math.round((stats.correct / stats.total) * 100),
    });
  }

  // Historical comparison facts
  const scoreTrend = pastAttempts.map((a) => a.score ?? 0).reverse();
  scoreTrend.push(score);
  const firstScore = scoreTrend[0] ?? score;
  const overallImprovementDelta = score - firstScore;

  const consistentlyWeakConcepts = conceptMastery
    .filter((c) => c.status === "needs_reinforcement" || c.status === "developing")
    .map((c) => c.concept);

  const improvedConcepts = conceptMastery
    .filter((c) => c.trend === "improving")
    .map((c) => c.concept);

  const historicalComparison: HistoricalComparisonFact = {
    totalAttemptsAnalyzed: scoreTrend.length,
    scoreTrend,
    overallImprovementDelta,
    consistentlyWeakConcepts,
    improvedConcepts,
  };

  const timeAnalysis: TimeSpeedFact = {
    totalDurationSeconds: totalDuration,
    avgTimePerQuestionSeconds: avgTimePerQuestion,
    fastAnswerCount,
    fastIncorrectCount,
    slowAnswerCount: questionsSnapshot.filter((q) => (q.time_spent_seconds ?? 0) > 120).length,
  };

  return {
    quizTitle,
    courseId,
    templateId: attempt.templateId,
    attemptId,
    score,
    correctCount,
    incorrectCount,
    unansweredCount,
    totalQuestions: questionsSnapshot.length,
    durationSeconds: totalDuration,
    conceptMastery,
    cognitiveSkills,
    difficultyBreakdown,
    timeAnalysis,
    historicalComparison,
  };
}

function determineMasteryStatus(total: number, accuracyPercent: number): ConceptMasteryStatus {
  if (total < 2) return "insufficient_evidence";
  if (accuracyPercent >= 85) return "strong";
  if (accuracyPercent >= 70) return "adequate";
  if (accuracyPercent >= 50) return "developing";
  return "needs_reinforcement";
}

function mapBloomToSkillLabel(bloom: string): string {
  const b = bloom.toLowerCase();
  if (b.includes("remember")) return "Mengingat Konsep";
  if (b.includes("understand")) return "Memahami Hubungan";
  if (b.includes("apply")) return "Menerapkan Rumus";
  if (b.includes("analyze") || b.includes("eval")) return "Menganalisis Situasi Baru";
  if (b.includes("create") || b.includes("multistep")) return "Perhitungan Multilangkah";
  return "Menerapkan Rumus";
}
