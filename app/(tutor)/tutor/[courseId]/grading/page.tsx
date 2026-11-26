import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { readAuthorizedTryoutGrading } from "@/lib/tutor/tryout-grading-read-model";
import { eq, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { GradingClient } from "./grading-client";
import { Reveal } from "@/components/ui/reveal";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
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
    title: pageTitle(title ? `${t("tryoutGrading")}: ${title}` : t("tryoutGrading")),
    description: title
      ? t("tryoutGradingDescriptionWithCourse", { course: title })
      : t("tryoutGradingDescription"),
  };
}

export default async function TutorGradingPage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/");
  }

  const { isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let result;
  try {
    result = await readAuthorizedTryoutGrading(session.user.id, courseId, isAdmin);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) notFound();
    throw error;
  }
  const { courseTitle, submissionsList } = result;

  return (
    <ApplicationPage spacing="space-y-(--group-gap)">
      <Reveal>
        <GradingClient
          courseId={courseId}
          tutorId={session.user.id}
          initialSubmissions={submissionsList}
          queueHeader={
            <PageHeader title={<><TranslatedText namespace="tutor" messageKey="routeTitles.tryoutGrading" />: {courseTitle}</>} backHref={`/tutor/${courseId}`} backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.overview" />} />
          }
        />
      </Reveal>
    </ApplicationPage>
  );
}
