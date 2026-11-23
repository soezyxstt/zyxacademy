"use client";

import { ViewportSwitch } from "@/components/navigation";
import { TutorDashboardDesktop } from "@/features/tutor-dashboard/ui/desktop/tutor-dashboard-desktop";
import { TutorDashboardMobile } from "@/features/tutor-dashboard/ui/mobile/tutor-dashboard-mobile";
import type { TutorDashboardViewProps } from "@/features/tutor-dashboard/model/types";

export function TutorDashboardContent(props: TutorDashboardViewProps) {
  return (
    <ViewportSwitch
      desktop={() => <TutorDashboardDesktop {...props} />}
      mobile={() => <TutorDashboardMobile {...props} />}
    />
  );
}
