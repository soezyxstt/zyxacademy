"use client";

import { useUrlTab } from "@/hooks/use-url-tab";
import {
  GraduationCap,
  FileText,
} from "lucide-react";
import { CoursesDashboard, type CourseWithStats } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
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
  type: string;
  subcategory?: string | null;
  year?: number | null;
  fileUrl: string;
  chapterIds: any;
  createdAt: Date;
};

type Props = {
  coursesList: CourseWithStats[];
  chaptersList: Chapter[];
  materialsList: UploadedMaterial[];
  defaultTab?: string;
};

export function CoursesPageTabs({
  coursesList,
  chaptersList,
  materialsList,
  defaultTab = "courses",
}: Props) {
  const [activeTab, handleTabChange] = useUrlTab("tab", defaultTab);

  return (
    <AdminTabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <AdminTabsList className="w-full flex flex-wrap justify-start gap-1 p-1 bg-muted/60 border border-border rounded-xl">
        <AdminTabsTrigger value="courses" className="gap-1.5 px-3 py-1.5 font-semibold rounded-lg">
          <GraduationCap className="size-3.5" />
          <span>Direktori Mata Kuliah ({coursesList.length})</span>
        </AdminTabsTrigger>
        <AdminTabsTrigger value="pdf-materials" className="gap-1.5 px-3 py-1.5 font-semibold rounded-lg">
          <FileText className="size-3.5" />
          <span>Unggah PDF Cepat ({materialsList.length})</span>
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
    </AdminTabs>
  );
}
