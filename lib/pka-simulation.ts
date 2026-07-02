/**
 * Multi-stage PKA simulation gating engine for the Tutorial PKA campaign.
 *
 * Mirrors the real PKA test flow: Stage 1 -> Stage 2 -> Stage 3 per subject;
 * passing a stage skips the remaining ones. Deliberately does not touch
 * studentConceptMastery/knowledgeObjects/remediation - those generic systems
 * are out of scope for this seasonal, lean campaign course.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pkaSimulationStages, pkaStageProgress, studentQuizAttempts } from "@/db/schema";
import { PKA_STAGES, type PkaStage, type PkaSubject } from "@/lib/pka-config";

export type PkaStageStatus = "locked" | "unlocked" | "completed" | "skipped";

export interface PkaStageState {
  stage: PkaStage;
  quizTemplateId: string;
  passScoreThreshold: number;
  status: PkaStageStatus;
  bestScore: number | null;
  passed: boolean | null;
  attemptId: string | null;
}

/** Seeds stage-1-unlocked/stage-2-3-locked progress rows on first visit to a subject. Idempotent. */
export async function ensureStageProgressInitialized(studentId: string, subject: PkaSubject): Promise<void> {
  const existing = await db
    .select({ stage: pkaStageProgress.stage })
    .from(pkaStageProgress)
    .where(and(eq(pkaStageProgress.studentId, studentId), eq(pkaStageProgress.subject, subject)));

  const existingStages = new Set(existing.map((r) => r.stage));
  const missing = PKA_STAGES.filter((s) => !existingStages.has(s));
  if (missing.length === 0) return;

  await db
    .insert(pkaStageProgress)
    .values(
      missing.map((stage) => ({
        id: randomUUID(),
        studentId,
        subject,
        stage,
        status: stage === 1 ? ("unlocked" as const) : ("locked" as const),
      })),
    )
    .onConflictDoNothing();
}

/** Returns the 3 stages for a subject merged with this student's progress, seeding progress if needed. */
export async function getSubjectStageState(studentId: string, subject: PkaSubject): Promise<PkaStageState[]> {
  await ensureStageProgressInitialized(studentId, subject);

  const [stages, progress] = await Promise.all([
    db
      .select()
      .from(pkaSimulationStages)
      .where(eq(pkaSimulationStages.subject, subject))
      .orderBy(pkaSimulationStages.stage),
    db
      .select()
      .from(pkaStageProgress)
      .where(and(eq(pkaStageProgress.studentId, studentId), eq(pkaStageProgress.subject, subject))),
  ]);

  const progressByStage = new Map(progress.map((p) => [p.stage, p]));

  return stages.map((s) => {
    const p = progressByStage.get(s.stage);
    return {
      stage: s.stage as PkaStage,
      quizTemplateId: s.quizTemplateId,
      passScoreThreshold: s.passScoreThreshold,
      status: p?.status ?? (s.stage === 1 ? "unlocked" : "locked"),
      bestScore: p?.bestScore ?? null,
      passed: p?.passed ?? null,
      attemptId: p?.attemptId ?? null,
    };
  });
}

async function upsertStageStatusIfLower(
  studentId: string,
  subject: PkaSubject,
  stage: PkaStage,
  status: PkaStageStatus,
): Promise<void> {
  const [current] = await db
    .select({ status: pkaStageProgress.status })
    .from(pkaStageProgress)
    .where(and(eq(pkaStageProgress.studentId, studentId), eq(pkaStageProgress.subject, subject), eq(pkaStageProgress.stage, stage)))
    .limit(1);

  // Never regress a stage the student has actually completed or already skipped past.
  if (current && (current.status === "completed" || current.status === "skipped")) return;

  if (current) {
    await db
      .update(pkaStageProgress)
      .set({ status })
      .where(and(eq(pkaStageProgress.studentId, studentId), eq(pkaStageProgress.subject, subject), eq(pkaStageProgress.stage, stage)));
  } else {
    await db
      .insert(pkaStageProgress)
      .values({ id: randomUUID(), studentId, subject, stage, status })
      .onConflictDoNothing();
  }
}

/**
 * Applies the pass/fail gating rule after a stage attempt is graded. Called
 * server-side (from the stage page render, not a client callback) whenever a
 * completed attempt for a PKA stage template hasn't been recorded yet.
 * Idempotent: safe to call more than once for the same attempt.
 */
export async function recordPkaStageResult(attemptId: string): Promise<void> {
  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);
  if (!attempt || attempt.status !== "completed" || attempt.score == null) return;

  const [stageRow] = await db
    .select()
    .from(pkaSimulationStages)
    .where(eq(pkaSimulationStages.quizTemplateId, attempt.templateId))
    .limit(1);
  if (!stageRow) return; // Not a PKA simulation attempt.

  const subject = stageRow.subject;
  const stage = stageRow.stage as PkaStage;
  const passed = attempt.score >= stageRow.passScoreThreshold;

  const [existing] = await db
    .select()
    .from(pkaStageProgress)
    .where(and(eq(pkaStageProgress.studentId, attempt.studentId), eq(pkaStageProgress.subject, subject), eq(pkaStageProgress.stage, stage)))
    .limit(1);

  if (existing?.attemptId === attempt.id && existing.status === "completed") return; // Already recorded.

  const bestScore = existing?.bestScore != null ? Math.max(existing.bestScore, attempt.score) : attempt.score;

  if (existing) {
    await db
      .update(pkaStageProgress)
      .set({ status: "completed", bestScore, passed, attemptId: attempt.id })
      .where(eq(pkaStageProgress.id, existing.id));
  } else {
    await db.insert(pkaStageProgress).values({
      id: randomUUID(),
      studentId: attempt.studentId,
      subject,
      stage,
      status: "completed",
      bestScore,
      passed,
      attemptId: attempt.id,
    });
  }

  if (passed) {
    for (const laterStage of PKA_STAGES.filter((s) => s > stage)) {
      await upsertStageStatusIfLower(attempt.studentId, subject, laterStage, "skipped");
    }
  } else {
    const nextStage = (stage + 1) as PkaStage;
    if (PKA_STAGES.includes(nextStage)) {
      await upsertStageStatusIfLower(attempt.studentId, subject, nextStage, "unlocked");
    }
  }
}

export type PkaSubjectDiagnosticStatus = "not_attempted" | "at_risk" | "borderline" | "solid";

export interface PkaSubjectDiagnostic {
  subject: PkaSubject;
  attempted: boolean;
  passedAtStage: PkaStage | null;
  bestScore: number | null;
  status: PkaSubjectDiagnosticStatus;
  message: string;
}

const SUBJECT_LABEL: Record<PkaSubject, string> = { matematika: "Matematika", fisika: "Fisika", kimia: "Kimia" };

/**
 * Deterministic, zero-AI framing rule (per AGENT_CONTEXT.md money rule) off
 * which stage the student cleared. Illustrative only, not a real prediction
 * model - copy must stay explicit that it is not the official ITB result.
 */
export function computeSclFraming(subject: PkaSubject, stages: PkaStageState[]): PkaSubjectDiagnostic {
  const label = SUBJECT_LABEL[subject];
  const attempted = stages.some((s) => s.status === "completed");
  const passedStage = stages.find((s) => s.passed === true)?.stage ?? null;
  const bestScore = stages.reduce<number | null>((max, s) => (s.bestScore != null && (max == null || s.bestScore > max) ? s.bestScore : max), null);
  const stage3 = stages.find((s) => s.stage === 3);

  if (!attempted) {
    return { subject, attempted, passedAtStage: null, bestScore, status: "not_attempted", message: `Belum mencoba simulasi ${label}.` };
  }

  if (passedStage === 1 || passedStage === 2) {
    return {
      subject,
      attempted,
      passedAtStage: passedStage,
      bestScore,
      status: "solid",
      message: `Lolos di Stage ${passedStage} - kesiapan ${label} kamu terlihat solid pada simulasi ini.`,
    };
  }

  if (passedStage === 3) {
    return {
      subject,
      attempted,
      passedAtStage: 3,
      bestScore,
      status: "borderline",
      message: `Baru lolos di Stage 3 untuk ${label} - disarankan tetap perkuat konsep dasarnya.`,
    };
  }

  if (stage3?.status === "completed" && stage3.passed === false) {
    return {
      subject,
      attempted,
      passedAtStage: null,
      bestScore,
      status: "at_risk",
      message: `Belum lolos satu pun stage simulasi ${label} - berpotensi diarahkan ke pendampingan tambahan (SCL) untuk mapel ini.`,
    };
  }

  return { subject, attempted, passedAtStage: null, bestScore, status: "not_attempted", message: `Simulasi ${label} belum selesai.` };
}

export async function getDiagnosticSummary(studentId: string, subjects: readonly PkaSubject[]): Promise<PkaSubjectDiagnostic[]> {
  const results = await Promise.all(
    subjects.map(async (subject) => {
      const stages = await getSubjectStageState(studentId, subject);
      return computeSclFraming(subject, stages);
    }),
  );
  return results;
}
