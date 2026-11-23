"use client";

import { ViewportSwitch } from "@/components/navigation";
import type { AdminHomeViewProps } from "@/features/admin-home/model/types";
import { AdminHomeDesktop } from "./desktop/admin-home-desktop";
import { AdminHomeMobile } from "./mobile/admin-home-mobile";

export function AdminHomeContainer(props: AdminHomeViewProps) {
  return (
    <ViewportSwitch
      desktop={() => <AdminHomeDesktop {...props} />}
      mobile={() => <AdminHomeMobile {...props} />}
    />
  );
}
