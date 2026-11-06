import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getCourseDetailData } from "../actions";
import { getCourseTitleOnly } from "./metadata";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { ChaptersTab } from "@/components/admin/course-detail/chapters-tab";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug } = await params;
  try {
    const course = await getCourseTitleOnly(slug);
    if (!course) {
      return { title: pageTitle(t("metadata.pages.courseNotFound")) };
    }
    return {
      title: pageTitle(t("metadata.pages.manageCourseTitle", { course: course.title })),
      description: t("metadata.pages.manageCourseDescription", { course: course.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.manageCourseFallbackTitle")) };
  }
}

export default async function AdminCourseDetailPage({
  params,
  searchParams,
}: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const { tab } = await searchParams;

  const legacyTabRoutes: Record<string, string> = {
    materials: "documents",
    quizzes: "quizzes",
    questions: "questions",
    flashcards: "flashcards",
    analytics: "results",
    settings: "settings",
  };
  const legacyTarget = tab ? legacyTabRoutes[tab] : undefined;
  if (legacyTarget) {
    redirect(`/admin/courses/${encodeURIComponent(slug)}/${legacyTarget}`);
  }

  const data = await getCourseDetailData(slug);
  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={data.course} />
      <ChaptersTab
        courseId={data.course.id}
        courseTitle={data.course.title}
        initialChapters={data.chapters}
        materials={data.materials}
        questions={data.questions as any}
      />
    </div>
  );
}
