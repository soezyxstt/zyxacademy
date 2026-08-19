import type { Metadata } from "next";
import { Lock, Target } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { chapters, knowledgeObjects, knowledgeRelationships, studentConceptMastery, courses, concepts as conceptsTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq, asc, inArray } from "drizzle-orm";
import { ConceptMap } from "@/components/course/concept-map";
import { ConceptGraphView } from "@/components/course/concept-graph-view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  return {
    title: pageTitle(course ? `Peta Penguasaan - ${course.title}` : "Peta Penguasaan"),
    description: course
      ? `Visualisasi penguasaan konsep dan topik ${course.title}; lihat progres belajarmu.`
      : "Visualisasi penguasaan konsep dan topik; lihat progres belajarmu.",
  };
}

export default async function CourseMasteryPage({ params }: Props) {
  const { id } = await params;

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);

  if (!course) return null;

  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <CoursePageShell
        title={`Penguasaan Materi: ${course.title}`}
        description="Analisis tingkat penguasaan konsep Anda berdasarkan data kuis."
        icon={Target}
      >
        <Reveal>
          <div className={studentCardClass()}>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Aktifkan kelas untuk melihat peta penguasaan materi Anda.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <EnrollmentForm />
            </div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) return null;

  // 1. Fetch chapters sorted by orderIndex
  const courseChapters = await db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, id))
    .orderBy(asc(chapters.orderIndex));

  // 2. Fetch active KOs in this course sorted by learningOrder
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.courseId, id),
        eq(knowledgeObjects.status, "active")
      )
    )
    .orderBy(asc(knowledgeObjects.learningOrder));

  // 3. Fetch student mastery rows
  const masteryRows = await db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, id)
      )
    );

  // 4. Fetch prerequisite relationships
  const relationships = await db
    .select()
    .from(knowledgeRelationships)
    .where(eq(knowledgeRelationships.type, "prerequisite"));

  // Empty state: empty when no student Concept Mastery rows are found for this course
  if (masteryRows.length === 0) {
    return (
      <CoursePageShell
        title={`Penguasaan Materi: ${course.title}`}
        description="Analisis tingkat penguasaan konsep Anda berdasarkan data kuis."
        icon={Target}
      >
        <Reveal>
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/60 bg-card/10">
            <p className="text-body-sm text-muted-foreground">
              Peta pemahaman konsep akan muncul setelah Anda mengerjakan kuis pertama.
            </p>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  // 5. Build lookup maps for prerequisite-aware blocking calculation
  const masteryMap = new Map<string, number>();
  for (const row of masteryRows) {
    masteryMap.set(row.conceptName.trim(), row.masteryScore);
  }

  const koIdToConcept = new Map<string, string>();
  for (const ko of activeKOs) {
    koIdToConcept.set(ko.id, ko.conceptName.trim());
  }

  const prereqMap = new Map<string, Set<string>>();
  for (const rel of relationships) {
    const srcConcept = koIdToConcept.get(rel.sourceKoId);
    const tgtConcept = koIdToConcept.get(rel.targetKoId);
    if (srcConcept && tgtConcept && srcConcept !== tgtConcept) {
      if (!prereqMap.has(tgtConcept)) {
        prereqMap.set(tgtConcept, new Set());
      }
      prereqMap.get(tgtConcept)!.add(srcConcept);
    }
  }

  // Resolve concept name -> canonical slug for linking into the Concept Explorer page.
  const conceptIds = [...new Set(activeKOs.map((ko) => ko.conceptId))];
  const conceptSlugRows = conceptIds.length
    ? await db.select({ id: conceptsTable.id, canonicalSlug: conceptsTable.canonicalSlug }).from(conceptsTable).where(inArray(conceptsTable.id, conceptIds))
    : [];
  const conceptIdToSlug = new Map(conceptSlugRows.map((r) => [r.id, r.canonicalSlug]));
  const conceptNameToSlug = new Map<string, string>();
  for (const ko of activeKOs) {
    const name = ko.conceptName.trim();
    if (!conceptNameToSlug.has(name)) {
      const slug = conceptIdToSlug.get(ko.conceptId);
      if (slug) conceptNameToSlug.set(name, slug);
    }
  }

  // Helper to determine order of first appearance of a concept
  const conceptToLearningOrder = new Map<string, number>();
  for (const ko of activeKOs) {
    const trimmed = ko.conceptName.trim();
    if (!conceptToLearningOrder.has(trimmed)) {
      conceptToLearningOrder.set(trimmed, ko.learningOrder);
    }
  }

  // Group concept names by chapter
  const chapterToConcepts = new Map<string, Set<string>>();
  for (const ko of activeKOs) {
    if (!chapterToConcepts.has(ko.chapterId)) {
      chapterToConcepts.set(ko.chapterId, new Set());
    }
    chapterToConcepts.get(ko.chapterId)!.add(ko.conceptName.trim());
  }

  // 6. Map and sort chapters and their concepts
  const groups = courseChapters
    .map((ch) => {
      const conceptNamesSet = chapterToConcepts.get(ch.id) ?? new Set();
      const sortedConceptNames = [...conceptNamesSet].sort((a, b) => {
        return (conceptToLearningOrder.get(a) ?? 0) - (conceptToLearningOrder.get(b) ?? 0);
      });

      const concepts = sortedConceptNames.map((conceptName) => {
        const mastery = masteryRows.find((m) => m.conceptName.trim() === conceptName);
        
        // Compute blockedBy: any prerequisite concept B has mastery score < 40 (or 0)
        const prereqs = prereqMap.get(conceptName);
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
          conceptName,
          conceptSlug: conceptNameToSlug.get(conceptName) ?? null,
          masteryScore: mastery ? mastery.masteryScore : null,
          confidence: mastery ? mastery.confidence : null,
          trend: mastery ? (mastery.trend ?? null) : null,
          blockedBy,
        };
      });

      return {
        chapter: {
          id: ch.id,
          title: ch.title,
          orderIndex: ch.orderIndex,
        },
        concepts,
      };
    })
    .filter((group) => group.concepts.length > 0);

  // E5: build the concept-graph dataset (nodes + prerequisite edges) for the graph view.
  const graphEnabled = true;
  const graphNodes = [...new Set(groups.flatMap((g) => g.concepts.map((c) => c.conceptName)))].map((conceptName) => ({
    conceptName,
    mastery: masteryMap.has(conceptName) ? masteryMap.get(conceptName)! : null,
  }));
  const graphEdges = [...prereqMap.entries()].flatMap(([to, sources]) =>
    [...sources].map((from) => ({ from, to })),
  );

  return (
    <CoursePageShell
      title={`Penguasaan Materi: ${course.title}`}
      description="Analisis tingkat penguasaan konsep Anda berdasarkan data kuis."
      icon={Target}
    >
      {graphEnabled && graphNodes.length > 0 && (
        <Reveal>
          <div className="mb-8 space-y-3">
            <h2 className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Graf konsep
            </h2>
            <ConceptGraphView nodes={graphNodes} edges={graphEdges} courseId={id} />
          </div>
        </Reveal>
      )}
      <ConceptMap courseId={id} groups={groups} />
    </CoursePageShell>
  );
}
