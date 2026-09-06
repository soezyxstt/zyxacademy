"use client";

import { useUrlTab } from "@/hooks/use-url-tab";
import {
  GraduationCap,
  FileText,
} from "lucide-react";
import { CoursesDashboard, type CourseWithStats } from "@/components/admin/courses-dashboard";
import { PDFMaterialsTab } from "@/components/admin/pdf-materials-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="courses">
          <GraduationCap className="size-3.5" />
          <span>Direktori mata kuliah</span>
        </TabsTrigger>
        <TabsTrigger value="pdf-materials">
          <FileText className="size-3.5" />
          <span>Unggah PDF cepat</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="courses">
        <CoursesDashboard initialCourses={coursesList} />
      </TabsContent>

      <TabsContent value="pdf-materials">
        <PDFMaterialsTab
          courses={coursesList}
          chapters={chaptersList}
          initialMaterials={materialsList}
        />
      </TabsContent>
    </Tabs>
  );
}
