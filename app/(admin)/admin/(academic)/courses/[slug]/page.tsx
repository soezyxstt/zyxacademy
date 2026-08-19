import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { getCourseDetailData } from "../actions";
import { CourseDetailClient } from "@/components/admin/course-detail/course-detail-client";

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

  const data = await getCourseDetailData(slug);
  if (!data) {
    notFound();
  }

  return (
    <CourseDetailClient
      course={data.course}
      chapters={data.chapters}
      materials={data.materials}
      quizzes={data.quizzes as any}
      questions={data.questions as any}
      stats={data.stats}
      defaultTab={tab || "chapters"}
    />
  );
}
