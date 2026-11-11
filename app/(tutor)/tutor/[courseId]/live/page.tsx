import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { TutorLiveConsole } from "@/components/tutor/tutor-live-console";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { inArray } from "drizzle-orm";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  return {
    title: pageTitle(t("liveQuiz")),
    description: t("liveQuizDescription", { courseId }),
  };
}

export default async function TutorLivePage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, {
      allowAdmin: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) {
      redirect("/tutor");
    }
    throw error;
  }

  // Fetch course title
  const courseIdsToCheck = [access.courseId, access.legacyCourseId, courseId].filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );

  let courseTitle = "Mata Kuliah";

  const mkRows = await db
    .select({ title: mataKuliah.title })
    .from(mataKuliah)
    .where(inArray(mataKuliah.id, courseIdsToCheck))
    .limit(1);

  if (mkRows.length > 0) {
    courseTitle = mkRows[0].title;
  } else {
    const legacyRows = await db
      .select({ title: courses.title })
      .from(courses)
      .where(inArray(courses.id, courseIdsToCheck))
      .limit(1);

    if (legacyRows.length > 0) {
      courseTitle = legacyRows[0].title;
    }
  }

  return (
    <ApplicationPage>
      <PageHeader
        title={<><TranslatedText namespace="tutor" messageKey="routeTitles.liveQuiz" />: {courseTitle}</>}
        backHref={`/tutor/${courseId}`}
        backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.overview" />}
      />

      <TutorLiveConsole courseId={courseId} courseTitle={courseTitle} />
    </ApplicationPage>
  );
}
