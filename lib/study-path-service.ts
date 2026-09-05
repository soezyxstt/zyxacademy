import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  knowledgeObjects,
  knowledgeRelationships,
  chapters,
  studentConceptMastery,
  websiteMaterials,
  quizTemplates,
  flashcards,
  studyPaths,
  ide,
  relasiIde,
  pemahamanIde,
  bab,
  flashcardIde,
  flashcard as canonicalFlashcard,
  setFlashcard,
  concepts,
  conceptLocalizations,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";
import { resolveStudentCourse } from "@/lib/student/course-catalog";
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";

export interface StudyPathStep {
  stepId: string;
  ideaId: string | null;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  conceptName: string;
  status: "locked" | "available" | "in_progress" | "mastered";
  actions: {
    moduleHref?: string;
    quizTemplateId?: string;
    flashcardCount?: number;
  };
  estimatedMinutes: number;
  prerequisites: string[]; // List of prereq concept names for UI unlocks-after description
  masteryScore?: number;
  priorityReason: string;
}

export function toConciseConceptName(statement: string, displayName?: string | null): string {
  if (displayName && displayName.trim()) return displayName.trim();
  const trimmed = statement.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= 5 && trimmed.length <= 40) return trimmed;

  const defMatch = trimmed.match(/^([^.,;:\n]+?)\s+(?:adalah|merupakan|didefinisikan sebagai|dapat dihitung dengan|digunakan untuk|menyatakan bahwa|menyatakan|menjelaskan bahwa|menjelaskan)\b/i);
  if (defMatch && defMatch[1].trim().length >= 3 && defMatch[1].trim().length <= 50) {
    return defMatch[1].trim();
  }

  const punctMatch = trimmed.match(/^([^.,;:\n]+)/);
  if (punctMatch && punctMatch[1].trim().length >= 3 && punctMatch[1].trim().length <= 40) {
    return punctMatch[1].trim();
  }

  return words.slice(0, 5).join(" ");
}

async function computeCanonicalStudyPath(
  studentId: string,
  courseId: string,
): Promise<StudyPathStep[] | null> {
  const course = await resolveStudentCourse(courseId);
  if (!course?.canonicalId) return null;

  const ideas = await db
    .select({
      id: ide.id,
      name: ide.canonicalStatement,
      conceptDisplayName: conceptLocalizations.displayName,
      chapterId: ide.babId,
      chapterOrder: bab.orderIndex,
      chapterTitle: bab.title,
      code: ide.code,
      score: pemahamanIde.skor,
      confidence: pemahamanIde.keyakinan,
    })
    .from(ide)
    .innerJoin(bab, eq(ide.babId, bab.id))
    .leftJoin(concepts, eq(ide.conceptId, concepts.id))
    .leftJoin(
      conceptLocalizations,
      and(eq(conceptLocalizations.conceptId, concepts.id), eq(conceptLocalizations.lang, "id"))
    )
    .leftJoin(
      pemahamanIde,
      and(eq(pemahamanIde.ideId, ide.id), eq(pemahamanIde.penggunaId, studentId)),
    )
    .where(
      and(
        eq(ide.mataKuliahId, course.canonicalId),
        eq(ide.status, "published"),
        eq(bab.status, "active"),
      ),
    );
  if (ideas.length === 0) return null;

  const ideaIds = ideas.map((idea) => idea.id);
  const [relations, articles, cardLinks] = await Promise.all([
    db
      .select({ sourceIdeaId: relasiIde.sourceIdeaId, targetIdeaId: relasiIde.targetIdeaId })
      .from(relasiIde)
      .where(
        and(
          eq(relasiIde.status, "active"),
          eq(relasiIde.relationType, "prerequisite"),
          inArray(relasiIde.sourceIdeaId, ideaIds),
          inArray(relasiIde.targetIdeaId, ideaIds),
        ),
      ),
    getCanonicalPublishedArticlesForCourse(courseId, studentId),
    db
      .select({ ideaId: flashcardIde.ideId, flashcardId: canonicalFlashcard.id })
      .from(flashcardIde)
      .innerJoin(canonicalFlashcard, eq(flashcardIde.flashcardId, canonicalFlashcard.id))
      .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
      .where(
        and(
          inArray(flashcardIde.ideId, ideaIds),
          eq(canonicalFlashcard.status, "published"),
          eq(setFlashcard.status, "published"),
        ),
      ),
  ]);

  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  const incoming = new Map(ideas.map((idea) => [idea.id, 0]));
  const outgoing = new Map(ideas.map((idea) => [idea.id, [] as string[]]));
  const prerequisites = new Map(ideas.map((idea) => [idea.id, [] as string[]]));
  for (const relation of relations) {
    if (!byId.has(relation.sourceIdeaId) || !byId.has(relation.targetIdeaId)) continue;
    outgoing.get(relation.sourceIdeaId)!.push(relation.targetIdeaId);
    incoming.set(relation.targetIdeaId, (incoming.get(relation.targetIdeaId) ?? 0) + 1);
    prerequisites.get(relation.targetIdeaId)!.push(relation.sourceIdeaId);
  }

  const compareIdeas = (leftId: string, rightId: string) => {
    const left = byId.get(leftId)!;
    const right = byId.get(rightId)!;
    return left.chapterOrder - right.chapterOrder || left.code.localeCompare(right.code, "id");
  };
  const ready = ideas.filter((idea) => incoming.get(idea.id) === 0).map((idea) => idea.id).sort(compareIdeas);
  const orderedIds: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    orderedIds.push(current);
    for (const target of outgoing.get(current) ?? []) {
      const next = (incoming.get(target) ?? 1) - 1;
      incoming.set(target, next);
      if (next === 0) ready.push(target);
    }
    ready.sort(compareIdeas);
  }
  if (orderedIds.length < ideas.length) {
    orderedIds.push(...ideas.map((idea) => idea.id).filter((id) => !orderedIds.includes(id)).sort(compareIdeas));
  }

  const articleByChapter = new Map<string, (typeof articles)[number]>();
  for (const article of articles) {
    if (article.babId && !articleByChapter.has(article.babId)) articleByChapter.set(article.babId, article);
  }
  const cardCountByIdea = new Map<string, number>();
  for (const link of cardLinks) cardCountByIdea.set(link.ideaId, (cardCountByIdea.get(link.ideaId) ?? 0) + 1);

  const seenConceptsPerChapter = new Set<string>();
  const steps: StudyPathStep[] = [];

  for (const ideaId of orderedIds) {
    const current = byId.get(ideaId)!;
    const conciseName = toConciseConceptName(current.name, current.conceptDisplayName);
    const dedupKey = `${current.chapterId}::${conciseName.toLowerCase()}`;
    if (seenConceptsPerChapter.has(dedupKey)) continue;
    seenConceptsPerChapter.add(dedupKey);

    const prerequisiteIds = prerequisites.get(ideaId) ?? [];
    const prerequisiteNames = prerequisiteIds.map((id) => {
      const p = byId.get(id)!;
      return toConciseConceptName(p.name, p.conceptDisplayName);
    });
    const locked = prerequisiteIds.some((id) => (byId.get(id)?.score ?? 0) < 40);
    const score = current.score ?? 0;
    const confidence = current.confidence ?? 0;
    const article = articleByChapter.get(current.chapterId);
    const flashcardCount = cardCountByIdea.get(ideaId) ?? 0;
    const status: StudyPathStep["status"] = score >= 70 && confidence >= 50
      ? "mastered"
      : locked
        ? "locked"
        : current.score === null
          ? "available"
          : "in_progress";

    steps.push({
      stepId: current.id,
      ideaId: current.id,
      chapterId: current.chapterId,
      chapterTitle: current.chapterTitle,
      chapterOrder: current.chapterOrder,
      conceptName: conciseName,
      status,
      actions: {
        moduleHref: article ? `/courses/${courseId}/material/${article.id}` : undefined,
        flashcardCount: flashcardCount || undefined,
      },
      estimatedMinutes: Math.max(5, (article?.totalEstimatedReadingMinutes ?? 0) + Math.ceil(flashcardCount * 0.5)),
      prerequisites: prerequisiteNames,
      masteryScore: score,
      priorityReason: status === "mastered" ? "Sudah dikuasai" : status === "locked" ? "Selesaikan prasyarat" : current.score === null ? "Mulai konsep baru" : score < 40 ? "Perkuat dasar" : "Lanjutkan latihan",
    });
  }

  return steps;
}

/**
 * Computes the study path for a student in a course and returns the list of steps.
 */
export async function computeStudyPath(
  studentId: string,
  courseId: string
): Promise<StudyPathStep[]> {
  const canonicalPath = await computeCanonicalStudyPath(studentId, courseId);
  if (canonicalPath) return canonicalPath;

  // 1. Fetch all active Knowledge Objects for this course joined with published chapters
  const activeKOs = await db
    .select({
      id: knowledgeObjects.id,
      conceptId: knowledgeObjects.conceptId,
      conceptName: knowledgeObjects.conceptName,
      importance: knowledgeObjects.importance,
      chapterId: knowledgeObjects.chapterId,
      chapterOrderIndex: chapters.orderIndex,
      chapterTitle: chapters.title,
      tags: knowledgeObjects.tags,
    })
    .from(knowledgeObjects)
    .innerJoin(chapters, eq(knowledgeObjects.chapterId, chapters.id))
    .where(
      and(
        eq(knowledgeObjects.courseId, courseId),
        eq(knowledgeObjects.status, "active"),
        eq(chapters.status, "published")
      )
    );

  if (activeKOs.length === 0) return [];

  // Group KOs by normalized conceptName
  const conceptMap = new Map<string, typeof activeKOs>();
  for (const ko of activeKOs) {
    const key = ko.conceptName.trim();
    const list = conceptMap.get(key) || [];
    list.push(ko);
    conceptMap.set(key, list);
  }

  const conceptNames = Array.from(conceptMap.keys());

  // 2. Fetch student's concept mastery
  const masteryRows = await db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, courseId)
      )
    );

  const masteryMap = new Map<string, { masteryScore: number; confidence: number }>();
  for (const row of masteryRows) {
    masteryMap.set(row.conceptName.trim(), {
      masteryScore: row.masteryScore,
      confidence: row.confidence,
    });
  }

  // 3. Fetch knowledge relationships of type prerequisite
  const relationships = await db
    .select({
      sourceKoId: knowledgeRelationships.sourceKoId,
      targetKoId: knowledgeRelationships.targetKoId,
    })
    .from(knowledgeRelationships)
    .where(eq(knowledgeRelationships.type, "prerequisite"));

  // Create a mapping of KO ID to normalized concept name
  const koIdToConcept = new Map<string, string>();
  for (const ko of activeKOs) {
    koIdToConcept.set(ko.id, ko.conceptName.trim());
  }

  // 4. Build prerequisite edges between conceptNames
  const adjList = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const name of conceptNames) {
    adjList.set(name, new Set());
    inDegree.set(name, 0);
  }

  const edgeTracker = new Set<string>();

  for (const rel of relationships) {
    const srcConcept = koIdToConcept.get(rel.sourceKoId);
    const tgtConcept = koIdToConcept.get(rel.targetKoId);

    if (srcConcept && tgtConcept && srcConcept !== tgtConcept) {
      const edgeKey = `${srcConcept}->${tgtConcept}`;
      if (!edgeTracker.has(edgeKey)) {
        edgeTracker.add(edgeKey);
        adjList.get(srcConcept)!.add(tgtConcept);
        inDegree.set(tgtConcept, inDegree.get(tgtConcept)! + 1);
      }
    }
  }

  // Helper values for sorting ready set
  const conceptChapterOrder = new Map<string, number>();
  const conceptImportance = new Map<string, number>();

  for (const [name, kos] of conceptMap.entries()) {
    // Concept chapter order = minimum orderIndex among all its KOs
    const minOrder = Math.min(...kos.map((k) => k.chapterOrderIndex));
    conceptChapterOrder.set(name, minOrder);

    // Concept importance = maximum importance among all its KOs (high=3, medium=2, low=1)
    const impScores = kos.map((k) => {
      if (k.importance === "high") return 3;
      if (k.importance === "low") return 1;
      return 2; // medium
    });
    conceptImportance.set(name, Math.max(...impScores));
  }

  // 5. Kahn's Topological Sort with Cycle Resolution
  const sortedConcepts: string[] = [];
  const remainingNodes = new Set<string>(conceptNames);

  // We maintain mutable copies of inDegree and adjList for the sort process
  const workingInDegree = new Map(inDegree);
  const workingAdjList = new Map<string, Set<string>>();
  for (const [k, v] of adjList.entries()) {
    workingAdjList.set(k, new Set(v));
  }

  const getReadySet = () => {
    const ready: string[] = [];
    for (const node of remainingNodes) {
      if ((workingInDegree.get(node) || 0) === 0) {
        ready.push(node);
      }
    }
    return ready;
  };

  while (remainingNodes.size > 0) {
    const readySet = getReadySet();

    if (readySet.length === 0) {
      // Cycle detected! Log warning and break an edge
      const cycleDescription = `Cycle detected in course ${courseId} prerequisites among: ${Array.from(
        remainingNodes
      ).join(", ")}`;
      console.warn(cycleDescription);
      Sentry.captureMessage(cycleDescription, "warning");

      // Find all remaining edges
      const remainingEdges: { source: string; target: string }[] = [];
      for (const src of remainingNodes) {
        const targets = workingAdjList.get(src) || new Set();
        for (const tgt of targets) {
          if (remainingNodes.has(tgt)) {
            remainingEdges.push({ source: src, target: tgt });
          }
        }
      }

      if (remainingEdges.length === 0) {
        // Fallback: If no edges remain, just break the remaining nodes by forcing empty inDegree
        for (const node of remainingNodes) {
          workingInDegree.set(node, 0);
        }
        continue;
      }

      // Filter edges where target is later in chapter order than source
      let candidates = remainingEdges.filter(
        (e) => (conceptChapterOrder.get(e.target) || 0) > (conceptChapterOrder.get(e.source) || 0)
      );

      // If no forward edges in the cycle, consider all remaining edges
      if (candidates.length === 0) {
        candidates = remainingEdges;
      }

      // Sort candidates to deterministically select the edge to break
      candidates.sort((a, b) => {
        const targetOrderDiff =
          (conceptChapterOrder.get(b.target) || 0) - (conceptChapterOrder.get(a.target) || 0);
        if (targetOrderDiff !== 0) return targetOrderDiff;

        const srcOrderDiff =
          (conceptChapterOrder.get(a.source) || 0) - (conceptChapterOrder.get(b.source) || 0);
        if (srcOrderDiff !== 0) return srcOrderDiff;

        const targetNameDiff = a.target.localeCompare(b.target);
        if (targetNameDiff !== 0) return targetNameDiff;

        return a.source.localeCompare(b.source);
      });

      // Break the selected edge
      const edgeToBreak = candidates[0];
      workingAdjList.get(edgeToBreak.source)!.delete(edgeToBreak.target);
      workingInDegree.set(
        edgeToBreak.target,
        Math.max(0, (workingInDegree.get(edgeToBreak.target) || 0) - 1)
      );

      console.warn(`Broke cycle edge: ${edgeToBreak.source} -> ${edgeToBreak.target}`);
      continue;
    }

    // Sort readySet
    readySet.sort((a, b) => {
      const masteryA = masteryMap.get(a)?.masteryScore || 0;
      const masteryB = masteryMap.get(b)?.masteryScore || 0;
      if (masteryA !== masteryB) return masteryA - masteryB;

      const orderA = conceptChapterOrder.get(a) || 0;
      const orderB = conceptChapterOrder.get(b) || 0;
      if (orderA !== orderB) return orderA - orderB;

      const impA = conceptImportance.get(a) || 0;
      const impB = conceptImportance.get(b) || 0;
      if (impA !== impB) return impB - impA;

      return a.localeCompare(b);
    });

    const current = readySet[0];
    sortedConcepts.push(current);
    remainingNodes.delete(current);

    const targets = workingAdjList.get(current) || new Set();
    for (const tgt of targets) {
      if (remainingNodes.has(tgt)) {
        workingInDegree.set(tgt, Math.max(0, (workingInDegree.get(tgt) || 0) - 1));
      }
    }
  }

  // 6. Fetch published website materials
  const materials = await db
    .select({
      id: websiteMaterials.id,
      chapterId: websiteMaterials.chapterId,
      structuredContent: websiteMaterials.structuredContent,
    })
    .from(websiteMaterials)
    .where(
      and(
        eq(websiteMaterials.courseId, courseId),
        eq(websiteMaterials.status, "published")
      )
    );

  const chapterToMaterial = new Map<string, typeof materials[0]>();
  for (const mat of materials) {
    chapterToMaterial.set(mat.chapterId, mat);
  }

  // 7. Fetch published quiz templates
  const quizTemplatesList = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      selectionRules: quizTemplates.selectionRules,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.courseId, courseId));

  // 8. Fetch active flashcards count
  const activeKoIds = activeKOs.map((k) => k.id);
  const flashcardRows = activeKoIds.length > 0
    ? await db
        .select({
          id: flashcards.id,
          koId: flashcards.koId,
        })
        .from(flashcards)
        .where(
          and(
            eq(flashcards.status, "active"),
            inArray(flashcards.koId, activeKoIds)
          )
        )
    : [];

  const koIdToFlashcardCount = new Map<string, number>();
  for (const card of flashcardRows) {
    if (card.koId) {
      koIdToFlashcardCount.set(card.koId, (koIdToFlashcardCount.get(card.koId) || 0) + 1);
    }
  }

  // 9. Map relationships back to concept-level prerequisites
  const conceptPrereqs = new Map<string, string[]>();
  for (const name of conceptNames) {
    conceptPrereqs.set(name, []);
  }

  for (const rel of relationships) {
    const srcConcept = koIdToConcept.get(rel.sourceKoId);
    const tgtConcept = koIdToConcept.get(rel.targetKoId);

    if (srcConcept && tgtConcept && srcConcept !== tgtConcept) {
      const list = conceptPrereqs.get(tgtConcept) || [];
      if (!list.includes(srcConcept)) {
        list.push(srcConcept);
        conceptPrereqs.set(tgtConcept, list);
      }
    }
  }

  // 10. Assemble steps
  const steps: StudyPathStep[] = [];

  for (const conceptName of sortedConcepts) {
    const kos = conceptMap.get(conceptName) || [];
    const firstKo = kos[0];

    // Find website material
    const material = firstKo ? chapterToMaterial.get(firstKo.chapterId) : undefined;
    const moduleHref = material
      ? `/courses/${courseId}/material/${material.id}`
      : undefined;

    // Estimate material reading time
    let readingTime = 0;
    if (material?.structuredContent) {
      try {
        const parsed = material.structuredContent as any;
        const ast = parsed?.compilerResult?.ast || parsed;
        readingTime = ast?.documentMetadata?.estimatedReadingTimeMin || 0;
      } catch {
        readingTime = 0;
      }
    }

    // Match quiz template
    const matchedQuiz = quizTemplatesList.find((template) => {
      try {
        const rules = template.selectionRules as {
          tags?: string[];
        } | null;
        const tags = rules?.tags || [];
        const matchesTag = tags.some((t) => t.toLowerCase() === conceptName.toLowerCase());
        const matchesKoTag = tags.some((t) =>
          kos.some((k) =>
            ((k.tags as string[] | undefined) || []).some(
              (kt) => kt.toLowerCase() === t.toLowerCase()
            )
          )
        );
        const matchesTitle = template.title.toLowerCase().includes(conceptName.toLowerCase());
        return matchesTag || matchesKoTag || matchesTitle;
      } catch {
        return false;
      }
    });

    const quizTemplateId = matchedQuiz?.id;

    // Count flashcards
    let flashcardCount = 0;
    for (const ko of kos) {
      flashcardCount += koIdToFlashcardCount.get(ko.id) || 0;
    }

    // Calculate estimatedMinutes
    const estimatedMinutes = Math.ceil(readingTime + (quizTemplateId ? 10 : 0) + 0.5 * flashcardCount);

    // Compute status
    const mastery = masteryMap.get(conceptName);
    const score = mastery?.masteryScore || 0;
    const confidence = mastery?.confidence || 0;

    let status: StudyPathStep["status"] = "available";

    // mastered = score >= 70 && confidence >= 50
    const isMastered = score >= 70 && confidence >= 50;

    // Fetch prerequisite names
    const prereqsList = conceptPrereqs.get(conceptName) || [];

    // locked = any prereq score < 40
    let isLocked = false;
    for (const prereqName of prereqsList) {
      const prereqMastery = masteryMap.get(prereqName);
      const prereqScore = prereqMastery?.masteryScore || 0;
      if (prereqScore < 40) {
        isLocked = true;
        break;
      }
    }

    if (isMastered) {
      status = "mastered";
    } else if (isLocked) {
      status = "locked";
    } else if (mastery) {
      status = "in_progress";
    } else {
      status = "available";
    }

    steps.push({
      stepId: firstKo?.id ?? `legacy-${conceptName}`,
      ideaId: null,
      chapterId: firstKo?.chapterId ?? "legacy",
      chapterTitle: firstKo?.chapterTitle ?? "Materi",
      chapterOrder: firstKo?.chapterOrderIndex ?? 0,
      conceptName,
      status,
      actions: {
        moduleHref,
        quizTemplateId,
        flashcardCount: flashcardCount > 0 ? flashcardCount : undefined,
      },
      estimatedMinutes,
      prerequisites: prereqsList,
      masteryScore: score,
      priorityReason: status === "mastered" ? "Sudah dikuasai" : status === "locked" ? "Selesaikan prasyarat" : mastery ? (score < 40 ? "Perkuat dasar" : "Lanjutkan latihan") : "Mulai konsep baru",
    });
  }

  return steps;
}

/**
 * Recomputes the study path and saves it to the database.
 */
export async function recomputeStudyPath(studentId: string, courseId: string): Promise<StudyPathStep[]> {
  const start = Date.now();
  const steps = await computeStudyPath(studentId, courseId);

  await db
    .insert(studyPaths)
    .values({
      id: randomUUID(),
      studentId,
      courseId,
      pathJson: steps,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [studyPaths.studentId, studyPaths.courseId],
      set: {
        pathJson: steps,
        computedAt: new Date(),
      },
    });

  const duration = Date.now() - start;
  console.log(`Recomputed study path for student ${studentId} in course ${courseId} in ${duration}ms`);
  return steps;
}

/**
 * Gets the student's study path from the cache, or computes it if missing.
 */
export async function getOrComputeStudyPath(studentId: string, courseId: string): Promise<StudyPathStep[]> {
  const canonicalPath = await computeCanonicalStudyPath(studentId, courseId);
  if (canonicalPath) return canonicalPath;

  const [existing] = await db
    .select()
    .from(studyPaths)
    .where(
      and(
        eq(studyPaths.studentId, studentId),
        eq(studyPaths.courseId, courseId)
      )
    )
    .limit(1);

  if (existing) {
    const cached = existing.pathJson as Partial<StudyPathStep>[];
    if (cached.every((step) => typeof step.stepId === "string" && typeof step.chapterId === "string")) {
      return cached as StudyPathStep[];
    }
    return recomputeStudyPath(studentId, courseId);
  }

  return recomputeStudyPath(studentId, courseId);
}

// ─── AI Study Planner: deadline-driven day buckets ──────────────────────────
// Closes the audit's "Adaptive/AI Study Planner" gap (docs/audit/student-
// personalization-tutor-audit.md, item 4): the ordering + per-step time
// estimates above already existed, but nothing converted "I have a midterm
// in N days" into a day-by-day plan. This is schedule-packing on top of the
// existing ordered, time-estimated steps, not new sequencing logic.

export interface StudyDayPlan {
  day: number; // 1-indexed
  steps: StudyPathStep[];
  totalMinutes: number;
}

/**
 * Packs already-ordered study path steps into `days` day-buckets by
 * cumulative estimatedMinutes, preserving the existing prerequisite +
 * weakest-first order (steps are never reordered, only split across days).
 * "mastered" steps are skipped since they need no further study time.
 */
export function bucketStudyPathByDays(
  steps: StudyPathStep[],
  days: number,
  minutesPerDayCap = 90,
): StudyDayPlan[] {
  const actionable = steps.filter((s) => s.status !== "mastered");
  if (actionable.length === 0 || days <= 0) return [];

  const totalMinutes = actionable.reduce((sum, s) => sum + s.estimatedMinutes, 0);
  const targetPerDay = Math.max(1, Math.min(minutesPerDayCap, Math.ceil(totalMinutes / days)));

  const plan: StudyDayPlan[] = [];
  let currentSteps: StudyPathStep[] = [];
  let currentMinutes = 0;
  let dayNum = 1;

  for (const step of actionable) {
    const wouldOverflow = currentMinutes > 0 && currentMinutes + step.estimatedMinutes > targetPerDay;
    if (wouldOverflow && dayNum < days) {
      plan.push({ day: dayNum, steps: currentSteps, totalMinutes: currentMinutes });
      dayNum++;
      currentSteps = [];
      currentMinutes = 0;
    }
    currentSteps.push(step);
    currentMinutes += step.estimatedMinutes;
  }

  if (currentSteps.length > 0) {
    plan.push({ day: dayNum, steps: currentSteps, totalMinutes: currentMinutes });
  }

  return plan;
}
