"use client";

import { useSearchParams } from "next/navigation";
import { Suspense} from "react";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseCatalogClient } from "@/app/(student)/courses/course-catalog-client";
import { QuizListClient } from "@/app/(student)/courses/[id]/quiz/quiz-list-client";
import { CourseVideosClient } from "@/components/course/video/course-videos-client";
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { CourseDocumentsClient } from "@/app/(student)/courses/[id]/material/course-documents-client";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import { AcademicSchedulesDashboard } from "@/components/admin/academic-schedules-dashboard";
import { Check, ChevronRight } from "lucide-react";


// --- Mock Data ---

const mockReadingAction = {
  title: "Materi belajar",
  subtitle: "5 dokumen tersedia",
  meta: "5 dokumen",
  href: "#materi",
  tag: "DOKUMEN" as const,
  actionLabel: "Mulai membaca",
};

const mockQuizAction = {
  title: "Latihan soal",
  subtitle: "8 kuis siap dikerjakan",
  meta: "8 kuis",
  href: "#kuis",
  tag: "KUIS" as const,
  actionLabel: "Mulai kuis",
};

const mockScheduleAction = {
  title: "Sesi tutorial",
  subtitle: "Jadwal pekan ini",
  meta: "Pekan ini",
  href: "#jadwal",
  tag: "JADWAL" as const,
  actionLabel: "Pilih sesi",
};

const mockCatalogGroups = [
  {
    jurusan: "TPB Bersama",
    isStudentMajor: true,
    courses: [
      {
        id: "ma1101",
        title: "Matematika I",
        category: "tpb",
        description: "Kalkulus diferensial dan integral fungsi satu variabel",
        materialsCount: 14,
        quizzesCount: 8,
        tryoutsCount: 2,
      },
      {
        id: "fi1101",
        title: "Fisika I",
        category: "tpb",
        description: "Kinematika, dinamika, usaha, energi, dan momentum",
        materialsCount: 12,
        quizzesCount: 6,
        tryoutsCount: 2,
      },
      {
        id: "ki1101",
        title: "Kimia I",
        category: "tpb",
        description: "Stoikiometri, struktur atom, termokimia, dan ikatan kimia",
        materialsCount: 10,
        quizzesCount: 5,
        tryoutsCount: 1,
      },
      {
        id: "bk1101",
        title: "Berpikir Komputasional",
        category: "tpb",
        description: "Algoritma, struktur data dasar, dan dekomposisi komputasi",
        materialsCount: 8,
        quizzesCount: 4,
        tryoutsCount: 1,
      },
    ],
  },
];

const mockQuizTemplates: any[] = [
  {
    id: "q-1",
    courseId: "ma1101",
    title: "Kuis 1 - Sistem Bilangan, Pertaksamaan, & Nilai Mutlak",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 20 },
  },
  {
    id: "q-2",
    courseId: "ma1101",
    title: "Kuis 2 - Fungsi Real & Operasi Aljabar",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 15 },
  },
  {
    id: "q-3",
    courseId: "ma1101",
    title: "Kuis 3 - Grafik Fungsi & Pergeseran",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 15 },
  },
  {
    id: "q-4",
    courseId: "ma1101",
    title: "Kuis 4 - Konsep Limit & Limit Sepihak",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 20 },
  },
  {
    id: "q-5",
    courseId: "ma1101",
    title: "Kuis 5 - Teorema Apit & Limit Trigonometri",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 20 },
  },
  {
    id: "q-6",
    courseId: "ma1101",
    title: "Kuis 6 - Kekontinuan Fungsi",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 15 },
  },
  {
    id: "q-7",
    courseId: "ma1101",
    title: "Kuis 7 - Definisi Turunan & Garis Singgung",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 20 },
  },
  {
    id: "q-8",
    courseId: "ma1101",
    title: "Kuis 8 - Aturan Rantai & Turunan Implisit",
    visibility: "free",
    openAt: null,
    closeAt: null,
    selectionRules: { count: 25 },
  },
];

const sampleVideoThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'><rect width='320' height='180' fill='%2318181b'/><rect x='10' y='10' width='300' height='160' rx='8' fill='%2327272a'/><circle cx='160' cy='90' r='24' fill='%232563eb' fill-opacity='0.25'/><polygon points='154,78 172,90 154,102' fill='%233b82f6'/><text x='160' y='140' font-family='sans-serif' font-size='12' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>PEMBAHASAN UTS</text></svg>";
const sampleDocThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='120' height='160' fill='%23f8fafc' rx='4'/><rect x='8' y='8' width='104' height='24' fill='%232563eb' rx='2'/><text x='60' y='24' font-family='sans-serif' font-size='8' font-weight='bold' fill='%23ffffff' text-anchor='middle'>MATEMATIKA I</text><line x1='12' y1='44' x2='80' y2='44' stroke='%23334155' stroke-width='3'/><line x1='12' y1='54' x2='108' y2='54' stroke='%2394a3b8' stroke-width='2'/><line x1='12' y1='62' x2='100' y2='62' stroke='%2394a3b8' stroke-width='2'/><line x1='12' y1='70' x2='90' y2='70' stroke='%2394a3b8' stroke-width='2'/><line x1='12' y1='78' x2='104' y2='78' stroke='%2394a3b8' stroke-width='2'/><rect x='12' y='94' width='96' height='40' fill='%23e2e8f0' rx='2'/><text x='60' y='118' font-family='sans-serif' font-size='7' fill='%23475569' text-anchor='middle'>SISTEM BILANGAN</text></svg>";

const mockVideos: any[] = [
  {
    id: "v-1",
    courseId: "ma1101",
    playlistId: "pl-1",
    title: "Bagian A - Soal 1 s.d. 5 (Sistem Bilangan & Limit)",
    videoUrl: "https://www.youtube.com/watch?v=example1",
    duration: 1534,
    fileSize: 49807360,
    thumbnailUrl: sampleVideoThumb,
    chapterTitle: "Bab 1 & 2",
    locked: false,
  },
  {
    id: "v-2",
    courseId: "ma1101",
    playlistId: "pl-1",
    title: "Bagian B - Soal Esai 1 & 2 (Turunan & Aplikasi)",
    videoUrl: "https://www.youtube.com/watch?v=example2",
    duration: 1845,
    fileSize: 54525952,
    thumbnailUrl: sampleVideoThumb,
    chapterTitle: "Bab 3",
    locked: false,
  },
  {
    id: "v-3",
    courseId: "ma1101",
    playlistId: "pl-1",
    title: "Bagian C - Soal Lanjutan & Aplikasi Ekstrim",
    videoUrl: "https://www.youtube.com/watch?v=example3",
    duration: 1210,
    fileSize: 39845888,
    thumbnailUrl: sampleVideoThumb,
    chapterTitle: "Bab 4",
    locked: false,
  },
];

const mockPlaylists: any[] = [
  {
    id: "pl-1",
    courseId: "ma1101",
    title: "Playlist 1: Pembahasan Soal UTS 2024",
    description: "Arsip lengkap pembahasan video UTS Matematika IA",
    videos: mockVideos,
  },
];

const mockMaterials: any[] = [
  {
    id: "m-1",
    courseId: "ma1101",
    title: "Matematika I Bab 1: Sistem Bilangan, Pertaksamaan, & Geometri Analitik",
    docCategory: "materi",
    kind: "article",
    fileSize: "27 menit baca",
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "m-2",
    courseId: "ma1101",
    title: "Matematika I Bab 2: Fungsi Real & Grafiknya",
    docCategory: "materi",
    kind: "article",
    fileSize: "18 menit baca",
    chapterId: "ch-2",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "m-3",
    courseId: "ma1101",
    title: "Matematika I Bab 3: Konsep Limit & Kekontinuan",
    docCategory: "materi",
    kind: "article",
    fileSize: "22 menit baca",
    chapterId: "ch-3",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "m-4",
    courseId: "ma1101",
    title: "Matematika I Bab 4: Penggunaan Turunan",
    docCategory: "materi",
    kind: "article",
    fileSize: "17 menit baca",
    chapterId: "ch-4",
    thumbnailUrl: sampleDocThumb,
  },
];

const mockChapterDocs: any[] = [
  {
    id: "doc-1",
    courseId: "ma1101",
    title: "Scl 1 - Bilangan Real & Pertaksamaan",
    kind: "pdf",
    subcategory: "scl",
    year: 2024,
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-2",
    courseId: "ma1101",
    title: "Scl 2 - Nilai Mutlak & Titik Tengah",
    kind: "pdf",
    subcategory: "scl",
    year: 2024,
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-3",
    courseId: "ma1101",
    title: "Diktat Review Bab 1 - Kalkulus Dasar",
    docCategory: "diktat",
    fileSize: "15 menit baca",
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-4",
    courseId: "ma1101",
    title: "Artikel Utama: Fondasi Sistem Bilangan",
    docCategory: "materi",
    fileSize: "27 menit baca",
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-5",
    courseId: "ma1101",
    title: "Latihan Soal Mandiri Bab 1",
    docCategory: "soal",
    fileSize: "10 soal",
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-6",
    courseId: "ma1101",
    title: "Pembahasan Kuis Tahun Lalu",
    docCategory: "solusi",
    subcategory: "scl",
    year: 2023,
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
  {
    id: "doc-7",
    courseId: "ma1101",
    title: "Rangkuman Rumus Penting Bab 1",
    kind: "pdf",
    fileSize: "1.2 MB",
    chapterId: "ch-1",
    thumbnailUrl: sampleDocThumb,
  },
];

const mockFlashcardQueue: any[] = [
  {
    card: {
      id: "fc-1",
      setId: "set-1",
      koId: "ko-1",
      front: "Apa fungsi garis bilangan real?",
      back: "Merepresentasikan seluruh himpunan bilangan real secara geometris berurutan dari kiri (nilai negatif) hingga ke kanan (nilai positif).",
      explanation: "Setiap titik pada garis bilangan berkorespondensi satu-satu dengan tepat satu bilangan real.",
      status: "active",
      metadata: {},
      createdAt: new Date(),
    },
    progress: {},
    dueStatus: "new",
    nextReviewDue: new Date(),
    ideaId: "idea-1",
    masteryScore: 0,
    confidence: null,
    seenBefore: false,
    priorityReason: "Konsep dasar Bab 1",
  },
];

function LessCardsFixture() {
  const searchParams = useSearchParams();
  const screen = searchParams.get("screen") || "all";

  return (
    <div className="min-h-screen bg-background text-foreground p-3 max-w-[420px] mx-auto space-y-8 font-sans">
      <div className="border-b border-border/60 pb-2">
        <h1 className="font-heading text-body-sm font-bold text-foreground">
          Zyx Less Cards Redesign Fixture
        </h1>
        <p className="text-body-xs text-muted-foreground">
          Pratinjau visual 9 layar sesuai panduan less-cards (Viewport 380px)
        </p>
      </div>

      {/* Screen 1: Konsep & Rencana Belajar */}
      {(screen === "all" || screen === "1") && (
        <section id="screen-1" className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
              01. Konsep & Rencana Belajar
            </span>
          </div>
          <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/75 overflow-hidden">
            <div className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40 transition-colors">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-status-success text-white">
                <Check className="size-3 stroke-[3]" />
              </span>
              <p className="min-w-0 flex-1 text-body-sm text-foreground leading-snug line-clamp-2">
                Gradien positif menghasilkan grafik yang naik dari kiri ke kanan
              </p>
              <div className="flex items-center gap-1.5 shrink-0 text-body-xs text-muted-foreground">
                <span className="tabular-nums">27m</span>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
              </div>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40 transition-colors">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary text-brand-primary">
                <span className="size-2 rounded-full bg-brand-primary" />
              </span>
              <p className="min-w-0 flex-1 text-body-sm text-foreground leading-snug line-clamp-2">
                Gradien negatif menghasilkan grafik yang turun dari kiri ke kanan
              </p>
              <div className="flex items-center gap-1.5 shrink-0 text-body-xs text-muted-foreground">
                <span className="tabular-nums">15m</span>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
              </div>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-3 hover:bg-muted/40 transition-colors">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-body-sm text-foreground leading-snug line-clamp-2">
                Gradien nol menghasilkan garis horizontal mendatar
              </p>
              <div className="flex items-center gap-1.5 shrink-0 text-body-xs text-muted-foreground">
                <span className="tabular-nums">10m</span>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Screen 2: Flashcard */}
      {(screen === "all" || screen === "2") && (
        <section id="screen-2" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            02. Flashcard
          </span>
          <FlashcardClient
            courseId="ma1101"
            studentId="std-1"
            initialQueue={mockFlashcardQueue}
          />
        </section>
      )}

      {/* Screen 3: Jadwal Tutorial Admin */}
      {(screen === "all" || screen === "3") && (
        <section id="screen-3" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            03. Jadwal & Sesi Tutorial (Admin)
          </span>
          <AcademicSchedulesDashboard
            initialData={{
              courses: [],
              tutors: [
                { id: "t-1", name: "Adi Haditya Nursyam", email: "adi@zyx.id" },
                { id: "t-2", name: "Heidi Schan Andriana", email: "heidi@zyx.id" },
              ],
              groups: [],
              slots: [],
              bookings: [],
              tickets: [],
              auditLogs: [],
              academicSchedules: [],
              weekRange: { startIso: "2026-10-12", endIso: "2026-10-18" },
              legacyNullDateSlotCount: 0,
              coverage: [
                { tutorId: "t-1", tutorName: "Adi Haditya Nursyam", available: 0 },
                { tutorId: "t-2", tutorName: "Heidi Schan Andriana", available: 0 },
              ],
            }}
          />
        </section>
      )}

      {/* Screen 4: Kuis Latihan */}
      {(screen === "all" || screen === "4") && (
        <section id="screen-4" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            04. Kuis Latihan
          </span>
          <QuizListClient
            courseId="ma1101"
            isEnrolled={true}
            accessTier="standard"
            templates={mockQuizTemplates}
            attempts={[]}
          />
        </section>
      )}

      {/* Screen 5: Video Pembelajaran */}
      {(screen === "all" || screen === "5") && (
        <section id="screen-5" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            05. Video Pembelajaran
          </span>
          <CourseVideosClient
            courseId="ma1101"
            courseSlug="matematika-1"
            initialPlaylists={mockPlaylists}
            chapters={[{ id: "ch-1", title: "Sistem Bilangan", orderIndex: 1 }]}
            isEnrolled={true}
            canManage={false}
          />
        </section>
      )}

      {/* Screen 6: Tab Materi (Grid / List View) */}
      {(screen === "all" || screen === "6") && (
        <section id="screen-6" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            06. Tab Materi (Standard List di Mobile)
          </span>
          <DocumentListClient
            courseId="ma1101"
            courseSlug="matematika-1"
            courseTitle="Matematika I"
            materials={mockMaterials}
            chapters={[{ id: "ch-1", title: "Sistem Bilangan", orderIndex: 1 }]}
          />
        </section>
      )}

      {/* Screen 7: Semua Dokumen per Bab */}
      {(screen === "all" || screen === "7") && (
        <section id="screen-7" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            07. Semua Dokumen per Bab
          </span>
          <CourseDocumentsClient
            courseId="ma1101"
            courseSlug="matematika-1"
            courseTitle="Matematika I"
            chapters={[{ id: "ch-1", title: "Sistem Bilangan, Pertaksamaan, & Geometri Analitik", orderIndex: 1 }]}
            materials={mockChapterDocs}
            defaultTab="all"
          />
        </section>
      )}

      {/* Screen 8: Beranda Kelas */}
      {(screen === "all" || screen === "8") && (
        <section id="screen-8" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            08. Beranda Kelas (Quick Access Strip)
          </span>
          <CoursePrimaryActions
            reading={mockReadingAction}
            quiz={mockQuizAction}
            schedule={mockScheduleAction}
          />
        </section>
      )}

      {/* Screen 9: Katalog Course */}
      {(screen === "all" || screen === "9") && (
        <section id="screen-9" className="space-y-2">
          <span className="font-heading text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
            09. Katalog Kelas
          </span>
          <CourseCatalogClient groups={mockCatalogGroups} />
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-body-xs">Memuat pratinjau...</div>}>
      <LessCardsFixture />
    </Suspense>
  );
}
