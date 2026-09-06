"use client";

import Link from "next/link";
import { useUrlTab } from "@/hooks/use-url-tab";
import {
  GraduationCap,
  Layers,
  FileText,
  NotebookPen,
  Library,
  BarChart3,
  Settings,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { ChaptersTab } from "./chapters-tab";
import { MaterialsTab } from "./materials-tab";
import { QuizzesTab, type CourseQuiz } from "./quizzes-tab";
import { QuestionsTab } from "./questions-tab";
import { AnalyticsTab } from "./analytics-tab";
import { SettingsTab } from "./settings-tab";

type Course = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  createdAt?: Date;
};

type Chapter = {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  description?: string | null;
  status?: string | null;
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

type QuestionItem = {
  id: string;
  courseId: string;
  chapterId?: string | null;
  prompt: string;
  options: unknown;
  correctIndices: unknown;
  difficulty: "easy" | "medium" | "hard";
  questionType: string;
  explanation?: string | null;
  tags?: unknown;
  createdAt: Date;
};

type CourseStats = {
  totalChapters: number;
  totalMaterials: number;
  totalQuizzes: number;
  totalQuestions: number;
  totalAttempts: number;
  avgScore: number;
  passRate: number;
};

type Props = {
  course: Course;
  chapters: Chapter[];
  materials: UploadedMaterial[];
  quizzes: CourseQuiz[];
  questions: QuestionItem[];
  stats: CourseStats;
  defaultTab?: string;
};

export function CourseDetailClient({
  course,
  chapters,
  materials,
  quizzes,
  questions,
  stats,
  defaultTab = "chapters",
}: Props) {
  const [activeTab, handleTabChange] = useUrlTab("tab", defaultTab);

  return (
    <div className="space-y-4 font-sans">
      {/* Top Header */}
      <AdminPageHeader
        icon={GraduationCap}
        title={course.title}
        backHref="/admin/courses"
        backLabel="Kembali ke Daftar Mata Kuliah"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-body-xs rounded-md">
              {course.id}
            </Badge>
            <Badge variant="secondary" className="text-body-xs rounded-md">
              {course.category}
            </Badge>
            <Link href={`/courses/${course.id}`} target="_blank">
              <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-body-xs h-8">
                <span>Lihat sebagai Siswa</span>
                <ExternalLink className="size-3.5" />
              </Button>
            </Link>
          </div>
        }
      />

      {/* Description Snippet if exists */}
      {course.description && (
        <div className="rounded-xl border border-border/80 bg-card/60 p-3.5 text-body-xs text-muted-foreground">
          {course.description}
        </div>
      )}

      {/* Tabs Navigation and Contents */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="chapters">
            <Layers className="size-3.5" />
            <span>Bab</span>
          </TabsTrigger>

          <TabsTrigger value="materials">
            <FileText className="size-3.5" />
            <span>Dokumen</span>
          </TabsTrigger>

          <TabsTrigger value="quizzes">
            <NotebookPen className="size-3.5" />
            <span>Kuis</span>
          </TabsTrigger>

          <TabsTrigger value="questions">
            <Library className="size-3.5" />
            <span>Soal</span>
          </TabsTrigger>

          <TabsTrigger value="analytics">
            <BarChart3 className="size-3.5" />
            <span>Hasil</span>
          </TabsTrigger>

          <TabsTrigger value="settings">
            <Settings className="size-3.5" />
            <span>Pengaturan</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chapters">
          <ChaptersTab
            courseId={course.id}
            courseTitle={course.title}
            initialChapters={chapters}
            materials={materials}
            questions={questions}
          />
        </TabsContent>

        <TabsContent value="materials">
          <MaterialsTab
            courseId={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialMaterials={materials}
          />
        </TabsContent>

        <TabsContent value="quizzes">
          <QuizzesTab
            courseId={course.id}
            courseSlug={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialQuizzes={quizzes}
          />
        </TabsContent>


        <TabsContent value="questions">
          <QuestionsTab
            courseId={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialQuestions={questions}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab
            courseId={course.id}
            courseTitle={course.title}
            quizzes={quizzes}
            stats={{
              totalAttempts: stats.totalAttempts,
              avgScore: stats.avgScore,
              passRate: stats.passRate,
            }}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab course={course} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
