import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { CourseDetailHeader } from "@/components/admin/course-detail/course-detail-header";
import { SettingsTab } from "@/components/admin/course-detail/settings-tab";
import { getCourseSettingsData } from "../../actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.settingsTitle")) };
}

export default async function AdminCourseSettingsPage({ params }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/admin");
  }

  const { slug } = await params;
  const course = await getCourseSettingsData(slug);
  if (!course) notFound();

  return (
    <div className="space-y-4 font-sans">
      <CourseDetailHeader course={course} />
      <SettingsTab course={course} />
    </div>
  );
}
