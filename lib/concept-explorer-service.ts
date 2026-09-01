/**
 * Concept Explorer: assembles a single-concept "everything about this topic"
 * view from data that already existed across concepts/conceptLocalizations,
 * knowledgeObjects (grouped by type: definition/formula/example/misconception/
 * etc.), and knowledgeRelationships (prerequisite/related/extends edges).
 *
 * Closes docs/audit/active-recall-and-exploration-audit.md item 2: every
 * piece of data the vision needed already existed, nobody assembled it into
 * one page. Pure SQL, no AI.
 */

import { db } from "@/db";
import {
  concepts,
  conceptLocalizations,
  ide,
  knowledgeObjects,
  knowledgeRelationships,
  pemahamanIde,
  relasiIde,
  studentConceptMastery,
} from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { resolveStudentCourse } from "@/lib/student/course-catalog";

export interface ConceptRef {
  conceptName: string;
  slug: string;
}

export interface ConceptKO {
  id: string;
  title: string;
  content: string;
}

export interface ConceptExplorerData {
  conceptId: string;
  conceptName: string;
  canonicalSlug: string;
  masteryScore: number | null;
  kosByType: Partial<Record<
    "definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview",
    ConceptKO[]
  >>;
  prerequisites: ConceptRef[]; // concepts this one depends on
  unlocks: ConceptRef[];       // concepts that depend on this one
  related: ConceptRef[];
}

function dedupeBySlug(refs: ConceptRef[]): ConceptRef[] {
  const seen = new Map<string, ConceptRef>();
  for (const r of refs) if (!seen.has(r.slug)) seen.set(r.slug, r);
  return [...seen.values()];
}

/**
 * Returns null if the concept doesn't exist, or isn't actually taught
 * (no active KOs) in the given course.
 */
export async function getConceptExplorerData(
  courseId: string,
  slug: string,
  studentId?: string,
): Promise<ConceptExplorerData | null> {
  const [conceptRow] = await db
    .select({ id: concepts.id, canonicalSlug: concepts.canonicalSlug, displayName: conceptLocalizations.displayName })
    .from(concepts)
    .innerJoin(conceptLocalizations, eq(conceptLocalizations.conceptId, concepts.id))
    .where(eq(concepts.canonicalSlug, slug))
    .limit(1);

  if (!conceptRow) return null;

  const course = await resolveStudentCourse(courseId);
  const canonicalIdeas = course?.canonicalId
    ? await db
        .select({
          id: ide.id,
          title: ide.canonicalStatement,
          content: ide.conciseExplanation,
          latex: ide.latex,
          type: ide.knowledgeKind,
        })
        .from(ide)
        .where(
          and(
            eq(ide.mataKuliahId, course.canonicalId),
            eq(ide.conceptId, conceptRow.id),
            eq(ide.status, "published"),
          ),
        )
    : [];

  if (canonicalIdeas.length > 0) {
    const ideaIds = canonicalIdeas.map((item) => item.id);
    const edges = await db
      .select({
        sourceIdeaId: relasiIde.sourceIdeaId,
        targetIdeaId: relasiIde.targetIdeaId,
        type: relasiIde.relationType,
      })
      .from(relasiIde)
      .where(
        and(
          eq(relasiIde.status, "active"),
          or(inArray(relasiIde.sourceIdeaId, ideaIds), inArray(relasiIde.targetIdeaId, ideaIds)),
        ),
      );
    const otherIds = [...new Set(edges.flatMap((edge) => [edge.sourceIdeaId, edge.targetIdeaId]).filter((id) => !ideaIds.includes(id)))];
    const otherIdeas = otherIds.length
      ? await db
          .select({
            id: ide.id,
            name: ide.canonicalStatement,
            slug: concepts.canonicalSlug,
          })
          .from(ide)
          .innerJoin(concepts, eq(ide.conceptId, concepts.id))
          .where(and(inArray(ide.id, otherIds), eq(ide.status, "published")))
      : [];
    const otherById = new Map(otherIdeas.map((item) => [item.id, item]));
    const prerequisites: ConceptRef[] = [];
    const unlocks: ConceptRef[] = [];
    const related: ConceptRef[] = [];
    for (const edge of edges) {
      const sourceHere = ideaIds.includes(edge.sourceIdeaId);
      const targetHere = ideaIds.includes(edge.targetIdeaId);
      if (edge.type === "prerequisite" && targetHere) {
        const item = otherById.get(edge.sourceIdeaId);
        if (item) prerequisites.push({ conceptName: item.name, slug: item.slug });
      } else if (edge.type === "prerequisite" && sourceHere) {
        const item = otherById.get(edge.targetIdeaId);
        if (item) unlocks.push({ conceptName: item.name, slug: item.slug });
      } else if ((edge.type === "related" || edge.type === "extends") && (sourceHere || targetHere)) {
        const item = otherById.get(sourceHere ? edge.targetIdeaId : edge.sourceIdeaId);
        if (item) related.push({ conceptName: item.name, slug: item.slug });
      }
    }

    const typeMap: Record<string, keyof NonNullable<ConceptExplorerData["kosByType"]>> = {
      definition: "definition",
      formula: "formula",
      example: "example",
      misconception: "misconception",
      procedure: "exercise",
      principle: "concept_overview",
      constraint: "summary",
      other: "concept_overview",
    };
    const kosByType: ConceptExplorerData["kosByType"] = {};
    for (const item of canonicalIdeas) {
      const type = typeMap[item.type] ?? "concept_overview";
      const list = kosByType[type] ?? [];
      list.push({
        id: item.id,
        title: item.title,
        content: item.latex ? `${item.content}\n\n$$${item.latex}$$` : item.content,
      });
      kosByType[type] = list;
    }
    const masteryRows = studentId
      ? await db
          .select({ score: pemahamanIde.skor })
          .from(pemahamanIde)
          .where(and(eq(pemahamanIde.penggunaId, studentId), inArray(pemahamanIde.ideId, ideaIds)))
      : [];
    const masteryScore = masteryRows.length
      ? Math.round(masteryRows.reduce((total, row) => total + row.score, 0) / masteryRows.length)
      : null;
    return {
      conceptId: conceptRow.id,
      conceptName: conceptRow.displayName,
      canonicalSlug: conceptRow.canonicalSlug,
      masteryScore,
      kosByType,
      prerequisites: dedupeBySlug(prerequisites),
      unlocks: dedupeBySlug(unlocks),
      related: dedupeBySlug(related),
    };
  }

  const kos = await db
    .select({ id: knowledgeObjects.id, title: knowledgeObjects.title, content: knowledgeObjects.content, type: knowledgeObjects.type })
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.courseId, course?.legacyId ?? courseId),
        eq(knowledgeObjects.conceptId, conceptRow.id),
        eq(knowledgeObjects.status, "active"),
      ),
    );

  if (kos.length === 0) return null;

  const kosByType: ConceptExplorerData["kosByType"] = {};
  for (const ko of kos) {
    const list = kosByType[ko.type] ?? [];
    list.push({ id: ko.id, title: ko.title, content: ko.content });
    kosByType[ko.type] = list;
  }

  const koIds = kos.map((k) => k.id);
  const edges = koIds.length
    ? await db
        .select({ sourceKoId: knowledgeRelationships.sourceKoId, targetKoId: knowledgeRelationships.targetKoId, type: knowledgeRelationships.type })
        .from(knowledgeRelationships)
        .where(or(inArray(knowledgeRelationships.sourceKoId, koIds), inArray(knowledgeRelationships.targetKoId, koIds)))
    : [];

  const otherKoIds = new Set<string>();
  for (const e of edges) {
    otherKoIds.add(e.sourceKoId);
    otherKoIds.add(e.targetKoId);
  }

  const otherKoRows = otherKoIds.size
    ? await db
        .select({ id: knowledgeObjects.id, conceptId: knowledgeObjects.conceptId })
        .from(knowledgeObjects)
        .where(inArray(knowledgeObjects.id, [...otherKoIds]))
    : [];
  const koToConceptId = new Map(otherKoRows.map((r) => [r.id, r.conceptId]));

  const otherConceptIds = new Set([...koToConceptId.values()].filter((id) => id !== conceptRow.id));
  const otherConceptRows = otherConceptIds.size
    ? await db
        .select({ id: concepts.id, slug: concepts.canonicalSlug, displayName: conceptLocalizations.displayName })
        .from(concepts)
        .innerJoin(conceptLocalizations, eq(conceptLocalizations.conceptId, concepts.id))
        .where(inArray(concepts.id, [...otherConceptIds]))
    : [];
  const conceptInfo = new Map(otherConceptRows.map((r) => [r.id, { slug: r.slug, name: r.displayName }]));

  const prerequisites: ConceptRef[] = [];
  const unlocks: ConceptRef[] = [];
  const related: ConceptRef[] = [];

  for (const e of edges) {
    const srcConceptId = koToConceptId.get(e.sourceKoId);
    const tgtConceptId = koToConceptId.get(e.targetKoId);
    if (!srcConceptId || !tgtConceptId || srcConceptId === tgtConceptId) continue;

    if (e.type === "prerequisite") {
      if (tgtConceptId === conceptRow.id) {
        const info = conceptInfo.get(srcConceptId);
        if (info) prerequisites.push({ conceptName: info.name, slug: info.slug });
      } else if (srcConceptId === conceptRow.id) {
        const info = conceptInfo.get(tgtConceptId);
        if (info) unlocks.push({ conceptName: info.name, slug: info.slug });
      }
    } else if (e.type === "related" || e.type === "extends") {
      const otherId = srcConceptId === conceptRow.id ? tgtConceptId : srcConceptId;
      const info = conceptInfo.get(otherId);
      if (info) related.push({ conceptName: info.name, slug: info.slug });
    }
  }

  let masteryScore: number | null = null;
  if (studentId) {
    const [m] = await db
      .select({ masteryScore: studentConceptMastery.masteryScore })
      .from(studentConceptMastery)
      .where(
        and(
          eq(studentConceptMastery.studentId, studentId),
          eq(studentConceptMastery.courseId, courseId),
          eq(studentConceptMastery.conceptName, conceptRow.displayName),
        ),
      )
      .limit(1);
    masteryScore = m?.masteryScore ?? null;
  }

  return {
    conceptId: conceptRow.id,
    conceptName: conceptRow.displayName,
    canonicalSlug: conceptRow.canonicalSlug,
    masteryScore,
    kosByType,
    prerequisites: dedupeBySlug(prerequisites),
    unlocks: dedupeBySlug(unlocks),
    related: dedupeBySlug(related),
  };
}
