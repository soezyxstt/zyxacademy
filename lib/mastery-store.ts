import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { studentConceptMastery, knowledgeObjects, knowledgeRelationships, studentConceptMasteryHistory } from "@/db/schema";
import { AnalyticsService } from "@/lib/analytics-service";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { evaluateInterventions } from "@/lib/intervention-service";
import { env } from "@/lib/env";
import { recomputeStudyPath } from "@/lib/study-path-service";
export { getIdeaMasteryWithFallback } from "@/lib/pemahaman/compatibility";

export interface MasteryRow {
  conceptName: string;
  masteryScore: number;
  confidence: number;
  evidenceCount: number;
  trend: "improving" | "stable" | "declining" | null;
  blockedBy: string[];
  lastEvidenceAt: Date;
}

/**
 * Collapses KO-level prerequisite edges to a concept-level map.
 * Returns targetConcept -> set of prerequisite source concepts.
 * Pure function (no DB), shared by getMastery and the learning-context fabric (E0).
 */
export function buildPrereqConceptMap(
  koIdToConcept: Map<string, string>,
  edges: Array<{ sourceKoId: string; targetKoId: string }>,
): Map<string, Set<string>> {
  const prereqMap = new Map<string, Set<string>>();
  for (const rel of edges) {
    const srcConcept = koIdToConcept.get(rel.sourceKoId);
    const tgtConcept = koIdToConcept.get(rel.targetKoId);
    if (srcConcept && tgtConcept && srcConcept !== tgtConcept) {
      if (!prereqMap.has(tgtConcept)) {
        prereqMap.set(tgtConcept, new Set());
      }
      prereqMap.get(tgtConcept)!.add(srcConcept);
    }
  }
  return prereqMap;
}

/**
 * Recomputes mastery for every concept of (studentId, courseId) and upserts results.
 * Called by the mastery-recompute-worker Inngest function.
 */
export async function recomputeMastery(studentId: string, courseId: string): Promise<void> {
  // Build conceptId → conceptName mapping for this course
  const kos = await db
    .select({ conceptId: knowledgeObjects.conceptId, conceptName: knowledgeObjects.conceptName })
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.courseId, courseId), eq(knowledgeObjects.status, "active")));

  // Deduplicate: one conceptName per conceptId
  const conceptIdToName = new Map<string, string>();
  const conceptNames = new Set<string>();
  for (const ko of kos) {
    conceptIdToName.set(ko.conceptId, ko.conceptName.trim());
    conceptNames.add(ko.conceptName.trim());
  }

  if (conceptNames.size === 0) return;

  const metrics = await AnalyticsService.calculateCourseMastery(studentId, courseId);
  const now = new Date();

  for (const conceptName of conceptNames) {
    // Find the conceptId for this conceptName (first match)
    const conceptId = [...conceptIdToName.entries()].find(([, name]) => name === conceptName)?.[0];
    if (!conceptId) continue;

    const m = metrics[conceptId];
    if (!m) continue;

    const masteryScore = m.masteryScore;
    const confidence = Math.round(m.confidence * 100);

    await db
      .insert(studentConceptMastery)
      .values({
        id: randomUUID(),
        studentId,
        courseId,
        conceptName,
        masteryScore,
        confidence,
        evidenceCount: 1,
        lastEvidenceAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          studentConceptMastery.studentId,
          studentConceptMastery.courseId,
          studentConceptMastery.conceptName,
        ],
        set: {
          masteryScore,
          confidence,
          evidenceCount: sql`${studentConceptMastery.evidenceCount} + 1`,
          lastEvidenceAt: now,
          updatedAt: now,
        },
      });
  }

  if (env.FEATURE_FEEDBACK === "1") {
    await evaluateInterventions(studentId, courseId);
  }

  if (env.FEATURE_STUDY_PATH === "1") {
    try {
      await recomputeStudyPath(studentId, courseId);
    } catch (err) {
      console.error("Error recomputing study path after mastery update:", err);
    }
  }
}

/**
 * Returns mastery rows for (studentId, courseId) sorted by masteryScore ascending.
 */
export async function getMastery(studentId: string, courseId: string): Promise<MasteryRow[]> {
  const rows = await db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, courseId)
      )
    )
    .orderBy(asc(studentConceptMastery.masteryScore));

  const activeKOs = await db
    .select({ id: knowledgeObjects.id, conceptName: knowledgeObjects.conceptName })
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.courseId, courseId),
        eq(knowledgeObjects.status, "active")
      )
    );

  if (activeKOs.length === 0) {
    return rows.map((r) => ({
      conceptName: r.conceptName,
      masteryScore: r.masteryScore,
      confidence: r.confidence,
      evidenceCount: r.evidenceCount,
      trend: r.trend ?? null,
      blockedBy: [],
      lastEvidenceAt: r.lastEvidenceAt,
    }));
  }

  const koIds = activeKOs.map((k) => k.id);
  const koIdToConcept = new Map<string, string>();
  for (const ko of activeKOs) {
    koIdToConcept.set(ko.id, ko.conceptName.trim());
  }

  const relationships = await db
    .select({
      sourceKoId: knowledgeRelationships.sourceKoId,
      targetKoId: knowledgeRelationships.targetKoId,
    })
    .from(knowledgeRelationships)
    .where(
      and(
        eq(knowledgeRelationships.type, "prerequisite"),
        inArray(knowledgeRelationships.targetKoId, koIds)
      )
    );

  const prereqMap = buildPrereqConceptMap(koIdToConcept, relationships);

  const masteryMap = new Map<string, number>();
  for (const r of rows) {
    masteryMap.set(r.conceptName.trim(), r.masteryScore);
  }

  return rows.map((r) => {
    const trimmedName = r.conceptName.trim();
    const prereqs = prereqMap.get(trimmedName);
    const blockedBy: string[] = [];
    if (prereqs) {
      for (const prereq of prereqs) {
        const score = masteryMap.get(prereq) ?? 0;
        if (score < 40) {
          blockedBy.push(prereq);
        }
      }
    }

    return {
      conceptName: r.conceptName,
      masteryScore: r.masteryScore,
      confidence: r.confidence,
      evidenceCount: r.evidenceCount,
      trend: r.trend ?? null,
      blockedBy,
      lastEvidenceAt: r.lastEvidenceAt,
    };
  });
}

/**
 * Recomputes trends for all student mastery rows based on a 7-day-old history snapshot.
 */
export async function recomputeTrends(studentId: string): Promise<void> {
  const liveRows = await db
    .select()
    .from(studentConceptMastery)
    .where(eq(studentConceptMastery.studentId, studentId));

  if (liveRows.length === 0) return;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const snapshots = await db
    .select()
    .from(studentConceptMasteryHistory)
    .where(
      and(
        eq(studentConceptMasteryHistory.studentId, studentId),
        eq(studentConceptMasteryHistory.snapshotDate, sevenDaysAgoStr)
      )
    );

  const snapshotMap = new Map<string, number>();
  for (const snap of snapshots) {
    snapshotMap.set(snap.conceptName.trim(), snap.masteryScore);
  }

  for (const row of liveRows) {
    const conceptKey = row.conceptName.trim();
    const historicalScore = snapshotMap.get(conceptKey);
    let trend: "improving" | "stable" | "declining" | null = null;

    if (historicalScore !== undefined) {
      const diff = row.masteryScore - historicalScore;
      if (diff >= 5) {
        trend = "improving";
      } else if (diff <= -5) {
        trend = "declining";
      } else {
        trend = "stable";
      }
    }

    await db
      .update(studentConceptMastery)
      .set({ trend, updatedAt: new Date() })
      .where(eq(studentConceptMastery.id, row.id));
  }
}
