import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { QuizzesTab } from "@/components/admin/course-detail/quizzes-tab";
import { getCourseDetailData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: pageTitle("Kuis Mata Kuliah"),
};

export default async function AdminCourseQuizzesPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const data = await getCourseDetailData(slug);
  if (!data) notFound();

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={data.course} />
      <QuizzesTab
        courseId={data.course.id}
        courseSlug={slug}
        courseTitle={data.course.title}
        chapters={data.chapters}
        initialQuizzes={data.quizzes as any}
      />
    </div>
  );
}
