"use client";

import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { TutorProvider } from "@/components/course/tutor-drawer";
import {
  StudentMobileBottomNav,
  StudentMobileTopNav,
} from "@/components/navigation/student";
import { GuidedTourProvider } from "@/components/onboarding/guided-tour";
import { CommandMenuProvider } from "@/components/command-menu";

export function StudentApplicationShell({ children, showLive, overlays, personalizeTypographyAndSpacing }: { children: ReactNode; showLive: boolean; overlays?: ReactNode; personalizeTypographyAndSpacing?: boolean }) {
  return <GuidedTourProvider role="student"><CommandMenuProvider><TutorProvider><ApplicationShell
    personalizeTypographyAndSpacing={personalizeTypographyAndSpacing}
    className="flex-1 min-w-0"
    desktopSidebar={<StudentSidebar showStudyPath showMastery showLive={showLive} />}
    mobileTopNav={<StudentMobileTopNav />}
    mobileBottomNav={<StudentMobileBottomNav />}
    overlays={overlays}
  >{children}</ApplicationShell></TutorProvider></CommandMenuProvider></GuidedTourProvider>;
}
