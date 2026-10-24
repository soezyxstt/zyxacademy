"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { openMobileSidebar } from "@/components/sidebar-shell";
import { useCommandMenu } from "@/components/command-menu";
import { useTranslations } from "@/lib/i18n/client";

export function getRouteTitle(
  pathname: string,
  surface?: "admin" | "student" | "tutor",
  translate?: (key: string) => string
): string {
  const roleTitle = (namespace: "admin" | "tutor", key: string, fallback: string) =>
    translate?.(`${namespace}.routeTitles.${key}`) ?? fallback;
  if (pathname === "/admin") return roleTitle("admin", "dashboard", "Admin dashboard");
  if (pathname.startsWith("/admin/blog")) return roleTitle("admin", "blog", "Manage blog");
  if (pathname.startsWith("/admin/courses/")) {
    const match = pathname.match(/^\/admin\/courses\/([^/]+)(.*)$/);
    if (match && match[1]) {
      const subpath = match[2] || "";
      if (subpath.startsWith("/documents")) return roleTitle("admin", "documents", "Documents");
      if (subpath.startsWith("/videos")) return roleTitle("admin", "videos", "Videos");
      if (subpath.startsWith("/quizzes")) return roleTitle("admin", "quizzes", "Quizzes");
      if (subpath.startsWith("/tryouts")) return roleTitle("admin", "tryouts", "Tryouts");
      if (subpath.startsWith("/questions")) return roleTitle("admin", "questions", "Questions");
      if (subpath.startsWith("/flashcards")) return roleTitle("admin", "flashcards", "Flashcards");
      if (subpath.startsWith("/results")) return roleTitle("admin", "results", "Results");
      if (subpath.startsWith("/leaderboard")) return roleTitle("admin", "leaderboard", "Leaderboard");
      if (subpath.startsWith("/analytics")) return roleTitle("admin", "analytics", "Analytics");
      if (subpath.startsWith("/review")) return roleTitle("admin", "review", "Material review");
      if (subpath.startsWith("/settings")) return roleTitle("admin", "settings", "Settings");
      if (subpath === "" || subpath === "/") return roleTitle("admin", "chapters", "Chapters");
      return roleTitle("admin", "courses", "Courses");
    }
  }
  if (pathname.startsWith("/admin/courses")) return roleTitle("admin", "courses", "Courses");
  if (pathname.startsWith("/admin/schedules")) return roleTitle("admin", "schedules", "Shared schedule");
  if (pathname.startsWith("/admin/materials/review")) return roleTitle("admin", "review", "Material review");
  if (pathname.startsWith("/admin/materials")) return roleTitle("admin", "materials", "Course materials");
  if (pathname.startsWith("/admin/questions")) return roleTitle("admin", "questions", "Questions");
  if (pathname.startsWith("/admin/quizzes")) return roleTitle("admin", "quizzes", "Quizzes");
  if (pathname.startsWith("/admin/leaderboard")) return roleTitle("admin", "leaderboard", "Leaderboard");
  if (pathname.startsWith("/admin/quiz-insights")) return roleTitle("admin", "quizInsights", "Quiz insights");
  if (pathname.startsWith("/admin/jobs")) return roleTitle("admin", "jobs", "Question generation");
  if (pathname.startsWith("/admin/distractors")) return roleTitle("admin", "distractors", "Distractors");
  if (pathname.startsWith("/admin/pricing")) return roleTitle("admin", "pricing", "Pricing calculator");
  if (pathname.startsWith("/admin/forms")) return roleTitle("admin", "forms", "Form Studio");
  if (pathname.startsWith("/admin/meet")) return roleTitle("admin", "meet", "Meet");
  if (pathname.startsWith("/admin/media")) return roleTitle("admin", "media", "Media library");
  if (pathname.startsWith("/admin/tautan")) return roleTitle("admin", "links", "Public links");
  if (pathname.startsWith("/admin/users")) return roleTitle("admin", "users", "Users");
  if (pathname.startsWith("/admin/groups")) return roleTitle("admin", "groups", "Study groups");
  if (pathname.startsWith("/admin/tokens")) return roleTitle("admin", "tokens", "Activation tokens");
  if (pathname.startsWith("/admin/notifications")) return roleTitle("admin", "notifications", "Notifications");
  if (pathname.startsWith("/admin/ops/analytics")) return roleTitle("admin", "zyraAnalytics", "Zyra analytics");
  if (pathname.startsWith("/admin/ops/feature-usage")) return roleTitle("admin", "featureUsage", "Feature usage");
  if (pathname.startsWith("/admin/ops/flags")) return roleTitle("admin", "featureFlags", "Feature flags");
  if (pathname.startsWith("/admin/ops/keys")) return roleTitle("admin", "apiKeys", "API keys");
  if (pathname.startsWith("/admin/ops/short-links")) return roleTitle("admin", "shortLinks", "Short links");
  if (pathname.startsWith("/admin/ops/tutor-activity")) return roleTitle("admin", "tutorActivity", "Tutor activity");
  if (pathname.startsWith("/admin/ops/web-analytics")) return roleTitle("admin", "webAnalytics", "Web analytics");
  if (pathname.startsWith("/admin/ops")) return roleTitle("admin", "ops", "Ops monitor");
  if (pathname.startsWith("/admin/tutorial-pka/registrations")) return roleTitle("admin", "pkaRegistrations", "PKA registrations");
  if (pathname.startsWith("/admin/tutorial-pka/announcements")) return roleTitle("admin", "pkaAnnouncements", "PKA announcements");
  if (pathname.startsWith("/admin/tutorial-pka/schedules")) return roleTitle("admin", "pkaSchedules", "PKA live schedule");
  if (pathname.startsWith("/admin/tutorial-pka")) return roleTitle("admin", "pka", "PKA tutorials");
  if (pathname.startsWith("/admin/bundles/idea")) return roleTitle("admin", "ideaBundles", "Idea Bundles");
  if (pathname.startsWith("/admin/bundles/product")) return roleTitle("admin", "productBundles", "Product Bundles");

  if (pathname === "/tutor") return roleTitle("tutor", "dashboardTitle", "Tutor dashboard");
  if (pathname.startsWith("/tutor/schedule")) return roleTitle("tutor", "scheduleTitle", "Teaching schedule");
  if (pathname.startsWith("/tutor")) {
    if (pathname.includes("/videos")) return roleTitle("tutor", "videos", "Videos");
    if (pathname.includes("/materials")) return roleTitle("tutor", "documents", "Documents");
    if (pathname.includes("/participants")) return roleTitle("tutor", "participants", "Participants and groups");
    if (pathname.includes("/quizzes")) return roleTitle("tutor", "quizzes", "Quizzes");
    if (pathname.includes("/live")) return roleTitle("tutor", "liveQuiz", "Live quiz");
    if (pathname.includes("/grading")) return roleTitle("tutor", "tryoutGrading", "Tryout grading");
    return roleTitle("tutor", "overview", "Overview");
  }

  const t = (key: string, fallback: string) => translate?.(`routeTitles.${key}`) ?? fallback;
  if (pathname === "/dashboard/schedule") return t("schedule", "Jadwal Belajar");
  if (pathname.startsWith("/dashboard/groups")) return t("groups", "Kelompok Belajar");
  if (pathname === "/dashboard") return t("dashboard", "Dashboard Siswa");
  if (pathname.startsWith("/courses/tutorial-pka")) return "Tutorial PKA";
  if (pathname.startsWith("/courses")) {
    if (pathname.includes("/video")) return t("video", "Video");
    if (pathname.includes("/material")) return t("documents", "Dokumen");
    if (pathname.includes("/quiz")) return t("quiz", "Kuis");
    if (pathname.includes("/flashcard")) return t("flashcard", "Flashcard");
    if (pathname.includes("/tryout")) return t("tryout", "Tryout");
    if (pathname.includes("/progress")) return t("progress", "Progres");
    if (pathname.includes("/mastery")) return t("mastery", "Penguasaan");
    if (pathname.includes("/path")) return t("studyPath", "Alur Belajar");
    if (pathname.includes("/my-results")) return t("examResults", "Hasil Ujian");
    if (pathname.includes("/live")) return t("liveQuiz", "Kuis Langsung");
    return t("course", "Kelas");
  }
  if (pathname.startsWith("/leaderboard")) return t("leaderboard", "Papan Peringkat");
  if (pathname.startsWith("/calendar")) return t("calendar", "Kalender");
  if (pathname.startsWith("/feedback")) return t("feedback", "Umpan Balik");
  if (pathname.startsWith("/profile")) return t("profile", "Profil");
  if (pathname.startsWith("/settings")) return t("settings", "Pengaturan");

  if (surface === "admin") return "Panel Admin";
  if (surface === "tutor") return "Panel Pengajar";
  return t("dashboard", "Dashboard Siswa");
}

export function setMobileNavTitle(title: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:set-mobile-title", { detail: title }));
  }
}

export type MobileNavbarProps = {
  surface?: "admin" | "student" | "tutor";
  className?: string;
};

function isMobileSidebarBackdrop(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement
    && target.classList.contains("fixed")
    && target.classList.contains("inset-0")
    && target.classList.contains("z-40")
    && target.classList.contains("bg-black/50")
    && target.classList.contains("md:hidden");
}

export function MobileNavbar({ surface, className }: MobileNavbarProps) {
  const pathname = usePathname();
  const t = useTranslations("student");
  const tAdmin = useTranslations("admin");
  const tTutor = useTranslations("tutor");
  const { setOpen: setSearchOpen } = useCommandMenu();
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleSetTitle = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setCustomTitle(detail);
    };
    const handleClearTitle = () => setCustomTitle(null);

    window.addEventListener("zyx:set-mobile-title", handleSetTitle);
    window.addEventListener("zyx:clear-mobile-title", handleClearTitle);
    return () => {
      window.removeEventListener("zyx:set-mobile-title", handleSetTitle);
      window.removeEventListener("zyx:clear-mobile-title", handleClearTitle);
    };
  }, []);

  useEffect(() => {
    const handleBackdropPointerDown = (event: PointerEvent) => {
      if (!isMobileSidebarBackdrop(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.target.click();
    };

    document.addEventListener("pointerdown", handleBackdropPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleBackdropPointerDown, true);
  }, []);

  useEffect(() => {
    titleRef.current?.scrollTo({ left: 0 });
  }, [pathname]);

  const translateRoute = (key: string) => {
    if (key.startsWith("admin.")) return tAdmin(key.slice("admin.".length));
    if (key.startsWith("tutor.")) return tTutor(key.slice("tutor.".length));
    return t(key);
  };
  const displayTitle = customTitle || getRouteTitle(pathname, surface, translateRoute);

  useEffect(() => {
    const checkOverflow = () => {
      const title = titleRef.current;
      setIsTitleOverflowing(Boolean(title && title.scrollWidth - title.clientWidth > 1));
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [displayTitle]);

  const revealFullTitle = () => {
    const title = titleRef.current;
    if (!title) return;

    const maxScroll = title.scrollWidth - title.clientWidth;
    if (maxScroll <= 1) return;

    const atEnd = title.scrollLeft >= maxScroll - 1;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    title.scrollTo({
      left: atEnd ? 0 : maxScroll,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  const titleContent = (
    <span
      ref={titleRef}
      className="block min-w-0 overflow-x-hidden whitespace-nowrap font-heading text-body-sm font-semibold leading-tight tracking-tight text-foreground [text-overflow:ellipsis]"
    >
      {displayTitle}
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-13 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/80 bg-background/95 px-3 backdrop-blur-md md:!hidden sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <button
          type="button"
          onClick={openMobileSidebar}
          aria-label={t("mobile.openNavigation")}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Menu className="size-4.5" />
        </button>

        {isTitleOverflowing ? (
          <button
            type="button"
            onClick={revealFullTitle}
            aria-label={t("mobile.showFullTitle", { title: displayTitle })}
            title={displayTitle}
            className="min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
          >
            {titleContent}
          </button>
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden text-left" title={displayTitle}>
            {titleContent}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={t("mobile.search")}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Search className="size-4" />
        </button>
      </div>
    </header>
  );
}
