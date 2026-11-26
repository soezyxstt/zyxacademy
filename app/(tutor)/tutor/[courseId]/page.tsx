import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getTutorCourseOverview } from "@/lib/tutor/course-overview-read-model";
import {
  readCourseSnapshot,
} from "@/lib/cohort-analytics";
import { AnalyticsClient } from "@/components/tutor/analytics-client";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";

import { db } from "@/db";
import { mataKuliah } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  const mkRows = await db
    .select({ title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(eq(mataKuliah.id, courseId))
    .limit(1);

  const legacyCourseId = mkRows[0]?.legacyCourseId ?? courseId;
  const snapshot = await readCourseSnapshot(legacyCourseId);
  const title = mkRows[0]?.title ?? snapshot?.payload.courseTitle;
  return {
    title: pageTitle(title ? `${t("analytics")}: ${title}` : t("analytics")),
    description: title
      ? t("analyticsDescriptionWithCourse", { course: title })
      : t("analyticsDescription"),
  };
}

export default async function TutorCoursePage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  let overview;
  try {
    overview = await getTutorCourseOverview(session.user.id, courseId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) redirect("/tutor");
    throw error;
  }
  if (!overview) notFound();
  const { analytics, updatedAt, legacyCourseId } = overview;

  return (
    <ApplicationPage spacing="space-y-(--section-gap)">
      <PageHeader
        title={analytics.courseTitle}
        backHref="/tutor"
        backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.teaching" />}
        divider={false}
      />
      <AnalyticsClient
        courseId={legacyCourseId}
        analytics={analytics}
        updatedAt={updatedAt}
      />
    </ApplicationPage>
  );
}
