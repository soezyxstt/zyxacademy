import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getCoursesWithStats } from "./actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";

export const metadata: Metadata = {
  title: pageTitle("Manajemen Mata Kuliah"),
  description: "Daftar dan kelola mata kuliah kurikulum Zyx Academy.",
};

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
        title="Manajemen Mata Kuliah"
      />

      <CoursesDashboard initialCourses={coursesList} />
    </div>
  );
}
