import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { createMetadata } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { QuizListClient } from "../../[id]/quiz/quiz-list-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExtras.pka");
  return createMetadata({ title: t("simulationTitle"), description: t("simulationDescription"), path: "/courses/tutorial-pka/simulasi" });
}


export default async function PkaSimulasiPage() {
  const userId = await requirePkaSession("/courses/tutorial-pka/simulasi");
  const hasFullContentAccess = await checkEnrollment(PKA_COURSE_ID);

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
      title={<TranslatedText namespace="studentExtras.pka" messageKey="simulationPageTitle" />}

      icon={ClipboardList}
    >
      <Reveal>
        <QuizListClient
          courseId={PKA_COURSE_ID}
          hasFullContentAccess={hasFullContentAccess}
          templates={templates}
          attempts={attempts}
        />
      </Reveal>
    </CoursePageShell>
  );
}

