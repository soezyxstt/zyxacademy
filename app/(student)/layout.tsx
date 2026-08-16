import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { env } from "@/lib/env";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-row bg-background overflow-x-clip">
      <PageOrnaments variant="about" />
      <StudentSidebar
        showStudyPath
        showMastery
        showLive={env.FEATURE_LIVE === "1"}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
