import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { FlashcardsTab } from "@/components/admin/course-detail/flashcards-tab";
import { getCourseDetailData } from "../../actions";
import { getCourseFlashcardsData } from "../../flashcard-actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await getCourseDetailData(slug);
    if (!data?.course) {
      return { title: pageTitle("Flashcard, Mata Kuliah Tidak Ditemukan") };
    }
    return {
      title: pageTitle(`Flashcard, ${data.course.title}`),
      description: `Kelola set dan kartu flashcard untuk mata kuliah ${data.course.title}.`,
    };
  } catch {
    return { title: pageTitle("Flashcard Mata Kuliah") };
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
