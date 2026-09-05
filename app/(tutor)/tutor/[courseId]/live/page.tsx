import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { pageTitle } from "@/lib/site";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { TutorLiveConsole } from "@/components/tutor/tutor-live-console";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { inArray } from "drizzle-orm";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return {
    title: pageTitle("Kuis Langsung"),
    description: `Penyelenggaraan kuis langsung untuk kelas ${courseId}.`,
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
        title={`Kuis Langsung: ${courseTitle}`}
        backHref={`/tutor/${courseId}`}
        backLabel="Ringkasan"
      />

      <TutorLiveConsole courseId={courseId} courseTitle={courseTitle} />
    </ApplicationPage>
  );
}
