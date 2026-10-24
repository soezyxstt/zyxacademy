import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { getCoursePendingQuizAttempts } from "@/lib/tutor/quiz-grading";
import { TutorQuizGradingClient } from "./grading-client";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { CheckSquare } from "lucide-react";

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
    title: pageTitle(title ? `${t("quizGrading")}: ${title}` : t("quizGrading")),
    description: t("quizGradingDescription"),
  };
}

export default async function TutorQuizGradingPage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }

  try {
    await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: false });
  } catch {
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

  const pendingAttempts = await getCoursePendingQuizAttempts(courseId, session.user.id);

  return (
    <ApplicationPage>
      <Reveal>
        <PageHeader
          icon={CheckSquare}
          title={<TranslatedText namespace="tutor" messageKey="routeTitles.quizGrading" />}
          backHref={`/tutor/${courseId}/quizzes`}
          backLabel={<><TranslatedText namespace="tutor" messageKey="routeTitles.backToQuizzes" /> ({courseTitle})</>}
        />
      </Reveal>

      <Reveal>
        <TutorQuizGradingClient
          courseId={courseId}
          pendingAttempts={pendingAttempts}
        />
      </Reveal>
    </ApplicationPage>
  );
}
