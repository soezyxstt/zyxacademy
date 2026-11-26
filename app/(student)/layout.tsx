import type { ReactNode } from "react";
import { StudentTabReuse } from "@/components/navigation/student/student-tab-reuse";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { env } from "@/lib/env";
import { CelebrationListener } from "@/components/gamification/celebration-listener";
import { AppDownloadReminder } from "@/components/native/app-download-reminder";
import { getDownloadChannel } from "@/lib/native/published-release";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <StudentTabReuse>
      <StudentApplicationShell personalizeTypographyAndSpacing showLive={env.FEATURE_LIVE === "1"} overlays={<><PushPermissionInit /><CelebrationListener /><AppDownloadReminder channel={getDownloadChannel()} /></>}>
        {children}
      </StudentApplicationShell>
    </StudentTabReuse>
  );
}
