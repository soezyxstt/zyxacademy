import { notFound } from "next/navigation";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { TryoutForm } from "@/components/course/tryout-form";
import { TryoutsClient } from "@/app/(tutor)/tutor/[courseId]/tryouts/tryouts-client";
import type { ExamFixture } from "@/lib/student-course-fixtures";

export const dynamic = "force-dynamic";

const course = { id: "ki1101", title: "Kimia Dasar I", category: "TPB" };
const exam = {
  id: "visual-tryout",
  courseId: course.id,
  title: "Tryout UTS Kimia Dasar I",
  type: "tryout" as const,
  status: "draft" as const,
  settings: { timeLimitMinutes: 90, maxAttempts: 2 },
  openAt: null,
  closeAt: null,
};
const essay = {
  id: "visual-question-1",
  examId: exam.id,
  type: "essay",
  content: {
    prompt: "Hitung perubahan energi dalam reaksi, lalu jelaskan tanda kalor dan kerja.",
    acceptsFile: true,
    origin: "zyx_original",
  },
  order: 1,
};
const studentExam: ExamFixture = {
  ...exam,
  status: "published",
  questions: [
    {
      id: essay.id,
      order: 1,
      type: "essay",
      prompt: essay.content.prompt,
      acceptsFile: true,
      origin: "zyx_original",
    },
  ],
};

export default async function TryoutAuthoringVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;
  const emptyAdmin = view === "empty-admin";

  return view === "student" ? (
    <main id="main-content" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-4xl">
        <TryoutForm courseId={course.id} exam={studentExam} />
      </div>
    </main>
  ) : (
    <main id="main-content" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <CourseDetailHeader course={course} />
        <TryoutsClient
          courseId={course.id}
          initialTryouts={emptyAdmin ? [] : [exam]}
          initialQuestions={emptyAdmin ? [] : [essay]}
          questionBank={[
            {
              id: "visual-bank-question",
              prompt: "Tentukan pereaksi pembatas dan tunjukkan perhitungannya.",
              questionType: "essay",
              difficulty: "medium",
              origin: "zyx_original",
              sourceEventName: null,
            },
          ]}
        />
      </div>
    </main>
  );
}
