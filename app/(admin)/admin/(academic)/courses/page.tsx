import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getCoursesWithStats } from "./actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAcademic");
  return { title: pageTitle(t("metadata.pages.coursesTitle")), description: t("metadata.pages.coursesDescription") };
}

export default async function AdminCoursesPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const coursesList = await getCoursesWithStats();
  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        icon={GraduationCap}
        title={<TranslatedText namespace="adminAcademic" messageKey="courses.pageTitle" as="span" />}
      />

      <CoursesDashboard initialCourses={coursesList} />
    </div>
  );
}
