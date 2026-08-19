import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { getCoursesWithStats, getAllChapters, getUploadedMaterials } from "./actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CoursesPageTabs } from "@/components/admin/courses-page-tabs";

export const metadata: Metadata = {
  title: pageTitle("Manajemen Mata Kuliah"),
  description: "Daftar dan kelola mata kuliah kurikulum Zyx Academy.",
};

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AdminCoursesPage({ searchParams }: Props) {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const { tab } = await searchParams;

  const [coursesList, chaptersList, materialsList] = await Promise.all([
    getCoursesWithStats(),
    getAllChapters(),
    getUploadedMaterials(),
  ]);
  const ideaBundleV2Enabled = true;

  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        icon={GraduationCap}
        title="Manajemen Mata Kuliah"
      />

      <CoursesPageTabs
        coursesList={coursesList}
        chaptersList={chaptersList}
        materialsList={materialsList}
        ideaBundleV2Enabled={ideaBundleV2Enabled}
        defaultTab={tab || "courses"}
      />
    </div>
  );
}
