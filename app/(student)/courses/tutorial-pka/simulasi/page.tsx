import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { createMetadata, pageTitle } from "@/lib/site";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { QuizListClient } from "../../[id]/quiz/quiz-list-client";

export const metadata: Metadata = createMetadata({
  title: "Simulasi Tutorial PKA",
  description: "Simulasi tryout PKA untuk persiapan ujian akademik; kerjakan latihan soal interaktif dengan batas waktu.",
  path: "/courses/tutorial-pka/simulasi",
});


export default async function PkaSimulasiPage() {
  const userId = await requirePkaSession("/courses/tutorial-pka/simulasi");
  const isEnrolled = await checkEnrollment(PKA_COURSE_ID);

  // Retrieve published simulation templates for Tutorial PKA
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, PKA_COURSE_ID),
        eq(quizTemplates.status, "published"),
        eq(quizTemplates.category, "simulation")
      )
    )
    .orderBy(desc(quizTemplates.createdAt));

  // Retrieve student attempts for these templates
  const attempts = await db
    .select()
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.studentId, userId));

  return (
    <CoursePageShell
      title="Simulasi Ujian PKA"

      icon={ClipboardList}
    >
      <Reveal>
        <QuizListClient
          courseId={PKA_COURSE_ID}
          isEnrolled={isEnrolled}
          templates={templates}
          attempts={attempts}
        />
      </Reveal>
    </CoursePageShell>
  );
}

