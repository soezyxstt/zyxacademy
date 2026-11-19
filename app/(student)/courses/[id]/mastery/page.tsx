import { Suspense } from "react";
import type { Metadata } from "next";
import { Lock, Target } from "lucide-react";
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
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseMasteryContentSkeleton } from "@/components/course/course-skeletons";
import { studentSectionClass } from "@/components/course/course-surfaces";
import { ConceptMap } from "@/components/course/concept-map";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { createMetadata } from "@/lib/site";
import {
  getStudentIdeaMasteryReadModel,
  type StudentIdeaMasteryReadModel,
} from "@/lib/student/idea-mastery-read";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  return createMetadata({
    title: course ? t("metadata.masteryTitle", { course: course.title }) : t("metadata.masteryTitleFallback"),
    description: t("metadata.masteryDescription"),
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

async function CourseMasteryContent({
  id,
  legacyCourseId,
  studentId,
}: {
  id: string;
  legacyCourseId: string;
  studentId: string;
}) {
  const enrolled = await checkFullCourseContentAccess(id);

  if (!enrolled) {
    return (
      <Reveal>
        <div className={studentSectionClass("flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center")}>
          <div className="mx-auto flex w-full max-w-md flex-col items-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
              <Lock className="size-5" aria-hidden />
            </div>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              <TranslatedText namespace="learning" messageKey="courseAccess.needToken" />
            </h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="mastery.activateToView" />
            </p>
            <div className="mt-5 w-full text-left">
              <EnrollmentForm />
            </div>
          </div>
        </div>
      </Reveal>
    );
  }

  const readModel =
    (await getStudentIdeaMasteryReadModel(studentId, id, await getAppLocale()))
    ?? (await getLegacyMasteryReadModel(studentId, legacyCourseId));

  const groups = readModel?.groups ?? [];
  if (groups.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <ConceptMap courseId={id} groups={groups} />
      </div>
    );
  }

  return <ConceptMap courseId={id} groups={groups} />;
}

export default async function CourseMasteryPage({ params }: Props) {
  const { id } = await params;
  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);
  if (!course || !session?.user?.id) return null;

  return (
    <CoursePageShell title={<TranslatedText namespace="learning" messageKey="mastery.title" values={{ course: course.title }} />} icon={Target}>
      <Suspense fallback={<CourseMasteryContentSkeleton />}>
        <CourseMasteryContent
          id={id}
          legacyCourseId={course.legacyId ?? id}
          studentId={session.user.id}
        />
      </Suspense>
    </CoursePageShell>
  );
}
