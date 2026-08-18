import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { quizTemplates, courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NotebookPen } from "lucide-react";
import { QuizForm, InitialQuizData } from "../../_components/quiz-form";

export const metadata: Metadata = {
  title: pageTitle("Edit Kuis"),
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditQuizPage({ params }: Props) {
  await assertTutorOrAdmin();

  const { id } = await params;

  const [template, allCourses] = await Promise.all([
    db
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.id, id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db.select({ id: courses.id, title: courses.title }).from(courses),
  ]);

  if (!template) {
    notFound();
  }

  const rawRules = typeof template.selectionRules === "string"
    ? JSON.parse(template.selectionRules)
    : template.selectionRules as Record<string, any>;

  const initialData: InitialQuizData = {
    id: template.id,
    courseId: template.courseId,
    title: template.title,
    category: template.category,
    visibility: template.visibility,
    status: template.status,
    manualStatus: template.manualStatus,
    timeLimitSeconds: template.timeLimitSeconds,
    maxAttempts: template.maxAttempts,
    openAt: template.openAt,
    closeAt: template.closeAt,
    showDiscussion: template.showDiscussion,
    selectionRules: {
      tags: rawRules?.tags ?? [],
      count: rawRules?.count ?? 10,
      fixedQuestionIds: rawRules?.fixedQuestionIds ?? [],
      difficulty_proportions: rawRules?.difficulty_proportions ?? { easy: 3, medium: 5, hard: 2 },
      canGoBack: rawRules?.canGoBack ?? true,
      requireAllAnswered: rawRules?.requireAllAnswered ?? false,
      explanationRelease: rawRules?.explanationRelease ?? (template.showDiscussion === false ? "never" : "after_close"),
      perQuestionTimerEnabled: rawRules?.perQuestionTimerEnabled ?? false,
      perQuestionTimers: rawRules?.perQuestionTimers ?? {},
      defaultQuestionTimerSeconds: rawRules?.defaultQuestionTimerSeconds ?? 60,
      shuffleQuestions: rawRules?.shuffleQuestions ?? false,
      shuffleOptions: rawRules?.shuffleOptions ?? false,
      showScoreImmediate: rawRules?.showScoreImmediate ?? true,
      passingScore: rawRules?.passingScore ?? 70,
    },
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={NotebookPen}
        title={`Edit Kuis: ${template.title}`}
        backHref="/admin/quizzes"
        backLabel="Kembali ke Daftar Kuis"
      />
      <QuizForm
        initialData={initialData}
        courses={allCourses}
        isEdit={true}
      />
    </div>
  );
}
