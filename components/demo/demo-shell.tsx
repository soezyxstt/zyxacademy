import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckSquare,
  FileText,
  Layers3,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { cn } from "@/lib/utils";
import type { DemoCourseSummary } from "@/app/(marketing)/demo/demo-data";

export type DemoView = "dashboard" | "article" | "diktat" | "flashcards" | "quiz" | "zyra";

const demoNav: Array<{ view: Exclude<DemoView, "dashboard">; label: string; icon: typeof BookOpen }> = [
  { view: "article", label: "Artikel", icon: BookOpen },
  { view: "diktat", label: "Diktat", icon: FileText },
  { view: "flashcards", label: "Flashcard", icon: Layers3 },
  { view: "quiz", label: "Kuis", icon: CheckSquare },
  { view: "zyra", label: "Zyra", icon: MessageCircle },
];

export function demoSignInHref(nextPath: string): string {
  const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/dashboard";
  return `/sign-in?next=${encodeURIComponent(safeNextPath)}`;
}

export function demoCoursePath(courseId: string): string {
  return `/courses/${encodeURIComponent(courseId)}`;
}

export function DemoAuthCta({
  nextPath,
  label = "Masuk untuk lanjut",
}: {
  nextPath: string;
  label?: string;
}) {
  return (
    <Button asChild size="sm" className="gap-1.5 rounded-lg">
      <Link href={demoSignInHref(nextPath)}>
        {label}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function DemoShell({
  course,
  activeView,
  children,
}: {
  course: DemoCourseSummary;
  activeView: DemoView;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden bg-muted/20">
      <PageOrnaments variant="about" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:pb-24 md:pt-14 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-body-xs font-semibold text-muted-foreground">{course.category}</p>
            <h1 className="mt-3 max-w-3xl font-heading text-h5 font-bold tracking-tight text-foreground sm:text-h4">
              {course.title}
            </h1>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Bab {course.chapterNumber}, {course.chapterTitle}
            </p>
          </div>
          <div className="shrink-0">
            <DemoAuthCta nextPath={demoCoursePath(course.id)} />
          </div>
        </div>

        <nav
          aria-label="Navigasi demo"
          className="mt-5 flex flex-wrap gap-2 rounded-xl border border-border bg-card/70 p-2 shadow-xs"
        >
          <Link
            href="/demo"
            aria-current={activeView === "dashboard" ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)]",
              activeView === "dashboard"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Brain className="size-4" aria-hidden="true" />
            Ringkasan
          </Link>
          {demoNav.map(({ view, label, icon: Icon }) => (
            <Link
              key={view}
              href={`/demo/${view}`}
              aria-current={activeView === view ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)]",
                activeView === view
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <main className="mt-8">{children}</main>
      </div>
    </div>
  );
}
