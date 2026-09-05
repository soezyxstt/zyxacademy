/**
 * Shared chapter-bundle import core.
 *
 * A bundle upload always targets exactly one chapter inside one course (see
 * docs/audit/knowledge-factory-pipeline-audit.md). This module is the single
 * place that knows how to take that one chapter's pre-compiled JSON and turn
 * it into DB rows, used by both the CLI importer (scripts/import-bundle.ts)
 * and the admin Server Action (app/(admin)/admin/(academic)/courses/import-actions.ts)
 * so the two stop drifting from each other.
 *
 * Re-importing the same chapter (incremental reimport) diffs against what's
 * already in the database instead of blind upsert-everything:
 *   - Knowledge Objects are matched by their bundle `$id` (stable across
 *     re-exports), falling back to (chapterId, title) for legacy rows that
 *     predate this field. Unchanged KOs are left untouched; changed ones are
 *     updated in place; KOs no longer present in the bundle are retired
 *     (status: 'retired'), never hard-deleted.
 *   - The chapter's derivedHash (same formula as lib/ko-extractor.ts) gates
 *     whether the MTD version bumps and downstream assets (website material,
 *     flashcards, diktats, question bank) get marked stale. Re-importing an
 *     unchanged bundle is then a true no-op below the diff report.
 */

import { db } from "@/db";
import {
  courses,
  concepts,
  conceptLocalizations,
  masterTeachingDocuments,
  chapters,
  knowledgeObjects,
  websiteMaterials,
  flashcardSets,
  flashcards,
  diktats,
  aiQuestionBank,
  knowledgeRelationships,
} from "@/db/schema";
import { slugify } from "@/lib/ko-utils";
import { randomUUID, createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import {
  reconcileLegacyChapterToCanonical,
  reconcileLegacyCourseToCanonical,
} from "@/lib/academic/course-canonical-sync";

export type ImportMode = "create" | "upsert" | "append";

export interface BundleChapterDiff {
  chapterId: string;
  chapterTitle: string;
  mtdId: string;
  mtdVersionBumped: boolean;
  koAdded: number;
  koUpdated: number;
  koUnchanged: number;
  koRetired: number;
  cascadedStaleness: boolean;
}

export interface ChapterImportResult {
  courseId: string;
  diff: BundleChapterDiff;
  wmCount: number;
  fsetCount: number;
  fcCount: number;
  krCount: number;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Thrown inside the transaction to force a rollback while still surfacing the would-be diff/result for dry-run mode. */
class DryRunAbort extends Error {
  constructor(public result: ChapterImportResult) {
    super("dry-run-abort");
  }
}

function canonicalizeMarkdown(md: string, idMap: Map<string, string>): string {
  return md.replace(/ref="([^"]+)"/g, (match, ref) => {
    const uuid = idMap.get(ref);
    if (!uuid) throw new Error(`Unresolvable markdown ref: "${ref}"`);
    return `koId="${uuid}"`;
  });
}

/** Same formula as lib/ko-extractor.ts so live-extracted and bundle-imported chapters version identically. */
function koContentHash(ko: { title: string; content: string; difficulty: string; bloomLevel: string }): string {
  return `${ko.title}:${ko.content}:${ko.difficulty}:${ko.bloomLevel}`;
}

function chapterDerivedHash(kos: { title: string; content: string; difficulty: string; bloomLevel: string }[]): string {
  const input = [...kos]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(koContentHash)
    .join("|");
  return sha256(input);
}

/**
 * Resolves (and creates if needed) the course and the chapter referenced by
 * `chapter.$id`/`chapter.id`. Returns UUIDs plus whether each was newly created.
 */
async function resolveCourseAndChapter(
  tx: typeof db,
  bundle: any,
  chapter: any,
  mode: ImportMode,
): Promise<{ courseId: string; chapterId: string; courseIsNew: boolean; chapterIsNew: boolean }> {
  let courseId: string = randomUUID();
  let courseIsNew = true;
  if (mode !== "create") {
    const [existingCourse] = await tx
      .select()
      .from(courses)
      .where(eq(courses.title, bundle.course.title))
      .limit(1);
    if (existingCourse) {
      courseId = existingCourse.id;
      courseIsNew = false;
    }
  }

  let chapterId: string = randomUUID();
  let chapterIsNew = true;
  if (mode !== "create") {
    const [existingChapter] = await tx
      .select()
      .from(chapters)
      .where(and(eq(chapters.courseId, courseId), eq(chapters.title, chapter.title)))
      .limit(1);
    if (existingChapter) {
      chapterId = existingChapter.id;
      chapterIsNew = false;
    }
  }

  return { courseId, chapterId, courseIsNew, chapterIsNew };
}

/**
 * Imports a single chapter's bundle content (concepts, KOs, website material,
 * flashcards, relationships) with incremental-reimport semantics.
 *
 * Assessment sources/objects are intentionally NOT handled here; they have
 * their own ingestion identity (assessmentSources/assessmentObjects) and are
 * meant to be uploaded as a separate, smaller bundle so a large course
 * doesn't have to move learning content and exam content in one shot.
 */
export async function importChapterBundle(
  bundle: any,
  chapter: any,
  mode: ImportMode,
  log: (msg: string) => void = () => {},
  dryRun = false,
): Promise<ChapterImportResult> {
  try {
    return await db.transaction(async (tx) => {
    const { courseId, chapterId, courseIsNew } = await resolveCourseAndChapter(tx as any, bundle, chapter, mode);

    // Course row
    if (courseIsNew) {
      await tx.insert(courses).values({
        id: courseId,
        title: bundle.course.title,
        category: bundle.course.category,
        description: bundle.course.description || null,
      });
    } else if (mode === "upsert") {
      await tx
        .update(courses)
        .set({
          category: bundle.course.category,
          description: bundle.course.description || null,
        })
        .where(eq(courses.id, courseId));
    }

    // Resolve MTD for this chapter (1 chapter = 1 MTD)
    const [existingWm] = await tx
      .select()
      .from(websiteMaterials)
      .where(and(eq(websiteMaterials.courseId, courseId), eq(websiteMaterials.chapterId, chapterId)))
      .limit(1);
    const [existingMtd] = existingWm
      ? await tx.select().from(masterTeachingDocuments).where(eq(masterTeachingDocuments.id, existingWm.sourceMtdId)).limit(1)
      : [];

    const mtdId = existingMtd?.id ?? `mtd-${randomUUID()}`;

    // Chapter row
    const [existingChapterRow] = await tx.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
    if (!existingChapterRow) {
      await tx.insert(chapters).values({
        id: chapterId,
        courseId,
        title: chapter.title,
        description: chapter.description || null,
        orderIndex: chapter.orderIndex ?? 1,
        status: "draft",
        assetGenStatus: "idle",
      });
    } else if (mode === "upsert") {
      await tx
        .update(chapters)
        .set({ description: chapter.description || null, updatedAt: new Date() })
        .where(eq(chapters.id, chapterId));
    }

    await reconcileLegacyCourseToCanonical(courseId, null, tx);
    await reconcileLegacyChapterToCanonical(chapterId, null, tx);

    // ─── Concepts: match by canonicalSlug, update localizations in place ───
    const idMap = new Map<string, string>();
    const conceptDisplayNameMap = new Map<string, string>();

    for (const [conIdx, concept] of (chapter.concepts || []).entries()) {
      let conceptId: string = randomUUID();
      const conceptRefKey = concept.$id || concept.id || `$concept-${conIdx}`;

      const [existingConcept] = await tx
        .select()
        .from(concepts)
        .where(eq(concepts.canonicalSlug, concept.canonicalSlug))
        .limit(1);
      if (existingConcept) {
        conceptId = existingConcept.id;
      } else {
        await tx.insert(concepts).values({ id: conceptId, canonicalSlug: concept.canonicalSlug, isVerified: false });
      }

      idMap.set(conceptRefKey, conceptId);
      const firstDisplayName = concept.localizations?.[0]?.displayName || "Concept";
      conceptDisplayNameMap.set(concept.$id || concept.id, firstDisplayName);

      for (const loc of concept.localizations || []) {
        await tx
          .insert(conceptLocalizations)
          .values({
            id: randomUUID(),
            conceptId,
            lang: loc.lang,
            displayName: loc.displayName,
            aliases: loc.aliases || [],
            technicalStandardTerm: "id",
          })
          .onConflictDoUpdate({
            target: [conceptLocalizations.conceptId, conceptLocalizations.lang],
            set: { displayName: loc.displayName, aliases: loc.aliases || [], updatedAt: new Date() },
          });
      }
    }

    // ─── Knowledge Objects: diff against what's already stored for this chapter ───
    const existingKos = await tx
      .select()
      .from(knowledgeObjects)
      .where(and(eq(knowledgeObjects.chapterId, chapterId), eq(knowledgeObjects.status, "active")));

    const existingByBundleRef = new Map<string, typeof existingKos[number]>();
    const existingByTitle = new Map<string, typeof existingKos[number]>();
    for (const row of existingKos) {
      const ref = (row.metadata as any)?._bundleRef as string | undefined;
      if (ref) existingByBundleRef.set(ref, row);
      existingByTitle.set(row.title, row);
    }

    const matchedExistingIds = new Set<string>();
    const newKos = chapter.knowledgeObjects || [];
    const finalKoSet: { id: string; title: string; content: string; difficulty: string; bloomLevel: string }[] = [];

    let koAdded = 0;
    let koUpdated = 0;
    let koUnchanged = 0;

    for (const [koIdx, ko] of newKos.entries()) {
      const bundleRef: string = ko.$id || ko.id || `$ko-${koIdx}`;
      idMap.set(bundleRef, ""); // placeholder, filled below once koUuid resolved

      let resolvedConceptId = "";
      let resolvedConceptName = "";
      if (ko.concept$ref) {
        resolvedConceptId = idMap.get(ko.concept$ref) || "";
        resolvedConceptName = conceptDisplayNameMap.get(ko.concept$ref) || "Concept";
      } else if (ko.conceptName) {
        const chapterConcepts = chapter.concepts || [];
        const matched = chapterConcepts.find((c: any) =>
          (c.localizations || []).some((loc: any) => loc.displayName === ko.conceptName),
        );
        if (matched) resolvedConceptId = idMap.get(matched.$id || matched.id) || "";
        resolvedConceptName = ko.conceptName;
      }
      if (!resolvedConceptId) {
        throw new Error(`Failed to resolve concept for KO "${ko.title}" in chapter "${chapter.title}".`);
      }

      const existing = existingByBundleRef.get(bundleRef) ?? existingByTitle.get(ko.title);
      const koUuid = existing?.id ?? `ko-${randomUUID()}`;
      idMap.set(bundleRef, koUuid);

      const koFields = {
        title: ko.title,
        content: ko.content,
        difficulty: ko.difficulty || "medium",
        bloomLevel: ko.bloomLevel,
      };
      finalKoSet.push({ id: koUuid, ...koFields });

      if (existing) {
        matchedExistingIds.add(existing.id);
        const existingHash = koContentHash({
          title: existing.title,
          content: existing.content,
          difficulty: existing.difficulty,
          bloomLevel: existing.bloomLevel,
        });
        const newHash = koContentHash(koFields);
        if (newHash === existingHash) {
          koUnchanged++;
          continue; // no write needed
        }

        await tx
          .update(knowledgeObjects)
          .set({
            conceptId: resolvedConceptId,
            conceptName: resolvedConceptName,
            learningOrder: koIdx + 1,
            content: ko.content,
            type: ko.type,
            bloomLevel: ko.bloomLevel,
            difficulty: ko.difficulty || "medium",
            tags: ko.tags || [],
            importance: ko.importance || "medium",
            metadata: { ...(ko.source ? { _source: ko.source } : {}), _bundleRef: bundleRef },
            updatedAt: new Date(),
          })
          .where(eq(knowledgeObjects.id, existing.id));
        koUpdated++;
      } else {
        await tx.insert(knowledgeObjects).values({
          id: koUuid,
          courseId,
          mtdId,
          chapterId,
          conceptId: resolvedConceptId,
          learningOrder: koIdx + 1,
          title: ko.title,
          conceptName: resolvedConceptName,
          content: ko.content,
          type: ko.type,
          bloomLevel: ko.bloomLevel,
          difficulty: ko.difficulty || "medium",
          tags: ko.tags || [],
          importance: ko.importance || "medium",
          metadata: { ...(ko.source ? { _source: ko.source } : {}), _bundleRef: bundleRef },
          status: "active",
        });
        koAdded++;
      }
    }

    // KOs that existed before but weren't matched by anything in this bundle: retire, don't delete.
    const toRetire = existingKos.filter((row) => !matchedExistingIds.has(row.id));
    for (const row of toRetire) {
      await tx.update(knowledgeObjects).set({ status: "retired", updatedAt: new Date() }).where(eq(knowledgeObjects.id, row.id));
    }

    log(
      `Chapter "${chapter.title}": ${koAdded} KO added, ${koUpdated} updated, ${koUnchanged} unchanged, ${toRetire.length} retired.`,
    );

    // ─── Chapter-level version gate (same formula as lib/ko-extractor.ts) ───
    const derivedHash = chapterDerivedHash(finalKoSet);
    const derivedHashChanged = !existingMtd || existingMtd.derivedHash !== derivedHash;
    const nextVersion = existingMtd ? (derivedHashChanged ? existingMtd.version + 1 : existingMtd.version) : 1;

    const firstWm = chapter.websiteMaterials?.[0];
    const canonicalMarkdown = firstWm ? canonicalizeMarkdown(firstWm.canonicalMarkdown, idMap) : existingMtd?.markdownContent ?? `# ${chapter.title}`;
    const sourceHash = sha256(canonicalMarkdown);

    if (existingMtd) {
      if (derivedHashChanged) {
        await tx
          .update(masterTeachingDocuments)
          .set({ markdownContent: canonicalMarkdown, sourceHash, derivedHash, version: nextVersion, updatedAt: new Date() })
          .where(eq(masterTeachingDocuments.id, mtdId));
      }
    } else {
      await tx.insert(masterTeachingDocuments).values({
        id: mtdId,
        courseId,
        title: `MTD - ${chapter.title}`,
        markdownContent: canonicalMarkdown,
        sourceHash,
        derivedHash,
        version: nextVersion,
        status: "draft",
        type: "learning",
        createdById: "bundle-importer",
      });
    }

    // ─── Cascade staleness only when the chapter's knowledge actually changed ───
    if (derivedHashChanged && existingMtd) {
      log(`Chapter "${chapter.title}": derivedHash changed, cascading staleness to downstream assets (v${existingMtd.version} -> v${nextVersion}).`);
      await tx.update(websiteMaterials).set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() }).where(eq(websiteMaterials.sourceMtdId, mtdId));
      await tx.update(flashcardSets).set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() }).where(eq(flashcardSets.sourceMtdId, mtdId));
      await tx.update(diktats).set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() }).where(eq(diktats.sourceMtdId, mtdId));
      await tx.update(aiQuestionBank).set({ isStale: true, sourceMtdVersion: nextVersion }).where(eq(aiQuestionBank.sourceMtdId, mtdId));
    }

    // ─── Website material: upsert by (chapterId, slug); always carries the current MTD version ───
    let wmCount = 0;
    if (firstWm) {
      const slug = firstWm.slug || slugify(firstWm.title);
      const [matchedWm] = await tx
        .select()
        .from(websiteMaterials)
        .where(and(eq(websiteMaterials.chapterId, chapterId), eq(websiteMaterials.slug, slug)))
        .limit(1);
      const wmId = matchedWm?.id ?? `wm-${randomUUID()}`;
      const generationHash = sha256(finalKoSet.map((k) => `${k.title}:${k.content}`).join("|"));

      if (matchedWm) {
        await tx
          .update(websiteMaterials)
          .set({
            title: firstWm.title,
            canonicalMarkdown,
            structuredContent: firstWm.structuredContent || {},
            generationHash,
            sourceMtdVersion: nextVersion,
            isStale: false,
            updatedAt: new Date(),
          })
          .where(eq(websiteMaterials.id, wmId));
      } else {
        await tx.insert(websiteMaterials).values({
          id: wmId,
          courseId,
          chapterId,
          sourceMtdId: mtdId,
          sourceMtdVersion: nextVersion,
          generationHash,
          title: firstWm.title,
          slug,
          canonicalMarkdown,
          structuredContent: firstWm.structuredContent || {},
          status: "draft",
        });
      }
      wmCount = 1;
    }

    // ─── Flashcard sets: upsert by (chapterId, title) ───
    let fsetCount = 0;
    let fcCount = 0;
    for (const fset of chapter.flashcardSets || []) {
      const [matchedFset] = await tx
        .select()
        .from(flashcardSets)
        .where(and(eq(flashcardSets.chapterId, chapterId), eq(flashcardSets.title, fset.title)))
        .limit(1);
      const fsetId = matchedFset?.id ?? `fset-${randomUUID()}`;
      const fsetHash = sha256((fset.flashcards || []).map((f: any) => `${f.front}:${f.back}`).join("|"));

      if (matchedFset) {
        await tx
          .update(flashcardSets)
          .set({ generationHash: fsetHash, sourceMtdVersion: nextVersion, isStale: false, updatedAt: new Date() })
          .where(eq(flashcardSets.id, fsetId));
      } else {
        await tx.insert(flashcardSets).values({
          id: fsetId,
          courseId,
          chapterId,
          sourceMtdId: mtdId,
          sourceMtdVersion: nextVersion,
          generationHash: fsetHash,
          title: fset.title,
          status: "draft",
        });
      }
      fsetCount++;

      for (const fcard of fset.flashcards || []) {
        const [matchedFc] = await tx
          .select()
          .from(flashcards)
          .where(and(eq(flashcards.setId, fsetId), eq(flashcards.front, fcard.front)))
          .limit(1);
        const fcId = matchedFc?.id ?? `fc-${randomUUID()}`;
        const koId = fcard.ko$ref ? idMap.get(fcard.ko$ref) || null : null;

        if (matchedFc) {
          await tx
            .update(flashcards)
            .set({ koId, back: fcard.back, explanation: fcard.explanation || null, metadata: fcard.source ? { _source: fcard.source } : {} })
            .where(eq(flashcards.id, fcId));
        } else {
          await tx.insert(flashcards).values({
            id: fcId,
            setId: fsetId,
            koId,
            front: fcard.front,
            back: fcard.back,
            explanation: fcard.explanation || null,
            metadata: fcard.source ? { _source: fcard.source } : {},
          });
        }
        fcCount++;
      }
    }

    // ─── Knowledge relationships (within-bundle refs only) ───
    let krCount = 0;
    for (const kr of chapter.knowledgeRelationships || []) {
      const srcId = idMap.get(kr.sourceKo$ref);
      const tgtId = idMap.get(kr.targetKo$ref);
      if (!srcId || !tgtId) {
        throw new Error(`Failed to resolve KO refs for relationship: ${kr.sourceKo$ref} -> ${kr.targetKo$ref}`);
      }
      await tx
        .insert(knowledgeRelationships)
        .values({ id: `kr-${randomUUID()}`, sourceKoId: srcId, targetKoId: tgtId, type: kr.type })
        .onConflictDoNothing();
      krCount++;
    }

    const result: ChapterImportResult = {
      courseId,
      diff: {
        chapterId,
        chapterTitle: chapter.title,
        mtdId,
        mtdVersionBumped: derivedHashChanged,
        koAdded,
        koUpdated,
        koUnchanged,
        koRetired: toRetire.length,
        cascadedStaleness: derivedHashChanged && !!existingMtd,
      },
      wmCount,
      fsetCount,
      fcCount,
      krCount,
    };

    // Dry run: computed and diffed everything above against real DB state,
    // but abort the transaction so none of the writes actually commit.
    if (dryRun) throw new DryRunAbort(result);

    return result;
    });
  } catch (err) {
    if (err instanceof DryRunAbort) return err.result;
    throw err;
  }
}
