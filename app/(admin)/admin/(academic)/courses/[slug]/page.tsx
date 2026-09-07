import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getCourseDetailData } from "../actions";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { ChaptersTab } from "@/components/admin/course-detail/chapters-tab";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await getCourseDetailData(slug);
    if (!data?.course) {
      return { title: pageTitle("Mata Kuliah Tidak Ditemukan") };
    }
    return {
      title: pageTitle(`Kelola ${data.course.title}`),
      description: `Panel manajemen kurikulum, materi, kuis, dan evaluasi mata kuliah ${data.course.title}.`,
    };
  } catch {
    return { title: pageTitle("Kelola Mata Kuliah") };
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
