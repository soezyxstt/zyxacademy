"use client";

import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { MobileNavbar } from "@/components/mobile-navbar";
import { CommandMenuProvider } from "@/components/command-menu";

export function StudentApplicationShell({ children, showLive, overlays }: { children: ReactNode; showLive: boolean; overlays?: ReactNode }) {
  return <CommandMenuProvider><TutorProvider><ApplicationShell
    className="flex-1 min-w-0"
    sidebar={<StudentSidebar showStudyPath showMastery showLive={showLive} />}
    mobileNavigation={<MobileNavbar surface="student" />}
    overlays={overlays}
  >{children}</ApplicationShell></TutorProvider></CommandMenuProvider>;
}
