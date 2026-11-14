import { notFound } from "next/navigation";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyTutorAccess } from "@/lib/auth/tutor-session-access";
import { getTutorQuestionBank } from "@/lib/tutor/quiz-read-model";
import { TutorQuizForm } from "@/components/tutor/tutor-quiz-form";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

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
    title: pageTitle(title ? `${t("createQuiz")}: ${title}` : t("createQuiz")),
  };
}

export default async function NewTutorQuizPage({ params }: Props) {
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

  // Load question bank questions for this course
  const questionBank = await getTutorQuestionBank(courseId);

  return (
    <ApplicationPage>
      <Reveal>
        <TutorQuizForm
          courseId={courseId}
          courseTitle={courseTitle}
          questionBank={questionBank}
          isEdit={false}
        />
      </Reveal>
    </ApplicationPage>
  );
}
