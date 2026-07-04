import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap, FileText, Layers, HelpCircle } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { getCourses, getAllChapters, getUploadedMaterials } from "./actions";
import { CoursesDashboard } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
import { BundleImporterTab } from "@/components/admin/bundle-importer-tab";
import { AssessmentBundleImporterTab } from "@/components/admin/assessment-bundle-importer-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Manajemen Mata Kuliah</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola data mata kuliah dan silabus kurikulum.
        </p>
      </div>
      <Tabs defaultValue="courses" className="space-y-6">
        <TabsList className="bg-muted p-1 rounded-xl w-fit flex gap-1">
          <TabsTrigger value="courses" className="rounded-lg font-semibold flex items-center gap-1.5 px-4 py-2">
            <GraduationCap className="size-4" />
            Kelola Mata Kuliah
          </TabsTrigger>
          <TabsTrigger value="pdf-materials" className="rounded-lg font-semibold flex items-center gap-1.5 px-4 py-2">
            <FileText className="size-4" />
            Unggah PDF (Materi & Soal)
          </TabsTrigger>
          <TabsTrigger value="bundle-importer" className="rounded-lg font-semibold flex items-center gap-1.5 px-4 py-2">
            <Layers className="size-4" />
            Import Learning Bundle
          </TabsTrigger>
          <TabsTrigger value="assessment-bundle-importer" className="rounded-lg font-semibold flex items-center gap-1.5 px-4 py-2">
            <HelpCircle className="size-4" />
            Import Assessment Bundle
          </TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="outline-hidden">
          <CoursesDashboard initialCourses={coursesList} />
        </TabsContent>

        <TabsContent value="pdf-materials" className="outline-hidden">
          <PDFMaterialsTab
            courses={coursesList}
            chapters={chaptersList}
            initialMaterials={materialsList}
          />
        </TabsContent>

        <TabsContent value="bundle-importer" className="outline-hidden">
          <BundleImporterTab />
        </TabsContent>

        <TabsContent value="assessment-bundle-importer" className="outline-hidden">
          <AssessmentBundleImporterTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}