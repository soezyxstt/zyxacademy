import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NotebookPen } from "lucide-react";
import { QuizForm } from "../_components/quiz-form";

export const metadata: Metadata = {
  title: pageTitle("Buat Kuis"),
};

type Props = {
  searchParams: Promise<{ courseId?: string; tags?: string }>;
};

export default async function NewQuizPage({ searchParams }: Props) {
  await assertTutorOrAdmin();

  const { courseId: prefillCourseId, tags: prefillTags } = await searchParams;

  const allCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses);

  const initialData = {
    courseId: prefillCourseId && allCourses.some((c) => c.id === prefillCourseId)
      ? prefillCourseId
      : (allCourses[0]?.id || ""),
    title: "",
    category: "weekly" as const,
    visibility: "free" as const,
    status: "draft" as const,
    manualStatus: "scheduled" as const,
    timeLimitSeconds: 1800,
    maxAttempts: null,
    openAt: null,
    closeAt: null,
    showDiscussion: true,
    selectionRules: {
      tags: prefillTags ? prefillTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      count: 10,
      difficulty_proportions: { easy: 3, medium: 5, hard: 2 },
      canGoBack: true,
      requireAllAnswered: false,
      explanationRelease: "after_close" as const,
      perQuestionTimerEnabled: false,
      perQuestionTimers: {},
      defaultQuestionTimerSeconds: 60,
      shuffleQuestions: false,
      shuffleOptions: false,
      showScoreImmediate: true,
      passingScore: 70,
    },
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={NotebookPen}
        title="Buat Kuis"
        backHref="/admin/quizzes"
        backLabel="Kembali ke Daftar Kuis"
      />
      <QuizForm
        initialData={initialData}
        courses={allCourses}
        isEdit={false}
      />
    </div>
  );
}
