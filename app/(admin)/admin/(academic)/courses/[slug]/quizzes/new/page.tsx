import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { QuizForm } from "@/app/(admin)/admin/(eval)/quizzes/_components/quiz-form";
import { getCourseDetailData } from "../../../actions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tags?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug } = await params;
  const course = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, slug))
    .limit(1)
    .then((r) => r[0]);

  if (!course) {
    return { title: pageTitle(t("metadata.pages.newQuizTitle")) };
  }

  return {
    title: pageTitle(t("metadata.pages.newQuizCourseTitle", { course: course.title })),
  };
}

export default async function NewCourseQuizPage({ params, searchParams }: Props) {
  await assertAdmin();

  const { slug } = await params;
  const { tags: prefillTags } = await searchParams;

  const [courseData, allCourses] = await Promise.all([
    getCourseDetailData(slug),
    db.select({ id: courses.id, title: courses.title }).from(courses),
  ]);

  if (!courseData) {
    notFound();
  }

  const course = courseData.course;

  const initialData = {
    courseId: course.id,
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
    <QuizForm
      initialData={initialData}
      courses={allCourses}
      isEdit={false}
      hideCourseSelect={true}
      courseTitle={course.title}
      courseSlug={course.id}
      backHref={`/admin/courses/${encodeURIComponent(slug)}/quizzes`}
      backLabel={`Kembali ke ${course.title}`}
      returnUrl={`/admin/courses/${encodeURIComponent(slug)}/quizzes`}
    />
  );
}
