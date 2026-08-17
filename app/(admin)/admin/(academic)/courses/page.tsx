import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  GraduationCap,
  FileText,
  Layers,
  HelpCircle,
  NotebookPen,
} from "lucide-react";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { getCoursesWithStats, getAllChapters, getUploadedMaterials } from "./actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatCard } from "@/components/admin/stat-card";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
import { BundleImporterTab } from "@/components/admin/bundle-importer-tab";
import { AssessmentBundleImporterTab } from "@/components/admin/assessment-bundle-importer-tab";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { env } from "@/lib/env";

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

  const [coursesList, chaptersList, materialsList] = await Promise.all([
    getCoursesWithStats(),
    getAllChapters(),
    getUploadedMaterials(),
  ]);
  const ideaBundleV2Enabled = env.FEATURE_IDEA_BUNDLE_V2 === "1";

  const totalQuizzes = coursesList.reduce((acc, c) => acc + c.quizCount, 0);

  return (
    <div className="space-y-8 font-sans">
      <AdminPageHeader
        icon={GraduationCap}
        title="Manajemen Mata Kuliah"
      />

      {/* Top Level Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Mata Kuliah"
          value={coursesList.length}
          caption="Mata kuliah aktif di kurikulum"
          icon={GraduationCap}
          iconClassName="text-brand-primary"
        />
        <AdminStatCard
          label="Total Bab Silabus"
          value={chaptersList.length}
          caption="Bab dan modul terstruktur"
          icon={Layers}
          iconClassName="text-brand-primary"
        />
        <AdminStatCard
          label="Materi & Dokumen PDF"
          value={materialsList.length}
          caption="Materi bacaan dan latihan soal"
          icon={FileText}
          iconClassName="text-brand-secondary"
        />
        <AdminStatCard
          label="Total Kuis & Tryout"
          value={totalQuizzes}
          caption="Kuis aktif pada seluruh mata kuliah"
          icon={NotebookPen}
          iconClassName="text-status-info"
        />
      </div>

      <AdminTabs defaultValue="courses">
        <AdminTabsList>
          <AdminTabsTrigger value="courses" className="gap-1.5">
            <GraduationCap className="size-4" />
            Direktori Mata Kuliah ({coursesList.length})
          </AdminTabsTrigger>
          <AdminTabsTrigger value="pdf-materials" className="gap-1.5">
            <FileText className="size-4" />
            Unggah PDF Cepat
          </AdminTabsTrigger>
          {!ideaBundleV2Enabled && (
            <AdminTabsTrigger value="bundle-importer" className="gap-1.5">
              <Layers className="size-4" />
              Import Learning Bundle
            </AdminTabsTrigger>
          )}
          <AdminTabsTrigger value="assessment-bundle-importer" className="gap-1.5">
            <HelpCircle className="size-4" />
            Import Assessment Bundle
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="courses">
          <CoursesDashboard initialCourses={coursesList} />
        </AdminTabsContent>

        <AdminTabsContent value="pdf-materials">
          <PDFMaterialsTab
            courses={coursesList}
            chapters={chaptersList}
            initialMaterials={materialsList}
          />
        </AdminTabsContent>

        {!ideaBundleV2Enabled && (
          <AdminTabsContent value="bundle-importer">
            <BundleImporterTab />
          </AdminTabsContent>
        )}

        <AdminTabsContent value="assessment-bundle-importer">
          <AssessmentBundleImporterTab />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
