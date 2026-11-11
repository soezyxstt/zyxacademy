import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { getTutorCourseParticipants } from "@/lib/tutor/participant-read-model";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { ParticipantsClient } from "./participants-client";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  return {
    title: pageTitle(t("participants")),
    description: t("participantsDescription", { courseId }),
  };
}

export default async function TutorParticipantsPage({ params }: Props) {
  const { courseId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  let payload;
  try {
    payload = await getTutorCourseParticipants(session.user.id, courseId, {
      allowAdmin: false,
    }, undefined, requireTutorCourseAccess);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) {
      redirect("/tutor");
    }
    throw error;
  }

  return (
    <ApplicationPage>
      <PageHeader
        title={payload.course.title ? <><TranslatedText namespace="tutor" messageKey="routeTitles.participants" />: {payload.course.title}</> : <TranslatedText namespace="tutor" messageKey="routeTitles.participants" />}
        backHref={`/tutor/${courseId}`}
        backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.overview" />}
      />

      <ParticipantsClient data={payload} />
    </ApplicationPage>
  );
}
