import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { courses, quizTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { QuizForm, type InitialQuizData } from "@/app/(admin)/admin/(eval)/quizzes/_components/quiz-form";
import { getCourseDetailData } from "../../../../actions";

type Props = {
  params: Promise<{ slug: string; id: string }>;
  searchParams?: Promise<{ returnUrl?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, id } = await params;
  const [template, course] = await Promise.all([
    db
      .select({ title: quizTemplates.title })
      .from(quizTemplates)
      .where(eq(quizTemplates.id, id))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, slug))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  if (!template || !course) {
    return { title: pageTitle("Edit Kuis") };
  }

  return {
    title: pageTitle(`Edit ${template.title} - ${course.title}`),
  };
}

export default async function EditCourseQuizPage({ params, searchParams }: Props) {
  await assertAdmin();

  const { slug, id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { returnUrl } = resolvedSearchParams;

  const [courseData, template, allCourses] = await Promise.all([
    getCourseDetailData(slug),
    db
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.id, id))
      .limit(1)
      .then((r) => r[0] ?? null),
    db.select({ id: courses.id, title: courses.title }).from(courses),
  ]);

  if (!courseData || !template || !courseData.quizzes.some((quiz) => quiz.id === template.id)) {
    notFound();
  }

  const course = courseData.course;

  const rawRules =
    typeof template.selectionRules === "string"
      ? JSON.parse(template.selectionRules)
      : (template.selectionRules as Record<string, any>) || {};

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
      explanationRelease:
        rawRules?.explanationRelease ??
        (template.showDiscussion === false ? "never" : "after_close"),
      perQuestionTimerEnabled: rawRules?.perQuestionTimerEnabled ?? false,
      perQuestionTimers: rawRules?.perQuestionTimers ?? {},
      defaultQuestionTimerSeconds: rawRules?.defaultQuestionTimerSeconds ?? 60,
      shuffleQuestions: rawRules?.shuffleQuestions ?? false,
      shuffleOptions: rawRules?.shuffleOptions ?? false,
      showScoreImmediate: rawRules?.showScoreImmediate ?? true,
      passingScore: rawRules?.passingScore ?? 70,
    },
  };

  const backUrl = returnUrl || `/admin/courses/${encodeURIComponent(slug)}/quizzes`;

  return (
    <QuizForm
      initialData={initialData}
      courses={allCourses}
      isEdit={true}
      hideCourseSelect={true}
      courseTitle={course.title}
      courseSlug={course.id}
      backHref={backUrl}
      backLabel={`Kembali ke ${course.title}`}
      returnUrl={backUrl}
    />
  );
}
