"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { StudentMobileTopNav } from "@/components/navigation/student/student-mobile-top-nav";
import { StudentMobileBottomNav } from "@/components/navigation/student/student-mobile-bottom-nav";
import { CourseMobileTabNav } from "@/components/navigation/student/course-mobile-tab-nav";
import { TutorMobileTopNav } from "@/components/navigation/tutor/tutor-mobile-top-nav";
import { TutorMobileBottomNav } from "@/components/navigation/tutor/tutor-mobile-bottom-nav";
import { AdminMobileTopNav } from "@/components/navigation/admin/admin-mobile-top-nav";
import { AdminMobileBottomNav } from "@/components/navigation/admin/admin-mobile-bottom-nav";
import { AdminMoreSheet } from "@/components/navigation/admin/admin-more-sheet";
import { useMobileTopNav } from "@/components/navigation/mobile-chrome-context";
import { OpsAiProvider } from "@/components/admin/ops-ai/ops-ai-context";
import { Button } from "@/components/ui/button";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import { ChapterOutline } from "@/components/course/chapter-outline";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import type { TutorMode } from "@/components/course/tutor-drawer-view";

const DynamicTutorDrawerView = dynamic(
  () => import("@/components/course/tutor-drawer-view").then((mod) => mod.TutorDrawerView),
  { ssr: false }
);
import { DiscussionWorkspace } from "@/components/discussions/discussion-workspace";
import type {
  DiscussionChannel,
  DiscussionMessage,
  DiscussionPerson,
  DiscussionQuestion,
} from "@/components/discussions/view-model";
import { StudentDashboardMobile } from "@/features/student-dashboard/ui/mobile/student-dashboard-mobile";
import type { StudentDashboardDataProps } from "@/features/student-dashboard/model/types";
import { StudentProfileMobile } from "@/features/student-profile/ui/mobile/student-profile-mobile";
import { StudentScheduleMobile } from "@/features/student-schedule/ui/mobile/student-schedule-mobile";
import { TutorDashboardContent } from "@/features/tutor-dashboard/ui/tutor-dashboard-content";
import type { TutorDashboardViewProps } from "@/features/tutor-dashboard/model/types";
import { TutorScheduleMobile } from "@/features/tutor-schedule/ui/mobile/tutor-schedule-mobile";
import { TryoutGradingMobile } from "@/features/grading/ui/mobile/tryout-grading-mobile";
import type { SubmissionItem, TryoutGradingTab } from "@/features/grading/model/types";
import { AdminHomeMobile } from "@/features/admin-home/ui/mobile/admin-home-mobile";
import type { AdminHomeViewProps } from "@/features/admin-home/model/types";
import type { CourseAttentionData, CourseOverviewActionCard } from "@/types/course-learning";
import type { ChapterOutlineItem } from "@/lib/course-utils";
import type { TutorCourseSummary } from "@/components/navigation/tutor/tutor-nav-model";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import type {
  OwnedBookingItem,
  OwnedSlotItem,
  OwnedTicketItem,
  TutorScheduleReadModel,
} from "@/lib/schedule/tutor-read-model";
import { getWeekScheduleDays } from "@/lib/date-utils";

export type MobilePreviewView =
  | "student-home"
  | "student-course"
  | "student-profile"
  | "student-schedule"
  | "tutor-home"
  | "tutor-grading"
  | "tutor-schedule"
  | "article-reader"
  | "article-toc"
  | "zyra-drawer"
  | "discussion-list"
  | "discussion-thread"
  | "admin-home"
  | "admin-more"
  | "sonner-toast";

const DEMO_COURSES = [
  { id: "ma1101", title: "Matematika I (MA1101)", category: "TPB" },
  { id: "fi1101", title: "Fisika Dasar IA (FI1101)", category: "TPB" },
  { id: "ki1101", title: "Kimia Dasar IA (KI1101)", category: "TPB" },
];

const TUTOR_COURSES: TutorCourseSummary[] = [
  { courseId: "ma1101", title: "Matematika I (MA1101)", code: "MA1101" },
  { courseId: "fi1101", title: "Fisika Dasar IA (FI1101)", code: "FI1101" },
];

function createDemoExperience(
  pathname: string,
  account: { name: string; email: string }
): StudentExperienceAdapter {
  return {
    mode: "demo",
    pathname,
    href: (path: string) => path,
    courses: DEMO_COURSES,
    account,
    streak: { current: 7, weeklyActivity: [true, true, true, true, true, true, true] },
    courseHref: (id: string) => `/courses/${encodeURIComponent(id)}`,
    route: (view: string, id?: string) => (id ? `/courses/${encodeURIComponent(id)}/${view}` : `/${view}`),
    baseline: [],
    selectedCourseId: pathname.startsWith("/courses/ma1101") ? "ma1101" : null,
    overlay: null,
    ready: true,
  };
}

function MobileTopTitleOverride({ title }: { title: string }) {
  const config = useMemo(() => ({ title }), [title]);
  useMobileTopNav(config);
  return null;
}

function SonnerToastDemoTrigger() {
  useEffect(() => {
    const id = toast.success("Jawaban tersimpan", {
      description: "Progres latihan sudah disinkronkan.",
      duration: 60_000,
    });
    return () => {
      toast.dismiss(id);
    };
  }, []);
  return null;
}

const STUDENT_DASHBOARD_FIXTURE: Omit<StudentDashboardDataProps, "activateClassAction"> = {
  enrollments: [
    { id: "ma1101", title: "Matematika I (MA1101)", category: "TPB" },
    { id: "fi1101", title: "Fisika Dasar IA (FI1101)", category: "TPB" },
    { id: "ki1101", title: "Kimia Dasar IA (KI1101)", category: "TPB" },
  ],
  courseProgress: {
    ma1101: { doneCount: 8, total: 12, nextConcept: "Limit dan Kekontinuan" },
    fi1101: { doneCount: 5, total: 10, nextConcept: "Dinamika Partikel" },
    ki1101: { doneCount: 3, total: 8, nextConcept: "Stoikiometri Larutan" },
  },
  inProgressDocuments: [
    {
      id: "doc-1",
      title: "Bab 2: Fungsi, Limit, dan Asimtot",
      kind: "article",
      courseId: "ma1101",
      courseTitle: "Matematika I (MA1101)",
      completionPercent: 68,
      href: "/courses/ma1101/material/doc-1",
    },
    {
      id: "doc-2",
      title: "Hukum Newton pada Bidang Miring",
      kind: "article",
      courseId: "fi1101",
      courseTitle: "Fisika Dasar IA (FI1101)",
      completionPercent: 42,
      href: "/courses/fi1101/material/doc-2",
    },
  ],
  recommendedUnenrolledCourses: [
    {
      id: "ku1102",
      title: "Pengenalan Komputasi (KU1102)",
      category: "TPB",
      materialsCount: 18,
    },
  ],
  studentTargetCategory: "TPB",
  totalDueFlashcards: 9,
  firstCourseWithQueue: "ma1101",
  recentReviews: [
    {
      id: "rev-1",
      front: "Teorema Apit untuk limit trigonometri",
      grade: 3,
      reviewedAt: "2026-11-22T09:30:00Z",
      courseTitle: "Matematika I (MA1101)",
    },
    {
      id: "rev-2",
      front: "Gaya gesek statis maksimum",
      grade: 4,
      reviewedAt: "2026-11-22T08:15:00Z",
      courseTitle: "Fisika Dasar IA (FI1101)",
    },
  ],
  masteryConcepts: [
    {
      conceptName: "Definisi Epsilon-Delta Limit",
      masteryScore: 0.42,
      evidenceCount: 6,
      trend: "declining",
    },
    {
      conceptName: "Diagram Benda Bebas",
      masteryScore: 0.58,
      evidenceCount: 8,
      trend: "improving",
    },
  ],
  availableExams: [
    {
      id: "exam-1",
      title: "Tryout UTS Matematika I",
      courseId: "ma1101",
      courseTitle: "Matematika I (MA1101)",
      type: "tryout",
    },
    {
      id: "quiz-1",
      title: "Kuis Bab 2: Limit Fungsi",
      courseId: "ma1101",
      courseTitle: "Matematika I (MA1101)",
      type: "quiz",
    },
  ],
};

const COURSE_READING_ACTION: CourseOverviewActionCard = {
  tag: "DOKUMEN",
  title: "Sistem Bilangan Real dan Pertaksamaan",
  meta: "3 materi",
  actionLabel: "Lanjutkan membaca",
  href: "/courses/ma1101/material",
};

const COURSE_QUIZ_ACTION: CourseOverviewActionCard = {
  tag: "KUIS",
  title: "Kuis Bab 1: Pertaksamaan Nilai Mutlak",
  meta: "10 soal",
  actionLabel: "Mulai kuis",
  href: "/courses/ma1101/quiz/quiz-1",
};

const COURSE_SCHEDULE_ACTION: CourseOverviewActionCard = {
  tag: "JADWAL",
  title: "Tutorial Pekanan Kalkulus",
  meta: "Kamis, 19:00 WIB",
  actionLabel: "Lihat jadwal",
  href: "/dashboard/schedule?course=ma1101",
};

const COURSE_ATTENTION: CourseAttentionData = {
  items: [
    {
      kind: "flashcard",
      label: "4 kartu flashcard perlu diulang hari ini",
      actionLabel: "Ulangi sekarang",
      href: "/courses/ma1101/flashcard",
    },
  ],
};

const COURSE_CHAPTERS: ChapterOutlineItem[] = [
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
    title: "Bab 2: Fungsi, Limit, dan Kekontinuan",
    orderIndex: 2,
    canonicalId: null,
    legacyChapterId: null,
    materialId: "mat-2",
    hasMaterial: true,
    completed: false,
    completionPercent: 60,
  },
  {
    id: "ch-3",
    title: "Bab 3: Turunan dan Aplikasinya",
    orderIndex: 3,
    canonicalId: null,
    legacyChapterId: null,
    materialId: "mat-3",
    hasMaterial: true,
    completed: false,
    completionPercent: 0,
  },
];

const TUTOR_DASHBOARD_FIXTURE: TutorDashboardViewProps = {
  locale: "id",
  counts: {
    courses: 2,
    activeGroups: 4,
    sessionsThisWeek: 6,
    pendingTickets: 3,
  },
  upcomingSessions: [
    {
      id: "ses-1",
      courseTitle: "Matematika I (MA1101)",
      topic: "Pembahasan Soal Limit Tak Hingga",
      sessionDate: "2026-11-24",
      startTime: "19:00",
      endTime: "20:30",
      groupName: "Kelas TPB A",
      mode: "online",
    },
    {
      id: "ses-2",
      courseTitle: "Fisika Dasar IA (FI1101)",
      topic: "Klinik Usaha dan Energi",
      sessionDate: "2026-11-25",
      startTime: "16:00",
      endTime: "17:30",
      groupName: "Kelas TPB B",
      mode: "hybrid",
    },
  ],
  pendingTickets: [
    {
      id: "tkt-1",
      type: "reschedule",
      reason: "Permintaan pindah sesi Kamis malam ke Jumat sore karena bentrok praktikum.",
    },
    {
      id: "tkt-2",
      type: "question",
      reason: "Klarifikasi rubrik nilai esai Tryout UTS nomor 2.",
    },
  ],
  courses: [
    {
      courseId: "ma1101",
      title: "Matematika I (MA1101)",
      code: "MA1101",
      groupCount: 2,
    },
    {
      courseId: "fi1101",
      title: "Fisika Dasar IA (FI1101)",
      code: "FI1101",
      groupCount: 2,
    },
  ],
};

const TRYOUT_SUBMISSIONS: SubmissionItem[] = [
  {
    id: "sub-1",
    studentName: "Raka Pratama",
    studentEmail: "raka.pratama@zyx.id",
    examTitle: "Tryout UTS Matematika I",
    status: "pending_review",
    score: null,
    teacherNotes: "",
    submittedAt: new Date("2026-11-22T14:20:00Z"),
    questionsSnapshot: [
      {
        id: "q-1",
        type: "multiple_choice",
        prompt: "Nilai dari $\\lim_{x \\to 0} \\frac{\\sin(3x)}{x}$ adalah...",
        options: ["0", "1", "3", "Tak hingga"],
        correctIndex: 2,
      },
      {
        id: "q-2",
        type: "essay",
        prompt: "Buktikan kekontinuan fungsi $f(x) = x^2 + 2x$ di titik $x = 1$ dengan memeriksa ketiga syarat kekontinuan.",
      },
    ],
    answersSnapshot: {
      "q-1": { index: 2 },
      "q-2": {
        text: "1) f(1) = 1 + 2 = 3 terdefinisi. 2) lim x->1 (x^2 + 2x) = 3 ada. 3) Karena nilai limit sama dengan f(1), fungsi kontinu di x = 1.",
      },
    },
  },
  {
    id: "sub-2",
    studentName: "Nadia Kusuma",
    studentEmail: "nadia.kusuma@zyx.id",
    examTitle: "Tryout UTS Matematika I",
    status: "graded",
    score: 92,
    teacherNotes: "Langkah pembuktian sudah runtut dan jelas.",
    submittedAt: new Date("2026-11-22T12:10:00Z"),
    questionsSnapshot: [],
    answersSnapshot: {},
  },
];

const ADMIN_HOME_FIXTURE: AdminHomeViewProps = {
  failedJobs: 1,
  kpis: {
    totalCourses: 14,
    pendingQuestions: 28,
    runningJobs: 2,
    aiRequestsToday: 412,
  },
  categories: [
    {
      name: "Akademik",
      items: [
        {
          title: "Mata Kuliah",
          iconKey: "graduation-cap",
          iconColor: "text-brand-secondary",
          href: "/admin/courses",
          stat: "14 aktif",
        },
        {
          title: "Jadwal dan Sesi",
          iconKey: "calendar-days",
          iconColor: "text-brand-primary",
          href: "/admin/schedules",
          stat: "18 pekan ini",
        },
        {
          title: "Notifikasi",
          iconKey: "bell",
          iconColor: "text-status-info",
          href: "/admin/notifications",
          stat: null,
        },
      ],
    },
    {
      name: "Evaluasi",
      items: [
        {
          title: "Bank Soal",
          iconKey: "library",
          iconColor: "text-status-success",
          href: "/admin/questions",
          stat: "28 tinjau",
        },
        {
          title: "Papan Peringkat",
          iconKey: "trophy",
          iconColor: "text-status-warning",
          href: "/admin/leaderboard",
          stat: null,
        },
      ],
    },
    {
      name: "Operasional",
      items: [
        {
          title: "Antrean Jobs",
          iconKey: "zap",
          iconColor: "text-status-warning",
          href: "/admin/jobs",
          stat: "2 berjalan",
        },
        {
          title: "Analitik Platform",
          iconKey: "line-chart",
          iconColor: "text-brand-primary",
          href: "/admin/ops/analytics",
          stat: "412 AI/hari",
        },
      ],
    },
  ],
};

function TutorGradingFixtureView() {
  const [activeTab, setActiveTab] = useState<TryoutGradingTab>("pending");
  const [activeSub, setActiveSub] = useState<SubmissionItem | null>(TRYOUT_SUBMISSIONS[0]);
  const [scoreInput, setScoreInput] = useState("88");
  const [notesInput, setNotesInput] = useState("Pembuktian kekontinuan sudah tepat.");

  return (
    <ApplicationPage maxWidth="7xl">
      <TryoutGradingMobile
        initialSubmissions={TRYOUT_SUBMISSIONS}
        pendingList={TRYOUT_SUBMISSIONS.filter((item) => item.status !== "graded")}
        gradedList={TRYOUT_SUBMISSIONS.filter((item) => item.status === "graded")}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeSub={activeSub}
        scoreInput={scoreInput}
        notesInput={notesInput}
        isPending={false}
        onOpenGrade={(sub) => setActiveSub(sub)}
        onCloseSub={() => setActiveSub(null)}
        onScoreChange={setScoreInput}
        onNotesChange={setNotesInput}
        onSaveGrade={() => undefined}
      />
    </ApplicationPage>
  );
}

const ARTICLE_FIXTURE: PublicArticleReadModel = {
  id: "art-limit-ma1101",
  courseId: "ma1101",
  chapterId: "ch-2",
  slug: "fungsi-limit-dan-kekontinuan",
  title: "Fungsi, Limit, dan Kekontinuan",
  courseTitle: "Matematika I (MA1101)",
  chapterTitle: "Fungsi, Limit, dan Kekontinuan",
  chapterNumber: 2,
  version: 1,
  totalEstimatedReadingMinutes: 14,
  progress: {
    completed: false,
    overallPercent: 45,
    lastSectionSlug: "limit-intuitif",
    sectionProgress: {
      "sec-1": { maxReadPercent: 100, completed: true, timeSpentSeconds: 210 },
      "sec-2": { maxReadPercent: 45, completed: false, timeSpentSeconds: 95 },
      "sec-3": { maxReadPercent: 0, completed: false, timeSpentSeconds: 0 },
    },
  },
  sections: [
    {
      id: "sec-1",
      slug: "limit-intuitif",
      title: "Pendekatan Intuitif Limit Fungsi",
      sectionNumber: "2.1",
      sectionKind: "topic",
      learningObjective: "Memahami perilaku nilai fungsi $f(x)$ saat $x$ mendekati titik $c$.",
      estimatedReadingMinutes: 5,
      orderIndex: 1,
      parentSectionId: null,
      blocks: [
        {
          id: "blk-1",
          blockKey: "intuition-1",
          blockType: "concept",
          title: "Makna Geometris Limit",
          orderIndex: 1,
          content:
            "Menuliskan $\\lim_{x \\to c} f(x) = L$ berarti nilai $f(x)$ dapat dibuat sedekat mungkin ke $L$ dengan memilih $x$ yang cukup dekat ke $c$, tetapi $x \\neq c$. Nilai fungsi tepat di $x = c$ tidak harus terdefinisi.",
        },
        {
          id: "blk-2",
          blockKey: "example-1",
          blockType: "example",
          title: "Contoh: Fungsi Rasional Berlubang",
          orderIndex: 2,
          content:
            "Perhatikan $f(x) = \\frac{x^2 - 1}{x - 1}$ untuk $x \\neq 1$. Dengan memfaktorkan pembilang menjadi $(x - 1)(x + 1)$, kita peroleh $\\lim_{x \\to 1} f(x) = 2$ meskipun $f(1)$ tidak terdefinisi.",
        },
      ],
    },
    {
      id: "sec-2",
      slug: "definisi-epsilon-delta",
      title: "Definisi Presisi Epsilon-Delta",
      sectionNumber: "2.2",
      sectionKind: "topic",
      learningObjective: "Membuktikan nilai limit secara formal menggunakan pasangan $\\varepsilon$ dan $\\delta$.",
      estimatedReadingMinutes: 5,
      orderIndex: 2,
      parentSectionId: null,
      blocks: [
        {
          id: "blk-3",
          blockKey: "def-ed",
          blockType: "definition",
          title: "Definisi Formal Limit",
          orderIndex: 1,
          content:
            "Untuk setiap $\\varepsilon > 0$, terdapat $\\delta > 0$ sedemikian sehingga $0 < |x - c| < \\delta \\implies |f(x) - L| < \\varepsilon$.",
        },
      ],
    },
    {
      id: "sec-3",
      slug: "kekontinuan-di-satu-titik",
      title: "Kekontinuan Fungsi di Satu Titik",
      sectionNumber: "2.3",
      sectionKind: "topic",
      learningObjective: "Memeriksa tiga syarat kekontinuan fungsi pada titik $x = c$.",
      estimatedReadingMinutes: 4,
      orderIndex: 3,
      parentSectionId: null,
      blocks: [
        {
          id: "blk-4",
          blockKey: "cont-1",
          blockType: "theorem",
          title: "Tiga Syarat Kekontinuan",
          orderIndex: 1,
          content:
            "Fungsi $f$ kontinu di $c$ apabila: (1) $f(c)$ terdefinisi, (2) $\\lim_{x \\to c} f(x)$ ada, dan (3) $\\lim_{x \\to c} f(x) = f(c)$.",
        },
      ],
    },
  ],
};

const DISCUSSION_VIEWER: DiscussionPerson = {
  id: "stu-1",
  name: "Raka Pratama",
  role: "student",
  mention: "raka",
};

const DISCUSSION_CHANNELS: DiscussionChannel[] = [
  {
    id: "ch-ma1101",
    kind: "course",
    name: "Matematika I (MA1101)",
    courseId: "ma1101",
    courseTitle: "Matematika I (MA1101)",
    unreadCount: 2,
    muted: false,
    canCreate: true,
  },
  {
    id: "ch-fi1101",
    kind: "course",
    name: "Fisika Dasar IA (FI1101)",
    courseId: "fi1101",
    courseTitle: "Fisika Dasar IA (FI1101)",
    unreadCount: 0,
    muted: false,
    canCreate: true,
  },
  {
    id: "ch-global",
    kind: "global",
    name: "Forum Umum TPB",
    unreadCount: 1,
    muted: false,
    canCreate: true,
  },
];

const DISCUSSION_QUESTIONS: DiscussionQuestion[] = [
  {
    id: "q-limit",
    channelId: "ch-ma1101",
    title: "Cara memilih delta saat membuktikan limit fungsi kuadrat?",
    status: "answered",
    lastActivityAt: "2026-11-23T01:40:00Z",
    unreadCount: 1,
    answerCount: 2,
    allowedForwardChannelIds: [],
    canReply: true,
    canResolve: true,
  },
  {
    id: "q-apit",
    channelId: "ch-ma1101",
    title: "Kapan Teorema Apit lebih tepat daripada L'Hopital?",
    status: "open",
    lastActivityAt: "2026-11-22T18:15:00Z",
    unreadCount: 0,
    answerCount: 0,
    allowedForwardChannelIds: [],
    canReply: true,
    canResolve: true,
  },
  {
    id: "q-newton",
    channelId: "ch-fi1101",
    title: "Arah gaya gesek statis pada sistem dua balok bertumpuk",
    status: "open",
    lastActivityAt: "2026-11-22T14:05:00Z",
    unreadCount: 0,
    answerCount: 1,
    allowedForwardChannelIds: [],
    canReply: true,
    canResolve: false,
  },
];

const DISCUSSION_MESSAGES: DiscussionMessage[] = [
  {
    id: "msg-1",
    seq: 1,
    author: DISCUSSION_VIEWER,
    body: "Saat membuktikan $\\lim_{x \\to 2} x^2 = 4$, kenapa kita biasanya membatasi dulu $|x - 2| < 1$ sebelum menentukan $\\delta$?",
    createdAt: "2026-11-23T01:10:00Z",
    revision: 1,
    messageType: "question",
    attachments: [],
    reactions: [{ emoji: "👍", count: 3, selected: false }],
    canEdit: true,
    canDelete: false,
    canReport: false,
    canReply: true,
    canReact: true,
  },
  {
    id: "msg-2",
    seq: 2,
    author: {
      id: "tut-1",
      name: "Dr. Nadia Putri",
      role: "tutor",
      mention: "nadia",
    },
    body: "Karena $|x^2 - 4| = |x - 2|\\cdot|x + 2|$. Faktor $|x + 2|$ masih bergantung pada $x$. Dengan membatasi $|x - 2| < 1$, kita dapat batas atas konstan $|x + 2| < 5$, sehingga cukup pilih $\\delta = \\min(1, \\varepsilon / 5)$.",
    createdAt: "2026-11-23T01:25:00Z",
    revision: 1,
    messageType: "answer",
    attachments: [],
    reactions: [{ emoji: "🙌", count: 4, selected: true }],
    canEdit: false,
    canDelete: false,
    canReport: true,
    canReply: true,
    canReact: true,
  },
  {
    id: "msg-3",
    seq: 3,
    author: DISCUSSION_VIEWER,
    body: "Berarti batas awal $|x - 2| < 1$ hanya alat bantu untuk mengunci faktor $|x + 2|$ agar jadi konstanta, ya Bu?",
    createdAt: "2026-11-23T01:40:00Z",
    revision: 1,
    messageType: "reply",
    replyTo: {
      id: "msg-2",
      authorName: "Dr. Nadia Putri",
      excerpt: "Dengan membatasi |x - 2| < 1, kita dapat batas atas konstan |x + 2| < 5...",
    },
    attachments: [],
    reactions: [],
    canEdit: true,
    canDelete: false,
    canReport: false,
    canReply: true,
    canReact: true,
  },
];

function StudentScheduleFixtureView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekInfo = useMemo(() => getWeekScheduleDays(), []);
  const activeDay = weekInfo.days.find((day) => day.isToday) ?? weekInfo.days[0];
  const nextDay = weekInfo.days[Math.min(weekInfo.days.length - 1, weekInfo.days.indexOf(activeDay) + 1)];

  const bookings = useMemo(
    () => [
      {
        id: "bk-1",
        slotId: "sl-booked",
        courseId: "ma1101",
        course: { id: "ma1101", title: "Matematika I (MA1101)" },
        group: { id: "grp-a", name: "Kelas TPB A" },
        tutor: { id: "tut-1", name: "Dr. Nadia Putri" },
        sessionDate: activeDay.dateIso,
        startTime: "16:00",
        endTime: "17:30",
        mode: "online",
        topic: "Pembahasan Limit Tak Hingga dan Kekontinuan",
        status: "confirmed",
      },
    ],
    [activeDay.dateIso]
  );

  const slots = useMemo(
    () => [
      {
        id: "sl-open-1",
        tutorId: "tut-1",
        tutor: { id: "tut-1", name: "Dr. Nadia Putri", tutorCourses: [{ courseId: "ma1101" }] },
        matchedCourseIds: ["ma1101"],
        sessionDate: activeDay.dateIso,
        startTime: "19:00",
        endTime: "20:30",
        mode: "online",
        location: null,
        notes: "Klinik soal Bab 2 menjelang kuis pekanan",
      },
      {
        id: "sl-open-2",
        tutorId: "tut-2",
        tutor: { id: "tut-2", name: "Bima Santoso", tutorCourses: [{ courseId: "fi1101" }] },
        matchedCourseIds: ["fi1101"],
        sessionDate: nextDay.dateIso,
        startTime: "15:00",
        endTime: "16:30",
        mode: "offline",
        location: "Ruang Tutorial 204",
        notes: "Latihan dinamika partikel",
      },
    ],
    [activeDay.dateIso, nextDay.dateIso]
  );

  const academicSchedules = useMemo(
    () => [
      {
        id: "acad-1",
        title: "Kuis 1 Matematika I",
        type: "quiz",
        courseId: "ma1101",
        course: { id: "ma1101", title: "Matematika I (MA1101)" },
        startDate: `${activeDay.dateIso}T09:00:00+07:00`,
        endDate: `${activeDay.dateIso}T10:30:00+07:00`,
        location: "GKU Barat 9211",
        description: "Materi Bab 1 dan Bab 2",
      },
    ],
    [activeDay.dateIso]
  );

  return (
    <ApplicationPage maxWidth="7xl">
      <StudentScheduleMobile
        loading={false}
        allowPastBooking={true}
        currentUserId="stu-1"
        weekInfo={weekInfo}
        isWeekLocked={false}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        coursesList={DEMO_COURSES.map((c) => ({ id: c.id, title: c.title }))}
        tutorsList={[
          { id: "tut-1", name: "Dr. Nadia Putri" },
          { id: "tut-2", name: "Bima Santoso" },
        ]}
        groupsList={[{ id: "grp-a", name: "Kelas TPB A" }]}
        initialCourseFilter="all"
        compatibleCourseIds={["ma1101", "fi1101", "ki1101"]}
        slots={slots}
        bookings={bookings}
        academicSchedules={academicSchedules}
        onSelectSlotToBook={() => undefined}
        onOpenSessionDetail={() => undefined}
        onEditSchedule={() => undefined}
      />
    </ApplicationPage>
  );
}

function TutorScheduleFixtureView() {
  const weekInfo = useMemo(() => getWeekScheduleDays(), []);
  const activeDay = weekInfo.days.find((day) => day.isToday) ?? weekInfo.days[0];
  const nextDay = weekInfo.days[Math.min(weekInfo.days.length - 1, weekInfo.days.indexOf(activeDay) + 1)];

  const [activeTab, setActiveTab] = useState("calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(activeDay.dateIso);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState("all");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [isAddSlotOpen, setIsAddSlotOpen] = useState(false);
  const [newSlotDate, setNewSlotDate] = useState(activeDay.dateIso);
  const [newSlotStart, setNewSlotStart] = useState("19:00");
  const [newSlotMode, setNewSlotMode] = useState<"online" | "offline">("online");
  const [newSlotLocation, setNewSlotLocation] = useState("");
  const [newSlotNotes, setNewSlotNotes] = useState("");
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const scheduleData = useMemo<TutorScheduleReadModel>(() => {
    const ownedBookings: OwnedBookingItem[] = [
      {
        id: "tbk-1",
        slotId: "tsl-1",
        studentId: "stu-1",
        courseId: "ma1101",
        groupId: "grp-a",
        status: "confirmed",
        sessionDate: activeDay.dateIso,
        startTime: "16:00",
        endTime: "17:30",
        mode: "online",
        location: null,
        googleMeetUrl: "https://meet.google.com/zyx-demo",
        topic: "Pembahasan Soal Limit Tak Hingga",
        preSessionNotes: "Fokus soal UTS tahun lalu",
        postSessionNotes: null,
        postSessionLinkUrl: null,
        postSessionLinkTitle: null,
        completedAt: null,
        bookedAt: new Date("2026-11-20T08:00:00Z"),
        group: { id: "grp-a", name: "Kelas TPB A" },
        course: { id: "ma1101", title: "Matematika I (MA1101)" },
        student: { id: "stu-1", name: "Raka Pratama", email: "raka.pratama@zyx.id" },
        resources: [],
        preSessionResources: [],
        postSessionResources: [],
        auditLogs: [],
        rescheduleTickets: [],
      },
    ];

    const ownedSlots: OwnedSlotItem[] = [
      {
        id: "tsl-2",
        tutorId: "tut-1",
        dayOfWeek: activeDay.dayName,
        startTime: "19:00",
        endTime: "20:30",
        mode: "online",
        location: null,
        sessionDate: activeDay.dateIso,
        createdAt: new Date("2026-11-19T08:00:00Z"),
        booking: null,
      },
      {
        id: "tsl-3",
        tutorId: "tut-1",
        dayOfWeek: nextDay.dayName,
        startTime: "15:00",
        endTime: "16:30",
        mode: "offline",
        location: "Ruang Tutorial 204",
        sessionDate: nextDay.dateIso,
        createdAt: new Date("2026-11-19T08:00:00Z"),
        booking: null,
      },
    ];

    const ownedTickets: OwnedTicketItem[] = [
      {
        id: "tkt-1",
        bookingId: "tbk-1",
        groupId: "grp-a",
        requestedById: "stu-1",
        tutorId: "tut-1",
        type: "reschedule",
        status: "pending",
        reason: "Bentrok jadwal praktikum fisika dasar pada jam 16:00.",
        proposedSlotId: "tsl-2",
        proposedDate: activeDay.dateIso,
        decisionNotes: null,
        decidedAt: null,
        createdAt: new Date("2026-11-22T09:00:00Z"),
        messages: [],
      },
    ];

    return {
      tutor: {
        id: "tut-1",
        name: "Dr. Nadia Putri",
        email: "nadia.putri@zyx.id",
        status: "active",
      },
      assignedActiveCourses: [
        {
          courseId: "ma1101",
          code: "MA1101",
          title: "Matematika I (MA1101)",
          legacyCourseId: null,
          source: "canonical_assignment",
          isCompatibilityFallback: false,
        },
        {
          courseId: "fi1101",
          code: "FI1101",
          title: "Fisika Dasar IA (FI1101)",
          legacyCourseId: null,
          source: "canonical_assignment",
          isCompatibilityFallback: false,
        },
      ],
      eligibleGroups: [
        {
          id: "grp-a",
          name: "Kelas TPB A",
          packageType: "group",
          packageName: "Reguler TPB",
          status: "active",
          weeklyQuotaSessions: 2,
          totalQuotaSessions: 12,
          usedQuotaSessions: 5,
          matchedCourseIds: ["ma1101"],
          representative: null,
          membersCount: 8,
        },
      ],
      ownedSlots,
      ownedBookings,
      ownedTickets,
      ownedSchedules: [],
      compatibilitySource: "canonical",
    };
  }, [activeDay.dateIso, activeDay.dayName, nextDay.dateIso, nextDay.dayName]);

  return (
    <ApplicationPage maxWidth="7xl">
      <TutorScheduleMobile
        initialData={scheduleData}
        scheduleData={scheduleData}
        currentUserId="tut-1"
        locale="id"
        isPending={false}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        weekOffset={weekOffset}
        weekInfo={weekInfo}
        isWeekLocked={false}
        handleWeekChange={setWeekOffset}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedDayFilter={selectedDayFilter}
        setSelectedDayFilter={setSelectedDayFilter}
        selectedCourseFilter={selectedCourseFilter}
        setSelectedCourseFilter={setSelectedCourseFilter}
        selectedGroupFilter={selectedGroupFilter}
        setSelectedGroupFilter={setSelectedGroupFilter}
        filteredSlots={scheduleData.ownedSlots}
        filteredBookings={scheduleData.ownedBookings}
        filteredTickets={scheduleData.ownedTickets}
        slotNotes={{ "tsl-2": "Sesi klinik soal Bab 2" }}
        slotsWithHistory={new Set()}
        openedSlotCount={3}
        filledSlotCount={1}
        availableSlotCount={2}
        isAddSlotOpen={isAddSlotOpen}
        setIsAddSlotOpen={setIsAddSlotOpen}
        newSlotDate={newSlotDate}
        setNewSlotDate={setNewSlotDate}
        newSlotStart={newSlotStart}
        handleStartTimeChange={setNewSlotStart}
        newSlotEnd="20:30"
        newSlotMode={newSlotMode}
        setNewSlotMode={setNewSlotMode}
        newSlotLocation={newSlotLocation}
        setNewSlotLocation={setNewSlotLocation}
        newSlotNotes={newSlotNotes}
        setNewSlotNotes={setNewSlotNotes}
        handleAddSlot={() => setIsAddSlotOpen(false)}
        openAddSlotDialog={() => setIsAddSlotOpen(true)}
        handleCreateSlotDirect={() => undefined}
        requestDeleteSlot={() => undefined}
        handleOpenMoveModal={() => undefined}
        openDecideTicket={() => undefined}
        openThreadId={openThreadId}
        setOpenThreadId={setOpenThreadId}
        replyText={replyText}
        setReplyText={setReplyText}
        handleReplyTicket={() => undefined}
        onOpenSessionDetail={() => undefined}
        handleCopyPreviousWeek={() => undefined}
      />
    </ApplicationPage>
  );
}

function ArticleReaderFixtureView({ initialTocOpen }: { initialTocOpen: boolean }) {
  const [tocOpen, setTocOpen] = useState(initialTocOpen);

  return (
    <StructuredArticleReader
      article={ARTICLE_FIXTURE}
      course={{ id: "ma1101", title: "Matematika I (MA1101)" }}
      mode="learner"
      backHref="/courses/ma1101/material"
      prevMaterial={{
        id: "art-1",
        title: "Bab 1: Sistem Bilangan Real",
        href: "/courses/ma1101/material/art-1",
      }}
      nextMaterial={{
        id: "art-3",
        title: "Bab 3: Turunan dan Aplikasinya",
        href: "/courses/ma1101/material/art-3",
      }}
      isMobileSheetOpen={tocOpen}
      onToggleMobileSheet={setTocOpen}
      adapter={{
        onComplete: () => undefined,
        completed: false,
        ready: true,
      }}
    />
  );
}

function ZyraDrawerFixtureView() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeMode, setActiveMode] = useState<TutorMode>("chat");
  const [initialQuestion, setInitialQuestion] = useState<string | null>(
    "Bagaimana cara memilih delta pada pembuktian limit fungsi kuadrat?"
  );

  return (
    <>
      <StructuredArticleReader
        article={ARTICLE_FIXTURE}
        course={{ id: "ma1101", title: "Matematika I (MA1101)" }}
        mode="learner"
        backHref="/courses/ma1101/material"
        adapter={{
          onComplete: () => undefined,
          completed: false,
          ready: true,
        }}
      />
      <DynamicTutorDrawerView
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        koId={null}
        questionId={null}
        userAnswer={null}
        explainMode="content"
        initialQuestion={initialQuestion}
        onClearInitialQuestion={() => setInitialQuestion(null)}
        quotedContext={{
          title: "Bab 2: Fungsi, Limit, dan Kekontinuan",
          sectionTitle: "Definisi Presisi Epsilon-Delta",
          snippet: "0 < |x - c| < delta => |f(x) - L| < epsilon",
        }}
      />
    </>
  );
}

function DiscussionFixtureView({ initialQuestionId }: { initialQuestionId: string | null }) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>("ch-ma1101");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(initialQuestionId);
  const [search, setSearch] = useState("");

  const selectedQuestion = useMemo(
    () => DISCUSSION_QUESTIONS.find((q) => q.id === selectedQuestionId) ?? null,
    [selectedQuestionId]
  );

  return (
    <ApplicationPage maxWidth="7xl">
      <DiscussionWorkspace
        viewer={DISCUSSION_VIEWER}
        channels={DISCUSSION_CHANNELS}
        questions={DISCUSSION_QUESTIONS}
        selectedQuestion={selectedQuestion}
        messages={selectedQuestion ? DISCUSSION_MESSAGES : []}
        selectedChannelId={selectedChannelId}
        selectedQuestionId={selectedQuestionId}
        search={search}
        listState="ready"
        threadState="ready"
        canAskZyra={true}
        onSelectChannel={(ch) => setSelectedChannelId(ch?.id ?? null)}
        onSelectQuestion={(id) => setSelectedQuestionId(id)}
        onSearchChange={setSearch}
        onRetryQuestions={() => undefined}
        onRetryMessages={() => undefined}
        onCreateQuestion={async () => undefined}
        onSendReply={async () => undefined}
        onSearchMentions={async () => []}
        onSearchChannels={async () => ({ items: DISCUSSION_CHANNELS, nextCursor: null })}
        onSearchForwardTargets={async () => ({ items: [], nextCursor: null })}
        onEditMessage={async () => undefined}
        onDeleteMessage={async () => undefined}
        onToggleReaction={async () => undefined}
        onForwardMessage={async () => undefined}
        onReportMessage={async () => undefined}
        onSetChannelMuted={async () => undefined}
      />
    </ApplicationPage>
  );
}

export function MobileUiPreviewFixtureClient({ view }: { view: MobilePreviewView }) {
  const [moreSheetOpen, setMoreSheetOpen] = useState(view === "admin-more");

  if (view === "student-home" || view === "sonner-toast") {
    const experience = createDemoExperience("/dashboard", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid={`mobile-preview-${view}`}>
        {view === "sonner-toast" ? <SonnerToastDemoTrigger /> : null}
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <ApplicationPage maxWidth="7xl">
              <StudentDashboardMobile
                {...STUDENT_DASHBOARD_FIXTURE}
                activateClassAction={
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Plus className="size-3.5" aria-hidden />
                    Aktifkan kelas
                  </Button>
                }
              />
            </ApplicationPage>
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "student-course") {
    const experience = createDemoExperience("/courses/ma1101", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-student-course">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <CourseMobileTabNav
              courseId="ma1101"
              courseTitle="Matematika I (MA1101)"
              showStudyPath
              showMastery
              showLive
            />
            <ApplicationPage maxWidth="7xl">
              <div className="space-y-5">
                <CoursePrimaryActions
                  reading={COURSE_READING_ACTION}
                  quiz={COURSE_QUIZ_ACTION}
                  schedule={COURSE_SCHEDULE_ACTION}
                />
                <CourseAttentionStrip attention={COURSE_ATTENTION} />
                <ChapterOutline courseId="ma1101" chapters={COURSE_CHAPTERS} />
              </div>
            </ApplicationPage>
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "student-profile") {
    const experience = createDemoExperience("/profile", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-student-profile">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <StudentProfileMobile
              locale="id"
              pageTitle="Profil Saya"
              editLabel="Edit"
              editHref="/profile/edit"
              name="Raka Pratama"
              academicInfo="TPB STEI 2026"
              rank="camat"
              baseXpMicro={1_450_000}
              bonusXpMicro={250_000}
              lpBalance={320}
              role="student"
              roles={["murid"]}
            />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "student-schedule") {
    const experience = createDemoExperience("/dashboard/schedule", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-student-schedule">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <MobileTopTitleOverride title="Jadwal" />
            <StudentScheduleFixtureView />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "article-reader" || view === "article-toc") {
    const experience = createDemoExperience("/courses/ma1101/material/art-limit-ma1101", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid={`mobile-preview-${view}`}>
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <ArticleReaderFixtureView initialTocOpen={view === "article-toc"} />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "zyra-drawer") {
    const experience = createDemoExperience("/courses/ma1101/material/art-limit-ma1101", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-zyra-drawer">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <ZyraDrawerFixtureView />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "discussion-list" || view === "discussion-thread") {
    const experience = createDemoExperience("/courses/ma1101/discussions", {
      name: "Raka Pratama",
      email: "raka.pratama@zyx.id",
    });

    return (
      <div data-testid={`mobile-preview-${view}`}>
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<StudentMobileTopNav />}
            mobileBottomNav={<StudentMobileBottomNav />}
          >
            <DiscussionFixtureView
              initialQuestionId={view === "discussion-thread" ? "q-limit" : null}
            />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "tutor-schedule") {
    const experience = createDemoExperience("/tutor/schedule", {
      name: "Dr. Nadia Putri",
      email: "nadia.putri@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-tutor-schedule">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<TutorMobileTopNav assignedCourses={TUTOR_COURSES} />}
            mobileBottomNav={<TutorMobileBottomNav assignedCourses={TUTOR_COURSES} />}
          >
            <MobileTopTitleOverride title="Jadwal Tutor" />
            <TutorScheduleFixtureView />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "tutor-home") {
    const experience = createDemoExperience("/tutor", {
      name: "Dr. Nadia Putri",
      email: "nadia.putri@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-tutor-home">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<TutorMobileTopNav assignedCourses={TUTOR_COURSES} />}
            mobileBottomNav={<TutorMobileBottomNav assignedCourses={TUTOR_COURSES} />}
          >
            <MobileTopTitleOverride title="Beranda Tutor" />
            <ApplicationPage maxWidth="7xl">
              <TutorDashboardContent {...TUTOR_DASHBOARD_FIXTURE} />
            </ApplicationPage>
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "tutor-grading") {
    const experience = createDemoExperience("/tutor/ma1101/grading", {
      name: "Dr. Nadia Putri",
      email: "nadia.putri@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-tutor-grading">
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            mobileTopNav={<TutorMobileTopNav assignedCourses={TUTOR_COURSES} />}
            mobileBottomNav={<TutorMobileBottomNav assignedCourses={TUTOR_COURSES} />}
          >
            <TutorGradingFixtureView />
          </ApplicationShell>
        </StudentExperienceProvider>
      </div>
    );
  }

  if (view === "admin-home") {
    const experience = createDemoExperience("/admin", {
      name: "Admin Operasional",
      email: "admin@zyx.id",
    });

    return (
      <div data-testid="mobile-preview-admin-home">
        <StudentExperienceProvider value={experience}>
          <OpsAiProvider initialOpen={false}>
            <ApplicationShell
              mobileTopNav={<AdminMobileTopNav />}
              mobileBottomNav={<AdminMobileBottomNav />}
            >
              <MobileTopTitleOverride title="Admin" />
              <ApplicationPage maxWidth="7xl">
                <AdminHomeMobile {...ADMIN_HOME_FIXTURE} />
              </ApplicationPage>
            </ApplicationShell>
          </OpsAiProvider>
        </StudentExperienceProvider>
      </div>
    );
  }

  const experience = createDemoExperience("/admin", {
    name: "Admin Operasional",
    email: "admin@zyx.id",
  });

  return (
    <div data-testid="mobile-preview-admin-more">
      <StudentExperienceProvider value={experience}>
        <OpsAiProvider initialOpen={false}>
          <ApplicationShell
            mobileTopNav={<AdminMobileTopNav />}
            mobileBottomNav={<AdminMobileBottomNav />}
          >
            <MobileTopTitleOverride title="Admin" />
            <ApplicationPage maxWidth="7xl">
              <AdminHomeMobile {...ADMIN_HOME_FIXTURE} />
            </ApplicationPage>
            <AdminMoreSheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen} />
          </ApplicationShell>
        </OpsAiProvider>
      </StudentExperienceProvider>
    </div>
  );
}
