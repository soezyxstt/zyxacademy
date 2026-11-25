import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, FileText, GraduationCap, Layers, MessageSquareText } from "lucide-react";
import { GuidedTourFlow } from "@/components/onboarding/guided-tour";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { loadMessages } from "@/lib/i18n/catalogs";
import { useTranslations } from "@/lib/i18n/client";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { DeviceNotificationSettings } from "@/components/notifications/device-notification-settings";
import { StudentSidebar } from "@/components/student-sidebar";
import { TutorSidebar } from "@/components/tutor/tutor-sidebar";
import { StudentMobileTopNav, StudentMobileBottomNav } from "@/components/navigation/student";
import { CourseMobileTabNav } from "@/components/navigation/student/course-mobile-tab-nav";
import { TutorMobileTopNav, TutorMobileBottomNav, TutorMobileCourseTabNav } from "@/components/navigation/tutor";
import { CommandMenuProvider } from "@/components/command-menu";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { SettingsClient } from "@/app/(student)/settings/settings-client";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { DialogHistoryRuntime } from "@/components/ui/dialog-history-runtime";
import { Toaster } from "@/components/ui/toast";
import { usePathname } from "./navigation";
import { fixture, fixtureCourse } from "./config";
import { installFixtureApi } from "./api";
import { FixtureSchedule } from "./schedule";

const assignedCourses = fixture.hasCourse ? [fixtureCourse] : [];
const words = fixture.locale === "en" ? {
  learn: "Continue learning", courses: "Your courses", coursesEmpty: "No courses yet", courseStart: "Open course",
  documents: "Documents", quizzes: "Quizzes", flashcards: "Flashcards", discussion: "Discussions",
  questionsEmpty: "No questions yet", docs: "Tutor guide", lessons: ["Inequalities and functions", "Function limits", "Derivatives"],
  progress: "Learning progress", profile: "Profile", materials: "Learning material", ready: "Ready to study",
} : {
  learn: "Lanjut belajar", courses: "Kelas kamu", coursesEmpty: "Belum ada kelas", courseStart: "Buka kelas",
  documents: "Dokumen", quizzes: "Kuis", flashcards: "Flashcard", discussion: "Diskusi",
  questionsEmpty: "Belum ada pertanyaan", docs: "Panduan tutor", lessons: ["Pertaksamaan dan fungsi", "Limit fungsi", "Turunan"],
  progress: "Progres belajar", profile: "Profil", materials: "Materi belajar", ready: "Siap belajar",
};

function FixtureDiscussions() {
  const [query, setQuery] = useState("");
  return <ApplicationPage><div className="flex justify-end"><SearchBar value={query} onSearch={setQuery} placeholder={fixture.locale === "en" ? "Search discussions" : "Cari diskusi"} /></div><AdminEmptyState icon={MessageSquareText} title={words.questionsEmpty} /></ApplicationPage>;
}

function RouteContent() {
  const pathname = usePathname();
  const t = useTranslations("tutor.navigation");
  const coursePath = fixture.role === "tutor" ? `/tutor/${fixture.courseId}` : `/courses/${fixture.courseId}`;
  if (pathname === "/settings") return <SettingsClient />;
  if (pathname === "/settings/notifications") return <ApplicationPage><PageHeader title={fixture.locale === "en" ? "Notifications" : "Notifikasi"} /><DeviceNotificationSettings /></ApplicationPage>;
  if (pathname.endsWith("/schedule")) return <ApplicationPage><FixtureSchedule /></ApplicationPage>;
  if (pathname.endsWith("/discussions")) return <FixtureDiscussions />;
  if (pathname === "/profile") return <ApplicationPage><div className="space-y-5 py-6"><div className="flex items-center gap-4"><div className="flex size-16 items-center justify-center rounded-full bg-muted font-heading text-h5">N</div><div><h1 className="font-heading text-h5">Nadia Pratama</h1><p className="text-body-sm text-muted-foreground">nadia@example.test</p></div></div><div className="border-t border-border pt-5"><h2 className="font-heading text-body-base font-semibold">{words.progress}</h2><p className="mt-2 text-body-sm text-muted-foreground">Matematika 1 · 3 / 12</p></div></div></ApplicationPage>;
  if (pathname === "/tutor/docs") return <ApplicationPage><h1 className="sr-only">{words.docs}</h1><div className="divide-y divide-border"><Link href="/tutor/docs/ruang-kerja-tutor" className="flex items-center gap-3 py-5 text-body-sm"><BookOpen className="size-4 text-muted-foreground" />{fixture.locale === "en" ? "Tutor workspace" : "Ruang kerja tutor"}<ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link>{[t("documents"), t("quizzes"), t("quizGrading")].map(label => <div key={label} className="flex items-center gap-3 py-5 text-body-sm"><BookOpen className="size-4 text-muted-foreground" />{label}<ChevronRight className="ml-auto size-4 text-muted-foreground" /></div>)}</div></ApplicationPage>;
  if (pathname.startsWith("/tutor/docs/")) return <ApplicationPage><article className="max-w-2xl space-y-4 py-4"><h1 className="font-heading text-h5">{fixture.locale === "en" ? "Tutor workspace" : "Ruang kerja tutor"}</h1><p className="text-body-base text-muted-foreground">{fixture.locale === "en" ? "Open a course to review materials, quizzes, and student work." : "Buka mata kuliah untuk melihat materi, kuis, dan hasil kerja siswa."}</p><h2 className="font-heading text-body-base font-semibold">{t("schedule")}</h2><p className="text-body-sm text-muted-foreground">{fixture.locale === "en" ? "Manage teaching availability and review session requests from the schedule." : "Atur waktu mengajar dan tinjau permintaan sesi melalui jadwal."}</p></article></ApplicationPage>;
  if (pathname.startsWith(`${coursePath}/`) || pathname === coursePath) {
    const isQuiz = pathname.includes("/quiz");
    const isFlashcard = pathname.endsWith("/flashcard");
    const heading = isQuiz ? words.quizzes : isFlashcard ? words.flashcards : words.documents;
    const Icon = isQuiz ? GraduationCap : isFlashcard ? Layers : FileText;
    return <ApplicationPage><div className="space-y-5 py-3"><h1 className="sr-only">{fixtureCourse.title}</h1><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-body-base font-semibold">{heading}</h2><span className="text-body-xs text-muted-foreground">MA1101</span></div><div className="divide-y divide-border">{words.lessons.map((lesson, index) => <div key={lesson} className="flex items-center gap-3 py-5"><Icon className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-body-sm font-medium">{lesson}</p><p className="mt-1 text-body-xs text-muted-foreground">{index + 1} / 3</p></div><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></div>)}</div></div></ApplicationPage>;
  }
  return <ApplicationPage><div className="space-y-6 py-3"><h1 className="sr-only">{fixture.role === "tutor" ? "Tutor" : "Dashboard"}</h1><section className="space-y-3"><h2 className="font-heading text-body-base font-semibold">{fixture.role === "tutor" ? words.courses : words.learn}</h2>{fixture.hasCourse ? <Link href={coursePath} className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted"><BookOpen className="size-5" /></div><div className="min-w-0 flex-1"><p className="text-body-sm font-semibold">{fixtureCourse.title}</p><p className="mt-1 text-body-xs text-muted-foreground">MA1101</p></div><ChevronRight className="size-4 shrink-0" /></Link> : <AdminEmptyState icon={BookOpen} title={words.coursesEmpty} />}</section><section className="space-y-3 border-t border-border pt-5"><h2 className="font-heading text-body-base font-semibold">{fixture.role === "tutor" ? "Tutorial" : words.materials}</h2><div className="flex items-center gap-3 text-body-sm"><CalendarDays className="size-4 text-muted-foreground" /><span>{fixture.locale === "en" ? "Wednesday, 25 November" : "Rabu, 25 November"}</span></div><Button asChild variant="outline"><Link href={fixture.role === "tutor" ? "/tutor/schedule" : "/dashboard/schedule"}>{fixture.locale === "en" ? "View schedule" : "Lihat jadwal"}</Link></Button></section></div></ApplicationPage>;
}

function Shell() {
  const pathname = usePathname();
  const studentCourse = fixture.role === "student" && pathname.startsWith(`/courses/${fixture.courseId}`);
  const content = <ApplicationShell
    className="min-w-0 flex-1"
    personalizeTypographyAndSpacing
    desktopSidebar={fixture.role === "student" ? <StudentSidebar showStudyPath showMastery showLive /> : <TutorSidebar assignedCourses={assignedCourses} />}
    mobileTopNav={fixture.role === "student" ? <StudentMobileTopNav /> : <TutorMobileTopNav assignedCourses={assignedCourses} />}
    mobileBottomNav={fixture.role === "student" ? <StudentMobileBottomNav /> : <TutorMobileBottomNav assignedCourses={assignedCourses} />}
  >
    {studentCourse && <CourseMobileTabNav courseId={fixture.courseId} courseTitle={fixtureCourse.title} showLive />}
    {fixture.role === "tutor" && <TutorMobileCourseTabNav assignedCourses={assignedCourses} />}
    <RouteContent />
  </ApplicationShell>;
  return fixture.role === "student" ? <TutorProvider>{content}</TutorProvider> : content;
}

async function boot() {
  installFixtureApi();
  if (window.location.pathname === "/") window.history.replaceState({}, "", `${fixture.role === "tutor" ? "/tutor" : "/dashboard"}${window.location.search}`);
  document.documentElement.lang = fixture.locale;
  document.documentElement.classList.toggle("dark", fixture.theme === "dark");
  const messages = await loadMessages(fixture.locale);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme={fixture.theme} forcedTheme={fixture.theme} enableSystem={false}>
      <LocaleProvider initialLocale={fixture.locale} initialMessages={messages} persistLocale={async () => ({ success: true })}>
        <QueryClientProvider client={client}>
          <GuidedTourFlow userId={fixture.userId} role={fixture.role} candidateCourseId={fixture.hasCourse ? fixture.courseId : null}>
            <CommandMenuProvider><Shell /></CommandMenuProvider>
          </GuidedTourFlow>
          <Toaster />
          <DialogHistoryRuntime />
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

void boot();
