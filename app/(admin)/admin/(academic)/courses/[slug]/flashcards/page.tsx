import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { FlashcardsTab } from "@/components/admin/course-detail/flashcards-tab";
import { getCourseDetailData } from "../../actions";
import { getCourseFlashcardsData } from "../../flashcard-actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  const { slug } = await params;
  try {
    const data = await getCourseDetailData(slug);
    if (!data?.course) {
      return { title: pageTitle(t("metadata.pages.flashcardsNotFound")) };
    }
    return {
      title: pageTitle(t("metadata.pages.flashcardsCourseTitle", { course: data.course.title })),
      description: t("metadata.pages.flashcardsDescription", { course: data.course.title }),
    };
  } catch {
    return { title: pageTitle(t("metadata.pages.flashcardsFallbackTitle")) };
  }
}

export default async function AdminCourseFlashcardsPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const [courseData, flashcardData] = await Promise.all([
    getCourseDetailData(slug),
    getCourseFlashcardsData(slug),
  ]);

  if (!courseData || !flashcardData) {
    notFound();
  }

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={courseData.course} />
      <FlashcardsTab
        courseId={flashcardData.course.id}
        courseTitle={flashcardData.course.title}
        courseSlug={slug}
        chapters={flashcardData.chapters}
        initialSets={flashcardData.sets}
      />
    </div>
  );
}
