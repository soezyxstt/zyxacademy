import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { getTutorCourseParticipants } from "@/lib/tutor/participant-read-model";
import { ParticipantsClient } from "./participants-client";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return {
    title: pageTitle("Peserta & Kelompok"),
    description: `Daftar peserta dan kelompok belajar aktif untuk kelas ${courseId}.`,
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
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TUTOR_ACCESS_DENIED")) {
      redirect("/tutor");
    }
    throw error;
  }

  return (
    <ApplicationPage>
      <PageHeader
        title={payload.course.title ? `Peserta & Kelompok: ${payload.course.title}` : "Peserta & Kelompok"}
        backHref={`/tutor/${courseId}`}
        backLabel="Ringkasan"
      />

      <ParticipantsClient data={payload} />
    </ApplicationPage>
  );
}
