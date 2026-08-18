"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Layers,
  FileText,
  NotebookPen,
  Library,
  BarChart3,
  Settings,
  ExternalLink,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatCard } from "@/components/admin/stat-card";
import {
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
} from "@/components/admin/tabs";

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
  type: "materi_kelas" | "contoh_soal";
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
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="space-y-8 font-sans">
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
              <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-body-xs">
                <span>Lihat sebagai Siswa</span>
                <ExternalLink className="size-3.5" />
              </Button>
            </Link>
          </div>
        }
      />

      {/* Description Snippet if exists */}
      {course.description && (
        <div className="rounded-xl border border-border/80 bg-card/60 p-4 text-body-sm text-muted-foreground">
          {course.description}
        </div>
      )}

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <AdminStatCard
          label="Silabus & Bab"
          value={stats.totalChapters}
          caption="Bab aktif terstruktur"
          icon={Layers}
          iconClassName="text-brand-primary"
        />
        <AdminStatCard
          label="Dokumen PDF"
          value={stats.totalMaterials}
          caption="Materi kelas & soal"
          icon={FileText}
          iconClassName="text-brand-secondary"
        />
        <AdminStatCard
          label="Kuis & Tryout"
          value={stats.totalQuizzes}
          caption="Kuis aktif & draft"
          icon={NotebookPen}
          iconClassName="text-brand-primary"
        />
        <AdminStatCard
          label="Bank Soal"
          value={stats.totalQuestions}
          caption="Butir soal kurasi"
          icon={Library}
          iconClassName="text-status-info"
        />
        <AdminStatCard
          label="Pengerjaan Siswa"
          value={stats.totalAttempts}
          caption={`Rata-rata: ${stats.avgScore}/100`}
          icon={TrendingUp}
          iconClassName="text-status-success"
        />
      </div>

      {/* Tabs Navigation and Contents */}
      <AdminTabs value={activeTab} onValueChange={setActiveTab}>
        <AdminTabsList className="w-full flex flex-wrap justify-start gap-1 p-1 bg-muted/60 border border-border rounded-xl">
          <AdminTabsTrigger value="chapters" className="gap-1.5 rounded-lg">
            <Layers className="size-4" />
            <span>Silabus &amp; Bab ({chapters.length})</span>
          </AdminTabsTrigger>

          <AdminTabsTrigger value="materials" className="gap-1.5 rounded-lg">
            <FileText className="size-4" />
            <span>Materi &amp; PDF ({materials.length})</span>
          </AdminTabsTrigger>

          <AdminTabsTrigger value="quizzes" className="gap-1.5 rounded-lg">
            <NotebookPen className="size-4" />
            <span>Kuis &amp; Asesmen ({quizzes.length})</span>
          </AdminTabsTrigger>

          <AdminTabsTrigger value="questions" className="gap-1.5 rounded-lg">
            <Library className="size-4" />
            <span>Bank Soal ({questions.length})</span>
          </AdminTabsTrigger>

          <AdminTabsTrigger value="analytics" className="gap-1.5 rounded-lg">
            <BarChart3 className="size-4" />
            <span>Analisis &amp; Hasil</span>
          </AdminTabsTrigger>

          <AdminTabsTrigger value="settings" className="gap-1.5 rounded-lg">
            <Settings className="size-4" />
            <span>Pengaturan</span>
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="chapters">
          <ChaptersTab
            courseId={course.id}
            courseTitle={course.title}
            initialChapters={chapters}
          />
        </AdminTabsContent>

        <AdminTabsContent value="materials">
          <MaterialsTab
            courseId={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialMaterials={materials}
          />
        </AdminTabsContent>

        <AdminTabsContent value="quizzes">
          <QuizzesTab
            courseId={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialQuizzes={quizzes}
          />
        </AdminTabsContent>

        <AdminTabsContent value="questions">
          <QuestionsTab
            courseId={course.id}
            courseTitle={course.title}
            chapters={chapters}
            initialQuestions={questions}
          />
        </AdminTabsContent>

        <AdminTabsContent value="analytics">
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
        </AdminTabsContent>

        <AdminTabsContent value="settings">
          <SettingsTab course={course} />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
