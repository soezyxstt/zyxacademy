"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Play,
  BookOpen,
  ClipboardList,
  Trophy,
  CheckSquare,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem, SidebarTooltip } from "@/components/sidebar-shell";

export function TutorSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const parts = pathname.split("/");
  let courseId: string | undefined = undefined;
  if (parts[1] === "tutor" && parts[2]) {
    courseId = parts[2];
  } else if (parts[1] === "courses" && parts[2]) {
    courseId = parts[2];
  }

  const topSection = (c: boolean) => {
    if (!session?.user) return null;

    return (
      <div className="shrink-0">
        <SidebarTooltip label={`${session.user.name} (${session.user.email})`} collapsed={c}>
          <div
            className={cn(
              "mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-border/70 bg-muted/40 p-2.5 transition-all duration-300",
              c && "justify-center p-1.5 mx-auto size-10"
            )}
          >
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name}
                width={28}
                height={28}
                className="size-7 shrink-0 rounded-full object-cover ring-2 ring-brand-primary/20"
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                {session.user.name?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
            )}
            {!c && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-body-xs font-semibold text-foreground">
                  {session.user.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
            )}
          </div>
        </SidebarTooltip>
      </div>
    );
  };

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
      topSection={topSection}
    />
  );
}
