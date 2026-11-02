import { notFound } from "next/navigation";
import { BarChart3, BookOpen, FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import { ChapterOutline } from "@/components/course/chapter-outline";
import {
  CourseOverviewContentSkeleton,
  CourseMaterialListSkeleton,
  MaterialReaderContentSkeleton,
  CourseProgressContentSkeleton,
} from "@/components/course/course-skeletons";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import type { CourseOverviewActionCard, CourseAttentionData } from "@/types/course-learning";
import type { ChapterOutlineItem } from "@/lib/course-utils";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

export const dynamic = "force-dynamic";

const mockReadingAction: CourseOverviewActionCard = {
  tag: "DOKUMEN",
  title: "Sistem Bilangan Real",
  meta: "3 materi",
  actionLabel: "Mulai membaca",
  href: "/courses/ma1101/material",
};

const mockQuizAction: CourseOverviewActionCard = {
  tag: "KUIS",
  title: "Kuis Bab 1: Pertaksamaan",
  meta: "10 soal",
  actionLabel: "Mulai kuis",
  href: "/courses/ma1101/quiz/quiz-1",
};

const mockScheduleAction: CourseOverviewActionCard = {
  tag: "JADWAL",
  title: "Tutorial Pekanan Kalkulus",
  meta: "Pekan ini",
  actionLabel: "Lihat jadwal",
  href: "/dashboard/schedule?course=ma1101",
};

const mockAttention: CourseAttentionData = {
  items: [
    {
      kind: "flashcard",
      label: "4 kartu flashcard perlu diulang hari ini",
      actionLabel: "Ulangi sekarang",
      href: "/courses/ma1101/flashcard",
    },
  ],
};

const mockChapters: ChapterOutlineItem[] = [
  {
    id: "ch-1",
    title: "Bab 1: Sistem Bilangan Real dan Pertaksamaan",
    orderIndex: 1,
    canonicalId: null,
    legacyChapterId: null,
    materialId: "mat-1",
    hasMaterial: true,
    completed: true,
    completionPercent: 100,
  },
  {
    id: "ch-2",
    title: "Bab 2: Fungsi dan Grafik",
    orderIndex: 2,
    canonicalId: null,
    legacyChapterId: null,
    materialId: "mat-2",
    hasMaterial: true,
    completed: false,
    completionPercent: 40,
  },
];

const mockMaterials: CourseMaterial[] = [
  {
    id: "mat-1",
    courseId: "ma1101",
    title: "Sifat-sifat Aljabar Bilangan Real",
    kind: "article",
    docCategory: "materi",
    tabGroup: "materi",
    fileSize: "12 menit baca",
    completed: true,
    isPastYear: false,
    isPreview: true,
    href: "/courses/ma1101/material/mat-1",
    locked: false,
  },
  {
    id: "mat-2",
    courseId: "ma1101",
    title: "Diktat: Pertaksamaan dan Nilai Mutlak",
    kind: "pdf",
    docCategory: "diktat",
    tabGroup: "diktat",
    fileSize: "PDF Diktat",
    completed: false,
    isPastYear: false,
    isPreview: true,
    href: "/courses/ma1101/material/mat-2",
    locked: false,
  },
  {
    id: "mat-3",
    courseId: "ma1101",
    title: "Latihan Soal Ujian Tengah Semester",
    kind: "quiz",
    docCategory: "soal",
    tabGroup: "bank_soal",
    fileSize: "15 Soal \u00b7 Kuis Interaktif",
    completed: false,
    isPastYear: true,
    isPreview: false,
    href: "/courses/ma1101/quiz/quiz-uts",
    locked: false,
  },
];

const mockMaterialsLocked: CourseMaterial[] = [
  {
    id: "mat-1",
    courseId: "ma1101",
    title: "Sifat-sifat Aljabar Bilangan Real",
    kind: "article",
    docCategory: "materi",
    tabGroup: "materi",
    fileSize: "12 menit baca",
    completed: true,
    isPastYear: false,
    isPreview: true,
    href: "/courses/ma1101/material/mat-1",
    locked: false,
  },
  {
    id: "mat-2",
    courseId: "ma1101",
    title: "Diktat: Pertaksamaan dan Nilai Mutlak",
    kind: "pdf",
    docCategory: "diktat",
    tabGroup: "diktat",
    fileSize: "PDF Diktat",
    completed: false,
    isPastYear: false,
    isPreview: false,
    locked: true,
  },
  {
    id: "mat-3",
    courseId: "ma1101",
    title: "Latihan Soal Ujian Tengah Semester",
    kind: "quiz",
    docCategory: "soal",
    tabGroup: "bank_soal",
    fileSize: "15 Soal \u00b7 Kuis Interaktif",
    completed: false,
    isPastYear: true,
    isPreview: false,
    locked: true,
  },
];

const mockDocumentChapters = [
  { id: "ch-1", title: "Bab 1: Sistem Bilangan Real", orderIndex: 1, canonicalId: null, legacyChapterId: null },
  { id: "ch-2", title: "Bab 2: Fungsi dan Grafik", orderIndex: 2, canonicalId: null, legacyChapterId: null },
];

export default async function StudentNavigationVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state = "overview" } = await searchParams;

  return (
    <div data-testid="student-nav-fixture-root" className="min-h-screen bg-background text-foreground">
      {state === "overview-loading" && (
        <div data-testid="state-overview-loading">
          <CoursePageShell title="Matematika I (MA1101)" icon={BookOpen} maxWidth="7xl">
            <CourseOverviewContentSkeleton />
          </CoursePageShell>
        </div>
      )}

      {state === "progress-loading" && (
        <div data-testid="state-progress-loading">
          <CoursePageShell title="Perkembangan Belajar: Matematika I (MA1101)" icon={BarChart3}>
            <CourseProgressContentSkeleton />
          </CoursePageShell>
        </div>
      )}

      {state === "material-loading" && (
        <div data-testid="state-material-loading">
          <CoursePageShell title="Materi Belajar: Matematika I (MA1101)" icon={FileText}>
            <CourseMaterialListSkeleton />
          </CoursePageShell>
        </div>
      )}

      {state === "reader-loading" && (
        <div data-testid="state-reader-loading">
          <MaterialReaderContentSkeleton courseId="ma1101" courseTitle="Matematika I (MA1101)" />
        </div>
      )}

      {state === "overview" && (
        <div data-testid="state-overview">
          <CoursePageShell title="Matematika I (MA1101)" icon={BookOpen} maxWidth="7xl">
            <CoursePrimaryActions
              reading={mockReadingAction}
              quiz={mockQuizAction}
              schedule={mockScheduleAction}
              className="mb-6"
            />
            <CourseAttentionStrip
              attention={mockAttention}
              className="mb-6"
            />
            <div className="mb-6">
              <ChapterOutline courseId="ma1101" chapters={mockChapters} isEnrolled={true} />
            </div>
          </CoursePageShell>
        </div>
      )}

      {state === "material" && (
        <div data-testid="state-material">
          <CoursePageShell title="Materi Belajar: Matematika I (MA1101)" icon={FileText}>
            <CourseDocumentsClient
              courseId="ma1101"
              courseTitle="Matematika I"
              materials={mockMaterials}
              chapters={mockDocumentChapters}
              accessTier="standard"
              lockedMaterialCount={0}
            />
          </CoursePageShell>
        </div>
      )}

      {state === "material-empty" && (
        <div data-testid="state-material-empty">
          <CoursePageShell title="Materi Belajar: Matematika I (MA1101)" icon={FileText}>
            <CourseDocumentsClient
              courseId="ma1101"
              courseTitle="Matematika I"
              materials={[]}
              chapters={mockDocumentChapters}
              accessTier="standard"
              lockedMaterialCount={0}
            />
          </CoursePageShell>
        </div>
      )}

      {state === "locked" && (
        <div data-testid="state-locked">
          <CoursePageShell title="Materi Belajar: Matematika I (MA1101)" icon={FileText}>
            <CourseDocumentsClient
              courseId="ma1101"
              courseTitle="Matematika I"
              materials={mockMaterialsLocked}
              chapters={mockDocumentChapters}
              accessTier="free"
              lockedMaterialCount={2}
            />
          </CoursePageShell>
        </div>
      )}
    </div>
  );
}
