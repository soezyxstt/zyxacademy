"use client";

import { ViewportSwitch } from "@/components/navigation";
import { StudentDashboardDesktop } from "@/features/student-dashboard/ui/desktop/student-dashboard-desktop";
import { StudentDashboardMobile } from "@/features/student-dashboard/ui/mobile/student-dashboard-mobile";
import type {
  StreamedStudentDashboardContentProps,
  StudentDashboardDataProps,
  StudentDashboardViewProps,
} from "@/features/student-dashboard/model/types";

export type StudentDashboardContentProps = StudentDashboardDataProps;
export type { StreamedStudentDashboardContentProps };

export function StudentDashboardContent(props: StudentDashboardViewProps) {
  return (
    <ViewportSwitch
      desktop={() => <StudentDashboardDesktop {...props} />}
      mobile={() => <StudentDashboardMobile {...props} />}
    />
  );
}
