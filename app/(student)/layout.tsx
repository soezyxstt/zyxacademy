import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { env } from "@/lib/env";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { MobileNavbar } from "@/components/mobile-navbar";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";
import { CommandMenuProvider } from "@/components/command-menu";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <CommandMenuProvider>
      <div className="relative flex min-h-screen flex-col md:flex-row bg-background overflow-x-clip">
        <TutorProvider>
          <PageOrnaments variant="about" />
          <StudentSidebar
            showStudyPath
            showMastery
            showLive={env.FEATURE_LIVE === "1"}
          />
          <div className="relative z-10 flex flex-1 flex-col min-w-0">
            <MobileNavbar surface="student" />
            <main
              id="main-content"
              tabIndex={-1}
              className="relative min-w-0 flex-1 focus:outline-none"
            >
              {children}
            </main>
          </div>
          <PushPermissionInit />
        </TutorProvider>
      </div>
    </CommandMenuProvider>
  );
}
