"use client";

import { useSearchParams, useRouter } from "next/navigation";
import {
  GraduationCap,
  FileText,
  Layers,
  HelpCircle,
} from "lucide-react";
import { CoursesDashboard, type CourseWithStats } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
import { BundleImporterTab } from "@/components/admin/bundle-importer-tab";
import { AssessmentBundleImporterTab } from "@/components/admin/assessment-bundle-importer-tab";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
};

type UploadedMaterial = {
  id: string;
  courseId: string;
  title: string;
  type: "materi_kelas" | "contoh_soal";
  fileUrl: string;
  chapterIds: any;
  createdAt: Date;
};

type Props = {
  coursesList: CourseWithStats[];
  chaptersList: Chapter[];
  materialsList: UploadedMaterial[];
  ideaBundleV2Enabled: boolean;
  defaultTab?: string;
};

export function CoursesPageTabs({
  coursesList,
  chaptersList,
  materialsList,
  ideaBundleV2Enabled,
  defaultTab = "courses",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || defaultTab;

  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", val);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <AdminTabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <AdminTabsList className="w-full flex flex-wrap justify-start gap-1 p-1 bg-muted/60 border border-border rounded-xl">
        <AdminTabsTrigger value="courses" className="gap-1.5 px-3 py-1.5 text-body-xs font-semibold rounded-lg">
          <GraduationCap className="size-3.5" />
          <span>Direktori Mata Kuliah ({coursesList.length})</span>
        </AdminTabsTrigger>
        <AdminTabsTrigger value="pdf-materials" className="gap-1.5 px-3 py-1.5 text-body-xs font-semibold rounded-lg">
          <FileText className="size-3.5" />
          <span>Unggah PDF Cepat ({materialsList.length})</span>
        </AdminTabsTrigger>
        {!ideaBundleV2Enabled && (
          <AdminTabsTrigger value="bundle-importer" className="gap-1.5 px-3 py-1.5 text-body-xs font-semibold rounded-lg">
            <Layers className="size-3.5" />
            <span>Import Learning Bundle</span>
          </AdminTabsTrigger>
        )}
        <AdminTabsTrigger value="assessment-bundle-importer" className="gap-1.5 px-3 py-1.5 text-body-xs font-semibold rounded-lg">
          <HelpCircle className="size-3.5" />
          <span>Import Assessment Bundle</span>
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
  );
}
