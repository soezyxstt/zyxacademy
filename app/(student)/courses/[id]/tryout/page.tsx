import type { Metadata } from "next";

import { GraduationCap } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
// Fixture imports removed
import { getCourse } from "@/lib/course-utils";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { TryoutListClient } from "./tryout-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  return {
    title: pageTitle(course ? `${course.title} - Tryout` : "Tryout"),
    description: course
      ? `Daftar tryout ${course.title}; simulasi ujian untuk persiapan UTS dan UAS.`
      : "Daftar tryout; simulasi ujian untuk persiapan UTS dan UAS.",
  };
}

export default async function CourseTryoutListPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return null;

  const isEnrolled = await checkEnrollment(id);

  // Retrieve db tryouts
  const dbTryouts = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, course.legacyId ?? id), eq(exams.type, "tryout"), eq(exams.status, "published")));

  const mappedDb = dbTryouts.map((t) => {
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    return {
      id: t.id,
      courseId: id,
      title: t.title,
      type: "tryout" as const,
      status: t.status,
      settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
      questions: [],
      openAt: t.openAt,
      closeAt: t.closeAt,
    };
  });

  const allTryouts = mappedDb;

  return (
    <CoursePageShell
      title={`Tryout Ujian: ${course.title}`}
      description="Simulasikan ujian asli dengan batas waktu dan analisis pembahasan."
      icon={GraduationCap}
    >
      <Reveal>
        <TryoutListClient courseId={id} isEnrolled={isEnrolled} tryouts={allTryouts} />
      </Reveal>
    </CoursePageShell>
  );
}
