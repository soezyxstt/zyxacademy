"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Play,
  BookOpen,
  ClipboardList,
  Trophy,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem } from "@/components/sidebar-shell";

export function TutorSidebar() {
  const pathname = usePathname();

  const parts = pathname.split("/");
  let courseId: string | undefined = undefined;
  if (parts[1] === "tutor" && parts[2]) {
    courseId = parts[2];
  } else if (parts[1] === "courses" && parts[2]) {
    courseId = parts[2];
  }


  const navContent = (c: boolean) => {
    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto sidebar-scroll"
        )}
      >
        <NavItem
          href="/tutor"
          icon={LayoutDashboard}
          label="My courses"
          active={pathname === "/tutor"}
          collapsed={c}
        />

        {courseId && (
          <>
            {!c && (
              <>
                <div className="h-px bg-border/50 my-3 shrink-0 w-full" />
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-sans">
                  Kelas Aktif
                </p>
              </>
            )}
            {c && <div className="h-px bg-border/50 my-2 shrink-0 w-full" />}

            <NavItem
              href={`/tutor/${courseId}`}
              icon={LayoutDashboard}
              label="Dashboard Kelas"
              active={pathname === `/tutor/${courseId}`}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/materials`}
              icon={BookOpen}
              label="Kelola Materi"
              active={pathname.includes("/materials")}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/quizzes`}
              icon={ClipboardList}
              label="Kelola Kuis"
              active={pathname.includes("/quizzes")}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/tryouts`}
              icon={Trophy}
              label="Kelola Tryout"
              active={pathname.includes("/tryouts")}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/grading`}
              icon={CheckSquare}
              label="Penilaian Tryout"
              active={pathname.includes("/grading")}
              collapsed={c}
            />

            <NavItem
              href={`/courses/${courseId}/live/host`}
              icon={Play}
              label="Live Quiz Console"
              active={pathname.includes("/live/host")}
              collapsed={c}
            />
          </>
        )}

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <SidebarShell
      collapsedKey="tutor-sidebar-collapsed"
      logoHref="/tutor"
      logoLabel="My courses"
      nav={navContent}
    />
  );
}

