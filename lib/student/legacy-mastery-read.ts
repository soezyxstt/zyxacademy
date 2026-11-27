import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  chapters,
  concepts as conceptsTable,
  conceptLocalizations,
  knowledgeObjects,
  knowledgeRelationships,
  studentConceptMastery,
} from "@/db/schema";
import type { StudentIdeaMasteryReadModel } from "@/lib/student/idea-mastery-read";

export async function getLegacyMasteryReadModel(
  studentId: string,
  courseId: string,
): Promise<StudentIdeaMasteryReadModel | null> {
  const courseChapters = await db.select().from(chapters).where(eq(chapters.courseId, courseId)).orderBy(asc(chapters.orderIndex));
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.courseId, courseId), eq(knowledgeObjects.status, "active")))
    .orderBy(asc(knowledgeObjects.learningOrder));
  const masteryRows = await db
    .select()
    .from(studentConceptMastery)
    .where(and(eq(studentConceptMastery.studentId, studentId), eq(studentConceptMastery.courseId, courseId)));
  if (masteryRows.length === 0) return null;

  const koIds = activeKOs.map((ko) => ko.id);
  const relationships = koIds.length
    ? await db
        .select({ sourceKoId: knowledgeRelationships.sourceKoId, targetKoId: knowledgeRelationships.targetKoId })
        .from(knowledgeRelationships)
        .where(
          and(
            eq(knowledgeRelationships.type, "prerequisite"),
            inArray(knowledgeRelationships.sourceKoId, koIds),
            inArray(knowledgeRelationships.targetKoId, koIds),
          ),
        )
    : [];
  const conceptIds = [...new Set(activeKOs.map((ko) => ko.conceptId))];
  const slugRows = conceptIds.length
    ? await db
        .select({ id: conceptsTable.id, canonicalSlug: conceptsTable.canonicalSlug })
        .from(conceptsTable)
        .innerJoin(conceptLocalizations, eq(conceptLocalizations.conceptId, conceptsTable.id))
        .where(inArray(conceptsTable.id, conceptIds))
    : [];

  const scoreByName = new Map(masteryRows.map((row) => [row.conceptName.trim(), row.masteryScore]));
  const masteryByName = new Map(masteryRows.map((row) => [row.conceptName.trim(), row]));
  const koById = new Map(activeKOs.map((ko) => [ko.id, ko]));
  const slugByConceptId = new Map(slugRows.map((row) => [row.id, row.canonicalSlug]));
  const prerequisites = new Map<string, string[]>();
  for (const relation of relationships) {
    const source = koById.get(relation.sourceKoId)?.conceptName.trim();
    const target = koById.get(relation.targetKoId)?.conceptName.trim();
    if (!source || !target || source === target) continue;
    const score = scoreByName.get(source);
    if (score != null && score < 40) {
      const current = prerequisites.get(target) ?? [];
      if (!current.includes(source)) current.push(source);
      prerequisites.set(target, current);
    }
  }

  const groups = courseChapters.flatMap((chapter) => {
    const chapterKOs = activeKOs.filter((ko) => ko.chapterId === chapter.id);
    const names = [...new Set(chapterKOs.map((ko) => ko.conceptName.trim()))];
    if (names.length === 0) return [];
    return [{
      chapter: { id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex },
      concepts: names.map((conceptName) => {
        const ko = chapterKOs.find((item) => item.conceptName.trim() === conceptName);
        const mastery = masteryByName.get(conceptName);
        return {
          conceptName,
          conceptSlug: ko ? slugByConceptId.get(ko.conceptId) ?? null : null,
          masteryScore: mastery?.masteryScore ?? null,
          confidence: mastery?.confidence ?? null,
          trend: mastery?.trend ?? null,
          blockedBy: prerequisites.get(conceptName) ?? [],
        };
      }),
    }];
  });
  return {
    groups,
  };
}
