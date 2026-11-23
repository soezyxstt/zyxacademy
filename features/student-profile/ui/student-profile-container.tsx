"use client";

import type { ReactNode } from "react";
import { ViewportSwitch } from "@/components/navigation";
import type { StudentProfileMobileHubProps } from "@/features/student-profile/model/types";
import { StudentProfileDesktop } from "./desktop/student-profile-desktop";
import { StudentProfileMobile } from "./mobile/student-profile-mobile";

export interface StudentProfileContainerProps {
  desktopView: ReactNode;
  mobileProps: StudentProfileMobileHubProps;
}

export function StudentProfileContainer({
  desktopView,
  mobileProps,
}: StudentProfileContainerProps) {
  return (
    <ViewportSwitch
      desktop={() => <StudentProfileDesktop desktopView={desktopView} />}
      mobile={() => <StudentProfileMobile {...mobileProps} />}
      fallback={<StudentProfileDesktop desktopView={desktopView} />}
    />
  );
}
