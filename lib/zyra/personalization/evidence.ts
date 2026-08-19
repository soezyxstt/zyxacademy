import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { daysFrom } from "@/lib/date-utils";
import {
  zyraLearnerPreferences,
  zyraLearnerProfiles,
  zyraLearningEvents,
} from "@/db/schema";
import {
  ZYRA_EVIDENCE_RETENTION_DAYS,
  ZyraLearnerPreferencesSchema,
  ZyraLearningEventInputSchema,
  type ZyraAdaptationDecision,
  type ZyraEvidenceRow,
  type ZyraLearnerPreferences,
  type ZyraLearningEventInput,
} from "./contracts";

function nullableDate(value: Date | null | undefined): Date | null {
  return value instanceof Date ? value : null;
}

export async function loadZyraEvidence(input: {
  studentId: string;
  courseId: string;
  after?: Date | null;
  limit?: number;
}): Promise<ZyraEvidenceRow[]> {
  const now = new Date();
  const rows = await db
    .select({
      eventKind: zyraLearningEvents.eventKind,
      sourceType: zyraLearningEvents.sourceType,
      evidenceRef: zyraLearningEvents.evidenceRef,
      outcome: zyraLearningEvents.outcome,
      correctness: zyraLearningEvents.correctness,
      responseLatencyBucket: zyraLearningEvents.responseLatencyBucket,
      hintLevel: zyraLearningEvents.hintLevel,
      representation: zyraLearningEvents.representation,
      weight: zyraLearningEvents.weight,
      createdAt: zyraLearningEvents.createdAt,
      expiresAt: zyraLearningEvents.expiresAt,
    })
    .from(zyraLearningEvents)
    .where(and(
      eq(zyraLearningEvents.studentId, input.studentId),
      eq(zyraLearningEvents.courseId, input.courseId),
      input.after ? gt(zyraLearningEvents.createdAt, input.after) : undefined,
      or(isNull(zyraLearningEvents.expiresAt), gt(zyraLearningEvents.expiresAt, now)),
    ))
    .orderBy(desc(zyraLearningEvents.createdAt))
    .limit(Math.min(input.limit ?? 200, 500));

  return rows.map((row) => ({
    eventKind: row.eventKind,
    sourceType: row.sourceType,
    evidenceRef: row.evidenceRef,
    outcome: row.outcome,
    correctness: row.correctness,
    responseLatencyBucket: row.responseLatencyBucket,
    hintLevel: row.hintLevel,
    representation: row.representation,
    weight: row.weight,
    createdAt: row.createdAt,
    expiresAt: nullableDate(row.expiresAt),
  }));
}

export async function recordZyraLearningEvent(
  studentId: string,
  input: ZyraLearningEventInput,
): Promise<void> {
  const parsed = ZyraLearningEventInputSchema.parse(input);
  const now = new Date();
  await db.insert(zyraLearningEvents).values({
    id: randomUUID(),
    studentId,
    courseId: parsed.courseId,
    ideaId: parsed.ideaId ?? null,
    eventKind: parsed.eventKind,
    sourceType: parsed.sourceType,
    evidenceRef: parsed.evidenceRef ?? null,
    outcome: parsed.outcome ?? "unknown",
    correctness: parsed.correctness ?? null,
    responseLatencyBucket: parsed.responseLatencyBucket ?? "unknown",
    hintLevel: parsed.hintLevel ?? "unknown",
    representation: parsed.representation ?? "unknown",
    weight: parsed.weight ?? 1,
    createdAt: now,
    expiresAt: daysFrom(ZYRA_EVIDENCE_RETENTION_DAYS, now),
  });
}

export async function getZyraLearnerPreferences(
  studentId: string,
  courseId: string,
): Promise<ZyraLearnerPreferences> {
  const [row] = await db
    .select({
      pace: zyraLearnerPreferences.pace,
      representation: zyraLearnerPreferences.representation,
      explanationLength: zyraLearnerPreferences.explanationLength,
      checkpointType: zyraLearnerPreferences.checkpointType,
    })
    .from(zyraLearnerPreferences)
    .where(and(
      eq(zyraLearnerPreferences.studentId, studentId),
      eq(zyraLearnerPreferences.courseId, courseId),
    ))
    .limit(1);

  if (!row) return {};
  return ZyraLearnerPreferencesSchema.parse({
    pace: row.pace ?? undefined,
    representation: row.representation ?? undefined,
    explanationLength: row.explanationLength ?? undefined,
    checkpointType: row.checkpointType ?? undefined,
  });
}

export async function upsertZyraLearnerPreferences(
  studentId: string,
  courseId: string,
  preferences: ZyraLearnerPreferences,
): Promise<ZyraLearnerPreferences> {
  const parsed = ZyraLearnerPreferencesSchema.parse(preferences);
  const existing = await getZyraLearnerPreferences(studentId, courseId);
  const merged = { ...existing, ...parsed };
  const now = new Date();

  await db
    .insert(zyraLearnerPreferences)
    .values({
      id: randomUUID(),
      studentId,
      courseId,
      pace: merged.pace ?? null,
      representation: merged.representation ?? null,
      explanationLength: merged.explanationLength ?? null,
      checkpointType: merged.checkpointType ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [zyraLearnerPreferences.studentId, zyraLearnerPreferences.courseId],
      set: {
        pace: merged.pace ?? null,
        representation: merged.representation ?? null,
        explanationLength: merged.explanationLength ?? null,
        checkpointType: merged.checkpointType ?? null,
        updatedAt: now,
      },
    });

  return merged;
}

export async function getZyraLearnerProfile(studentId: string, courseId: string) {
  const [profile] = await db
    .select()
    .from(zyraLearnerProfiles)
    .where(and(
      eq(zyraLearnerProfiles.studentId, studentId),
      eq(zyraLearnerProfiles.courseId, courseId),
    ))
    .limit(1);
  return profile ?? null;
}

export async function saveZyraLearnerProfile(
  studentId: string,
  courseId: string,
  decision: ZyraAdaptationDecision,
  resetAt: Date | null = null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(zyraLearnerProfiles)
    .values({
      id: randomUUID(),
      studentId,
      courseId,
      profileVersion: decision.profileVersion,
      inferredPace: decision.inferred.pace,
      inferredRepresentation: decision.inferred.representation,
      supportIntensity: decision.inferred.supportIntensity,
      explanationLength: decision.inferred.explanationLength,
      checkpointType: decision.inferred.checkpointType,
      confidence: decision.confidence,
      evidenceCount: decision.evidenceCount,
      reasonCodes: decision.reasonCodes,
      lastEvidenceAt: decision.lastEvidenceAt,
      expiresAt: decision.expiresAt,
      resetAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [zyraLearnerProfiles.studentId, zyraLearnerProfiles.courseId],
      set: {
        profileVersion: decision.profileVersion,
        inferredPace: decision.inferred.pace,
        inferredRepresentation: decision.inferred.representation,
        supportIntensity: decision.inferred.supportIntensity,
        explanationLength: decision.inferred.explanationLength,
        checkpointType: decision.inferred.checkpointType,
        confidence: decision.confidence,
        evidenceCount: decision.evidenceCount,
        reasonCodes: decision.reasonCodes,
        lastEvidenceAt: decision.lastEvidenceAt,
        expiresAt: decision.expiresAt,
        resetAt,
        updatedAt: now,
      },
    });
}

export async function resetZyraLearnerProfile(studentId: string, courseId: string): Promise<void> {
  const now = new Date();
  const existing = await getZyraLearnerProfile(studentId, courseId);
  if (!existing) {
    await db.insert(zyraLearnerProfiles).values({
      id: randomUUID(),
      studentId,
      courseId,
      reasonCodes: ["RESET_BY_LEARNER"],
      resetAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(zyraLearnerProfiles)
    .set({
      inferredPace: "unknown",
      inferredRepresentation: "unknown",
      supportIntensity: "unknown",
      explanationLength: "unknown",
      checkpointType: "unknown",
      confidence: 0,
      evidenceCount: 0,
      reasonCodes: ["RESET_BY_LEARNER"],
      lastEvidenceAt: null,
      expiresAt: null,
      resetAt: now,
      updatedAt: now,
    })
    .where(eq(zyraLearnerProfiles.id, existing.id));
}
