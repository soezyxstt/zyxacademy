import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyTutorAccess } from "@/lib/auth/tutor-session-access";
import { getTutorQuizWithAttribution, getTutorQuestionBank } from "@/lib/tutor/quiz-read-model";
import { TutorQuizForm } from "@/components/tutor/tutor-quiz-form";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ courseId: string; templateId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId, templateId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  const template = await getTutorQuizWithAttribution(courseId, templateId);

  return {
    title: pageTitle(template ? `${t("editQuiz")}: ${template.title}` : t("editQuiz")),
  };
}

export default async function EditTutorQuizPage({ params }: Props) {
  const { courseId, templateId } = await params;

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

  // Load quiz template with canonical creator attribution
  const template = await getTutorQuizWithAttribution(courseId, templateId);
  if (!template) notFound();

  // Tutors cannot edit simulation quizzes
  if (template.category === "simulation") {
    redirect(`/tutor/${courseId}/quizzes`);
  }

  // Load question bank questions for this course
  const questionBank = await getTutorQuestionBank(courseId);

  const parsedRules =
    typeof template.selectionRules === "string"
      ? (() => {
          try {
            return JSON.parse(template.selectionRules);
          } catch {
            return {};
          }
        })()
      : template.selectionRules;

  const initialData = {
    id: template.id,
    courseId: template.courseId,
    title: template.title,
    category: template.category as "daily" | "weekly" | "chapter" | "premium",
    visibility: template.visibility,
    status: template.status,
    manualStatus: template.manualStatus,
    timeLimitSeconds: template.timeLimitSeconds,
    maxAttempts: template.maxAttempts,
    openAt: template.openAt,
    closeAt: template.closeAt,
    showDiscussion: template.showDiscussion,
    creatorId: template.creatorId,
    creatorName: template.creatorName,
    creatorEmail: template.creatorEmail,
    creatorRole: template.creatorRole,
    createdAt: template.createdAt,
    selectionRules: parsedRules,
  };

  return (
    <ApplicationPage>
      <Reveal>
        <TutorQuizForm
          courseId={courseId}
          courseTitle={courseTitle}
          initialData={initialData}
          questionBank={questionBank}
          isEdit={true}
        />
      </Reveal>
    </ApplicationPage>
  );
}
