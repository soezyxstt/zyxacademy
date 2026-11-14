import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { QuestionsTab } from "@/components/admin/course-detail/questions-tab";
import { getCourseDetailData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.questionsTitle")) };
}

export default async function AdminCourseQuestionsPage({ params }: Props) {
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
      <QuestionsTab
        courseId={data.course.id}
        courseTitle={data.course.title}
        chapters={data.chapters}
        initialQuestions={data.questions as any}
      />
    </div>
  );
}
