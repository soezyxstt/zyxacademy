import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { MobileNavbar } from "@/components/mobile-navbar";
import { env } from "@/lib/env";
import { TutorProvider } from "@/components/course/tutor-drawer";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <MobileNavProvider>
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
      </TutorProvider>
    </MobileNavProvider>
  );
}
