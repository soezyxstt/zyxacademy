import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap, FileText, Layers, HelpCircle } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { getCourses, getAllChapters, getUploadedMaterials } from "./actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
import { BundleImporterTab } from "@/components/admin/bundle-importer-tab";
import { AssessmentBundleImporterTab } from "@/components/admin/assessment-bundle-importer-tab";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: pageTitle("Kelola Mata Kuliah"),
  description: "Daftar dan kelola mata kuliah kurikulum Zyx Academy.",
};

export default async function AdminCoursesPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const [coursesList, chaptersList, materialsList] = await Promise.all([
    getCourses(),
    getAllChapters(),
    getUploadedMaterials(),
  ]);
  const ideaBundleV2Enabled = env.FEATURE_IDEA_BUNDLE_V2 === "1";

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={GraduationCap}
        title="Manajemen Mata Kuliah"
        description="Kelola data mata kuliah dan silabus kurikulum."
      />
      <AdminTabs defaultValue="courses">
        <AdminTabsList>
          <AdminTabsTrigger value="courses" className="gap-1.5">
            <GraduationCap className="size-4" />
            Kelola Mata Kuliah
          </AdminTabsTrigger>
          <AdminTabsTrigger value="pdf-materials" className="gap-1.5">
            <FileText className="size-4" />
            Unggah PDF (Materi & Soal)
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
