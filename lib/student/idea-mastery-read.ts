import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bab, concepts, ide, pemahamanIde, relasiIde } from "@/db/schema";
import { resolveStudentCourse } from "@/lib/student/course-catalog";

export type StudentMasteryConcept = {
  conceptName: string;
  conceptSlug: string | null;
  masteryScore: number | null;
  confidence: number | null;
  trend: "improving" | "stable" | "declining" | null;
  blockedBy: string[];
};

export type StudentMasteryGroup = {
  chapter: { id: string; title: string; orderIndex: number };
  concepts: StudentMasteryConcept[];
};

export type StudentIdeaMasteryReadModel = {
  groups: StudentMasteryGroup[];
  graphNodes: Array<{ conceptName: string; mastery: number | null }>;
  graphEdges: Array<{ from: string; to: string }>;
};

export async function getStudentIdeaMasteryReadModel(
  studentId: string,
  courseId: string,
): Promise<StudentIdeaMasteryReadModel | null> {
  const course = await resolveStudentCourse(courseId);
  if (!course?.canonicalId) return null;

  const rows = await db
    .select({
      id: ide.id,
      chapterId: ide.babId,
      conceptName: ide.canonicalStatement,
      conceptSlug: concepts.canonicalSlug,
      score: pemahamanIde.skor,
      confidence: pemahamanIde.keyakinan,
      chapterTitle: bab.title,
      chapterOrder: bab.orderIndex,
    })
    .from(ide)
    .innerJoin(bab, eq(ide.babId, bab.id))
    .leftJoin(concepts, eq(ide.conceptId, concepts.id))
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
    )
    .orderBy(asc(bab.orderIndex), asc(ide.code));

  if (rows.length === 0) return null;

  const ideaIds = rows.map((row) => row.id);
  const relations = await db
    .select({ sourceIdeaId: relasiIde.sourceIdeaId, targetIdeaId: relasiIde.targetIdeaId })
    .from(relasiIde)
    .where(
      and(
        eq(relasiIde.status, "active"),
        eq(relasiIde.relationType, "prerequisite"),
        inArray(relasiIde.sourceIdeaId, ideaIds),
        inArray(relasiIde.targetIdeaId, ideaIds),
      ),
    );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const prerequisites = new Map<string, string[]>();
  const graphEdges: Array<{ from: string; to: string }> = [];
  for (const relation of relations) {
    const source = byId.get(relation.sourceIdeaId);
    const target = byId.get(relation.targetIdeaId);
    if (!source || !target) continue;
    graphEdges.push({ from: source.conceptName, to: target.conceptName });
    if ((source.score ?? 0) < 40) {
      const current = prerequisites.get(target.id) ?? [];
      current.push(source.conceptName);
      prerequisites.set(target.id, current);
    }
  }

  const groupMap = new Map<string, StudentMasteryGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.chapterId);
    if (!group) {
      group = {
        chapter: {
          id: row.chapterId,
          title: row.chapterTitle,
          orderIndex: row.chapterOrder,
        },
        concepts: [],
      };
      groupMap.set(row.chapterId, group);
    }
    group.concepts.push({
      conceptName: row.conceptName,
      conceptSlug: row.conceptSlug,
      masteryScore: row.score,
      confidence: row.confidence,
      trend: null,
      blockedBy: prerequisites.get(row.id) ?? [],
    });
  }

  return {
    groups: [...groupMap.values()],
    graphNodes: rows.map((row) => ({ conceptName: row.conceptName, mastery: row.score })),
    graphEdges,
  };
}
