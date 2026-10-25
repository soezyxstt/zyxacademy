import { notFound } from "next/navigation";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { getTutorQuizzesWithAttribution, getTutorQuestionBank } from "@/lib/tutor/quiz-read-model";
import { QuizzesClient } from "./quizzes-client";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  const [mk] = await db
    .select({ title: mataKuliah.title })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);
  const [c] = !mk
    ? await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1)
    : [null];
  const title = mk?.title ?? c?.title;

  return {
    title: pageTitle(title ? `${t("manageQuizzes")}: ${title}` : t("manageQuizzes")),
  };
}

export default async function TutorQuizzesPage({ params }: Props) {
  const { courseId } = await params;

  // Verify tutor access
  await verifyTutorAccess(courseId);

  const [mk] = await db
    .select({ id: mataKuliah.id, title: mataKuliah.title })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const [legacyCourse] = !mk
    ? await db
        .select({ id: courses.id, title: courses.title })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1)
    : [null];

  if (!mk && !legacyCourse) notFound();
  const courseTitle = mk?.title ?? legacyCourse?.title ?? courseId;

  // Load quiz templates with canonical creator attribution
  const templatesList = await getTutorQuizzesWithAttribution(courseId);

  // Load question bank questions
  const questionBankList = await getTutorQuestionBank(courseId);

  return (
    <ApplicationPage>
      <Reveal>
        <PageHeader
          icon={ClipboardList}
          title={<><TranslatedText namespace="tutor" messageKey="routeTitles.manageQuizzesAndBank" />: {courseTitle}</>}
          backHref={`/tutor/${courseId}`}
          backLabel={<><TranslatedText namespace="tutor" messageKey="routeTitles.dashboardTitle" />: {courseTitle}</>}
        />
      </Reveal>

      <Reveal>
        <QuizzesClient
          courseId={courseId}
          initialTemplates={templatesList}
          initialQuestionBank={questionBankList}
        />
      </Reveal>
    </ApplicationPage>
  );
}
