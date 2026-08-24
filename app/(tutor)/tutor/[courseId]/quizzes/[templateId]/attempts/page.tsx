import { notFound } from "next/navigation";
import { db } from "@/db";
import { quizTemplates, courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { checkCourseMatch } from "@/lib/tutor/assessment-policy";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { FileSpreadsheet } from "lucide-react";

type Props = { params: Promise<{ courseId: string; templateId: string }> };

export async function generateMetadata({ params }: Props) {
  const { templateId } = await params;
  const [tpl] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);
  return {
    title: pageTitle(tpl ? `Sheet Attempt: ${tpl.title}` : "Sheet Attempt Siswa"),
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
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6 font-sans">
      <Reveal>
        <PageHeader
          icon={FileSpreadsheet}
          title={`Sheet Attempt: ${template.title}`}
          backHref={`/tutor/${courseId}/quizzes`}
          backLabel={`Kembali ke Kuis (${courseTitle})`}
        />
      </Reveal>

      <Reveal>
        <QuizAttemptsSpreadsheet templateId={templateId} quizTitle={template.title} />
      </Reveal>
    </div>
  );
}
