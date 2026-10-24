import { notFound } from "next/navigation";
import { db } from "@/db";
import { quizTemplates, courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { checkCourseMatch } from "@/lib/tutor/assessment-policy";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { FileSpreadsheet } from "lucide-react";

type Props = { params: Promise<{ courseId: string; templateId: string }> };

export async function generateMetadata({ params }: Props) {
  const { templateId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  const [tpl] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);
  return {
    title: pageTitle(tpl ? `${t("studentAttempts")}: ${tpl.title}` : t("studentAttempts")),
  };
}

export default async function TutorQuizAttemptsPage({ params }: Props) {
  const { courseId, templateId } = await params;

  const { access } = await verifyTutorAccess(courseId);

  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
    })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template || !checkCourseMatch(template.courseId, access.courseId!, access.legacyCourseId)) {
    notFound();
  }

  const [mk] = await db
    .select({ title: mataKuliah.title })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const [legacyCourse] = !mk
    ? await db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1)
    : [null];

  const courseTitle = mk?.title ?? legacyCourse?.title ?? courseId;

  return (
    <ApplicationPage>
      <Reveal>
        <PageHeader
          icon={FileSpreadsheet}
          title={<><TranslatedText namespace="tutor" messageKey="routeTitles.studentAttempts" />: {template.title}</>}
          backHref={`/tutor/${courseId}/quizzes`}
          backLabel={<><TranslatedText namespace="tutor" messageKey="routeTitles.backToQuizzes" /> ({courseTitle})</>}
        />
      </Reveal>

      <Reveal>
        <QuizAttemptsSpreadsheet templateId={templateId} quizTitle={template.title} translationNamespace="admin" />
      </Reveal>
    </ApplicationPage>
  );
}
