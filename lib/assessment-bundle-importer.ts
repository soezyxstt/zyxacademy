/**
 * Shared assessment-bundle import core.
 *
 * Mirrors lib/bundle-importer.ts's role for learning content, but for the
 * "Assessment Bundle" payload: assessmentSources[] (each with chapter refs
 * and assessmentObjects[]) targeting chapters of an ALREADY-IMPORTED course.
 * Used by both the CLI importer (scripts/import-bundle.ts) and the admin
 * Server Action (app/(admin)/admin/(academic)/courses/import-actions.ts) so
 * the two stop drifting from each other.
 *
 * A Learning Bundle's chapter `$id` refs only exist inside that one JSON
 * document, so a standalone Assessment Bundle (uploaded separately, with no
 * shared $id namespace) must reference chapters by their `title` instead.
 * The combined/legacy bundle format (one JSON carrying both learning and
 * assessment content) still works by passing a resolver backed by the
 * in-memory bundle-local $id map built while importing that bundle's
 * chapters; see resolveChapterRef in import-actions.ts.
 *
 * Re-importing the same source is idempotent by source hash. A changed source
 * gets a new immutable source version and new assessment object IDs; the
 * previous source and objects remain queryable. Objects removed from a
 * re-uploaded source are left in the previous version and are reported as
 * `aoOrphaned` for review.
 */

import { db } from "@/db";
import {
  courses,
  concepts,
  conceptLocalizations,
  chapters,
  knowledgeObjects,
  assessmentSources,
  assessmentSourceChapters,
  assessmentObjects,
  assessmentObjectConcepts,
  assessmentObjectKos,
  vectorSyncQueue,
} from "@/db/schema";
import { updateAssessmentProfile } from "@/lib/assessment-extractor";
import { randomUUID, createHash } from "crypto";
import { eq, and, inArray } from "drizzle-orm";

/** Drizzle transaction handle (lacks db.transaction()/.batch(), unlike `typeof db`). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AssessmentImportMode = "create" | "upsert" | "append";

export interface AssessmentSourceDiff {
  sourceId: string;
  sourceTitle: string;
  version: number;
  isNew: boolean;
  preservedPreviousVersion: boolean;
  aoAdded: number;
  aoUpdated: number;
  aoUnchanged: number;
  aoOrphaned: number;
}

export interface AssessmentBundleResult {
  courseId: string;
  sourceDiffs: AssessmentSourceDiff[];
  asCount: number;
  aoCount: number;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Thrown inside the transaction to force a rollback while still surfacing the would-be diff/result for dry-run mode. */
class DryRunAbort extends Error {
  constructor(public result: AssessmentBundleResult) {
    super("dry-run-abort");
  }
}

/** Same shape the post-process step in the old combined importer used: keyword match against concept localizations/aliases, falling back to the chapter's KOs. */
async function mapAssessmentObjectToConcepts(
  tx: DbTx,
  ao: { id: string; questionMarkdown: string; answerMarkdown: string | null },
  chapterIds: string[],
  localizations: { conceptId: string; displayName: string; aliases: string[] }[],
): Promise<string[]> {
  const matchedConceptIds = new Set<string>();
  const questionTextLower = (ao.questionMarkdown + " " + (ao.answerMarkdown || "")).toLowerCase();

  for (const loc of localizations) {
    const nameLower = loc.displayName.toLowerCase();
    const aliases = Array.isArray(loc.aliases) ? loc.aliases : [];
    const isMatched =
      questionTextLower.includes(nameLower) ||
      aliases.some((alias) => questionTextLower.includes(alias.toString().toLowerCase()));
    if (isMatched) matchedConceptIds.add(loc.conceptId);
  }

  if (matchedConceptIds.size === 0 && chapterIds.length > 0) {
    const chapterKOs = await tx
      .select({ conceptId: knowledgeObjects.conceptId })
      .from(knowledgeObjects)
      .where(and(inArray(knowledgeObjects.chapterId, chapterIds), eq(knowledgeObjects.status, "active")));
    for (const ko of chapterKOs) matchedConceptIds.add(ko.conceptId);
  }

  return Array.from(matchedConceptIds);
}

async function syncAssessmentObjectDownstream(
  tx: DbTx,
  ao: { id: string; sourceId: string; questionMarkdown: string; answerMarkdown: string | null; difficulty: number; applicationLevel: number },
  courseId: string,
  chapterIds: string[],
  localizations: { conceptId: string; displayName: string; aliases: string[] }[],
): Promise<void> {
  // Re-map from scratch: stale concept/KO links from a previous version of this object would otherwise linger.
  await tx.delete(assessmentObjectConcepts).where(eq(assessmentObjectConcepts.assessmentObjectId, ao.id));
  await tx.delete(assessmentObjectKos).where(eq(assessmentObjectKos.assessmentObjectId, ao.id));

  const matchedConceptIds = await mapAssessmentObjectToConcepts(tx, ao, chapterIds, localizations);
  const matchedConceptNames = matchedConceptIds
    .map((id) => localizations.find((l) => l.conceptId === id)?.displayName)
    .filter((n): n is string => !!n);

  for (const conceptId of matchedConceptIds) {
    await tx
      .insert(assessmentObjectConcepts)
      .values({ id: `aoc-${randomUUID()}`, assessmentObjectId: ao.id, conceptId })
      .onConflictDoNothing();

    let whereClause = and(eq(knowledgeObjects.conceptId, conceptId), eq(knowledgeObjects.status, "active"));
    if (chapterIds.length > 0) whereClause = and(whereClause, inArray(knowledgeObjects.chapterId, chapterIds));
    const matchedKOs = await tx.select({ id: knowledgeObjects.id }).from(knowledgeObjects).where(whereClause);
    for (const ko of matchedKOs) {
      await tx
        .insert(assessmentObjectKos)
        .values({ id: `aok-${randomUUID()}`, assessmentObjectId: ao.id, koId: ko.id })
        .onConflictDoNothing();
    }
  }

  const resolvedChapterId = chapterIds[0] || "";
  const bloomLevel = ao.applicationLevel === 1 ? "remember" : ao.applicationLevel === 2 ? "understand" : "apply";
  const difficultyText = ao.difficulty <= 3 ? "easy" : ao.difficulty >= 7 ? "hard" : "medium";

  await tx
    .insert(vectorSyncQueue)
    .values({
      id: `sync-asrc-${randomUUID()}`,
      courseId,
      koId: null,
      action: "upsert" as const,
      namespace: "past_exams" as const,
      payload: {
        id: ao.id,
        text: `Question: ${ao.questionMarkdown}\nSolution: ${ao.answerMarkdown || ""}`,
        metadata: {
          chapterId: resolvedChapterId,
          type: "past_exam",
          bloomLevel,
          difficulty: difficultyText,
          tags: matchedConceptNames,
        },
      },
      status: "pending" as const,
      attempts: 0,
    })
    .onConflictDoNothing();
}

/**
 * Imports an Assessment Bundle's assessmentSources (each with nested
 * assessmentObjects) against an already-existing course.
 *
 * @param assessmentSourcesInput Flat list of assessmentSource objects (the
 *   bundle's `assessmentSources[]`).
 * @param courseId UUID of the already-resolved target course.
 * @param resolveChapterRef Maps a bundle `chapters[]` entry (chapter title
 *   for standalone Assessment Bundles, or bundle-local chapter $id/title for
 *   the legacy combined format) to a real chapter UUID. Returns undefined if
 *   unresolvable.
 * @param authorUuid UUID of the user attributed as the source's uploader.
 * @param postProcess When true, runs heuristic concept/KO mapping and
 *   enqueues changed assessment objects to the vector sync queue, then
 *   recalculates the course's assessment profile.
 */
export async function importAssessmentBundle(
  assessmentSourcesInput: any[],
  courseId: string,
  resolveChapterRef: (ref: string) => string | undefined,
  authorUuid: string,
  mode: AssessmentImportMode,
  postProcess: boolean,
  log: (msg: string) => void = () => {},
  dryRun = false,
): Promise<AssessmentBundleResult> {
  try {
    return await db.transaction(async (tx) => {
      const sourceDiffs: AssessmentSourceDiff[] = [];
      let asCount = 0;
      let aoCount = 0;
      const touchedAoIds: { id: string; sourceId: string; questionMarkdown: string; answerMarkdown: string | null; difficulty: number; applicationLevel: number; chapterIds: string[] }[] = [];

      for (const as of assessmentSourcesInput) {
        if (!as.title) throw new Error("Each assessmentSource must specify a title.");

        const sourceHash = sha256(as.sourceMarkdown);
        const existingSources = mode === "create"
          ? []
          : await tx.select().from(assessmentSources).where(and(eq(assessmentSources.courseId, courseId), eq(assessmentSources.title, as.title)));
        const exactSource = existingSources.find((source) => source.sourceHash === sourceHash);
        const latestSource = [...existingSources].sort((left, right) => right.version - left.version)[0];
        if (mode === "append" && latestSource) {
          log(`Assessment source "${as.title}": already exists, skipped (append mode).`);
          continue;
        }

        const isNew = !exactSource;
        const sourceVersion = exactSource?.version ?? (latestSource?.version ?? 0) + 1;
        const asrcUuid = exactSource?.id ?? (latestSource && mode === "upsert"
          ? `asrc-${sha256(`${courseId}:${as.title}:${sourceVersion}:${sourceHash}`).slice(0, 32)}`
          : `asrc-${randomUUID()}`);

        const sourceFields = {
          title: as.title,
          origin: "generated" as const,
          category: as.category,
          year: as.year,
          semester: as.semester || null,
          sourceMarkdown: as.sourceMarkdown,
          sourceHash,
          version: sourceVersion,
          originalFilename: as.source?.file || null,
          uploadedByUserId: authorUuid,
          ingestionStatus: "completed" as const,
          ingestionCompletedAt: new Date(),
        };

        if (isNew) {
          await tx.insert(assessmentSources).values({ id: asrcUuid, courseId, ...sourceFields });
        }
        asCount++;

        // ─── Chapter mapping ───
        const refChapterIds: string[] = [];
        for (const ref of as.chapters || []) {
          const resolved = resolveChapterRef(ref);
          if (!resolved) {
            throw new Error(`Failed to resolve chapter ref "${ref}" for Assessment Source "${as.title}".`);
          }
          refChapterIds.push(resolved);
          await tx
            .insert(assessmentSourceChapters)
            .values({ id: `asc-${randomUUID()}`, assessmentSourceId: asrcUuid, chapterId: resolved })
            .onConflictDoNothing();
        }

        // ─── Assessment Objects: diff by canonicalQuestionHash (stable across reorders) ───
        const existingAos = isNew
          ? []
          : await tx.select().from(assessmentObjects).where(eq(assessmentObjects.sourceId, asrcUuid));
        const existingByHash = new Map(existingAos.map((row) => [row.canonicalQuestionHash, row]));
        const matchedExistingIds = new Set<string>();

        let aoAdded = 0;
        let aoUpdated = 0;
        let aoUnchanged = 0;

        for (const [aoIdx, ao] of (as.assessmentObjects || []).entries()) {
          const qHash: string = ao.canonicalQuestionHash || sha256(ao.questionMarkdown || "");
          const existing = existingByHash.get(qHash);
          const aoUuid = existing?.id ?? `ao-${randomUUID()}`;

          const aoFields = {
            sourceId: asrcUuid,
            questionOrder: aoIdx + 1,
            questionType: ao.questionType,
            difficulty: ao.difficulty,
            pattern: ao.pattern || "general",
            reasoningType: ao.reasoningType || "analytical",
            estimatedSteps: ao.estimatedSteps || 1,
            applicationLevel: ao.applicationLevel || 1,
            questionMarkdown: ao.questionMarkdown || "",
            answerMarkdown: ao.answerMarkdown || null,
            options: ao.options || null,
            canonicalQuestionHash: qHash,
          };

          if (existing) {
            matchedExistingIds.add(existing.id);
            const unchanged =
              existing.questionOrder === aoFields.questionOrder &&
              existing.questionType === aoFields.questionType &&
              existing.difficulty === aoFields.difficulty &&
              existing.pattern === aoFields.pattern &&
              existing.reasoningType === aoFields.reasoningType &&
              existing.estimatedSteps === aoFields.estimatedSteps &&
              existing.applicationLevel === aoFields.applicationLevel &&
              existing.answerMarkdown === aoFields.answerMarkdown &&
              JSON.stringify(existing.options || null) === JSON.stringify(aoFields.options);
            if (unchanged) {
              aoUnchanged++;
              continue;
            }
            await tx.update(assessmentObjects).set({ ...aoFields, updatedAt: new Date() }).where(eq(assessmentObjects.id, aoUuid));
            aoUpdated++;
          } else {
            await tx.insert(assessmentObjects).values({ id: aoUuid, ...aoFields });
            aoAdded++;
          }

          aoCount++;
          touchedAoIds.push({
            id: aoUuid,
            sourceId: asrcUuid,
            questionMarkdown: aoFields.questionMarkdown,
            answerMarkdown: aoFields.answerMarkdown,
            difficulty: aoFields.difficulty,
            applicationLevel: aoFields.applicationLevel,
            chapterIds: refChapterIds,
          });
        }

        const aoOrphaned = existingAos.filter((row) => !matchedExistingIds.has(row.id)).length;

        log(
          `Assessment source "${as.title}": ${aoAdded} object(s) added, ${aoUpdated} updated, ${aoUnchanged} unchanged` +
            (aoOrphaned > 0 ? `, ${aoOrphaned} no longer present in bundle (preserved in the previous source version)` : "") +
            ".",
        );

        sourceDiffs.push({
          sourceId: asrcUuid,
          sourceTitle: as.title,
          version: sourceVersion,
          isNew,
          preservedPreviousVersion: Boolean(latestSource && isNew),
          aoAdded,
          aoUpdated,
          aoUnchanged,
          aoOrphaned,
        });
      }

      // ─── Post-process: heuristic concept/KO mapping + vector sync enqueue, only for touched objects ───
      if (postProcess && touchedAoIds.length > 0) {
        log(`Mapping ${touchedAoIds.length} new/changed assessment object(s) to concepts and enqueuing vector sync...`);
        const localizations = await tx
          .select({
            conceptId: conceptLocalizations.conceptId,
            displayName: conceptLocalizations.displayName,
            aliases: conceptLocalizations.aliases,
          })
          .from(conceptLocalizations)
          .innerJoin(concepts, eq(conceptLocalizations.conceptId, concepts.id));

        for (const ao of touchedAoIds) {
          await syncAssessmentObjectDownstream(
            tx,
            ao,
            courseId,
            ao.chapterIds,
            localizations.map((l) => ({ ...l, aliases: Array.isArray(l.aliases) ? (l.aliases as string[]) : [] })),
          );
        }
        log(`[SUCCESS] Mapped and enqueued ${touchedAoIds.length} assessment object(s) to Vector Sync Queue.`);
      }

      if (postProcess) {
        await updateAssessmentProfile(courseId);
        log("[SUCCESS] Recalculated course assessment profile.");
      }

      const result: AssessmentBundleResult = { courseId, sourceDiffs, asCount, aoCount };

      if (dryRun) throw new DryRunAbort(result);

      return result;
    });
  } catch (err) {
    if (err instanceof DryRunAbort) return err.result;
    throw err;
  }
}

/**
 * Resolves a chapter `ref` (title) against an already-existing course's
 * chapters. Used for standalone Assessment Bundles, which have no access to
 * the bundle-local chapter $id namespace of the Learning Bundle that created
 * those chapters.
 */
export async function resolveCourseAndChaptersByTitle(
  courseTitle: string,
): Promise<{ courseId: string; chapterByTitle: Map<string, string> }> {
  const [existingCourse] = await db.select().from(courses).where(eq(courses.title, courseTitle)).limit(1);
  if (!existingCourse) {
    throw new Error(
      `Course "${courseTitle}" not found. Assessment bundles target an existing course; import its Learning Bundle first.`,
    );
  }
  const allChapters = await db.select().from(chapters).where(eq(chapters.courseId, existingCourse.id));
  return {
    courseId: existingCourse.id,
    chapterByTitle: new Map(allChapters.map((c) => [c.title, c.id])),
  };
}
