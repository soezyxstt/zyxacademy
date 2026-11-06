import type { ReactNode } from "react";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { env } from "@/lib/env";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <StudentApplicationShell showLive={env.FEATURE_LIVE === "1"} overlays={<PushPermissionInit />}>
      {children}
    </StudentApplicationShell>
  );
}
