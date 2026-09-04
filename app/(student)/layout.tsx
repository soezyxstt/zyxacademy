import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { env } from "@/lib/env";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { MobileNavbar } from "@/components/mobile-navbar";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";
import { CommandMenuProvider } from "@/components/command-menu";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <CommandMenuProvider>
      <TutorProvider>
        <ApplicationShell
          sidebar={
            <StudentSidebar
              showStudyPath
              showMastery
              showLive={env.FEATURE_LIVE === "1"}
            />
          }
          mobileNavigation={<MobileNavbar surface="student" />}
          overlays={<PushPermissionInit />}
        >
          {children}
        </ApplicationShell>
      </TutorProvider>
    </CommandMenuProvider>
  );
}
