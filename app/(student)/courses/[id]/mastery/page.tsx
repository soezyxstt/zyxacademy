import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Lock, Target, ArrowRight } from "lucide-react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  chapters,
  concepts as conceptsTable,
  knowledgeObjects,
  knowledgeRelationships,
  studentConceptMastery,
} from "@/db/schema";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { ConceptGraphView } from "@/components/course/concept-graph-view";
import { ConceptMap } from "@/components/course/concept-map";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { getCourse } from "@/lib/course-utils";
import { createMetadata, pageTitle } from "@/lib/site";
import {
  getStudentIdeaMasteryReadModel,
  type StudentIdeaMasteryReadModel,
} from "@/lib/student/idea-mastery-read";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return createMetadata({
    title: course ? `Peta Penguasaan ${course.title}` : "Peta Penguasaan",
    description: course
      ? `Visualisasi penguasaan konsep dan topik ${course.title}; lihat progres belajarmu.`
      : "Visualisasi penguasaan konsep dan topik; lihat progres belajarmu.",
    path: `/courses/${id}/mastery`,
  });
}


async function getLegacyMasteryReadModel(
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
        .where(inArray(conceptsTable.id, conceptIds))
    : [];

  const scoreByName = new Map(masteryRows.map((row) => [row.conceptName.trim(), row.masteryScore]));
  const masteryByName = new Map(masteryRows.map((row) => [row.conceptName.trim(), row]));
  const koById = new Map(activeKOs.map((ko) => [ko.id, ko]));
  const slugByConceptId = new Map(slugRows.map((row) => [row.id, row.canonicalSlug]));
  const prerequisites = new Map<string, string[]>();
  const graphEdges: Array<{ from: string; to: string }> = [];
  for (const relation of relationships) {
    const source = koById.get(relation.sourceKoId)?.conceptName.trim();
    const target = koById.get(relation.targetKoId)?.conceptName.trim();
    if (!source || !target || source === target) continue;
    graphEdges.push({ from: source, to: target });
    if ((scoreByName.get(source) ?? 0) < 40) {
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
    graphNodes: [...scoreByName].map(([conceptName, mastery]) => ({ conceptName, mastery })),
    graphEdges,
  };
}

export default async function CourseMasteryPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;
  const enrolled = await checkEnrollment(id);

  if (!enrolled) {
    return (
      <CoursePageShell title={`Penguasaan Materi: ${course.title}`} description="Analisis tingkat penguasaan konsep Anda berdasarkan aktivitas belajar." icon={Target}>
        <Reveal>
          <div className={studentCardClass()}>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border"><Lock className="size-5" /></div>
              <div>
                <h3 className="font-heading text-body-base font-bold text-foreground">Butuh token kelas</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">Aktifkan kelas untuk melihat peta penguasaan materi Anda.</p>
              </div>
            </div>
            <div className="mt-4"><EnrollmentForm /></div>
          </div>
        </Reveal>
      </CoursePageShell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const readModel =
    (await getStudentIdeaMasteryReadModel(session.user.id, id))
    ?? (await getLegacyMasteryReadModel(session.user.id, course.legacyId ?? id));

  return (
    <CoursePageShell title={`Penguasaan Materi: ${course.title}`} description="Analisis tingkat penguasaan konsep Anda berdasarkan aktivitas belajar." icon={Target}>
      {!readModel || readModel.groups.length === 0 ? (
        <Reveal>
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 sm:p-12 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <Target className="size-6" />
            </div>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Peta penguasaan belum tersedia
            </h3>
            <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
              Peta pemahaman konsep akan otomatis terbentuk seiring Anda mempelajari bab materi dan menyelesaikan latihan kuis.
            </p>
            <div className="mt-5">
              <Button asChild size="sm" className="rounded-lg text-body-sm">
                <Link href={`/courses/${id}/path`}>
                  Buka Alur Belajar
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      ) : (
        <>
          {readModel.graphNodes.length > 0 && (
            <Reveal>
              <div className="mb-8 space-y-3">
                <h2 className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">Graf konsep</h2>
                <ConceptGraphView nodes={readModel.graphNodes} edges={readModel.graphEdges} courseId={id} />
              </div>
            </Reveal>
          )}
          <ConceptMap courseId={id} groups={readModel.groups} />
        </>
      )}
    </CoursePageShell>
  );
}
