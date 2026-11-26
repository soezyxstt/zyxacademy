import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasPeran } from "@/lib/auth/request-cache";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { OpsAiDrawer } from "@/components/admin/ops-ai/ops-ai-drawer";
import { OpsAiProvider } from "@/components/admin/ops-ai/ops-ai-context";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";
import { CommandMenuProvider } from "@/components/command-menu";
import { ApplicationPage } from "@/components/application-page";
import {
  AdminMobileBottomNav,
  AdminMobileSubTabNav,
  AdminMobileTopNav,
} from "@/components/navigation/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user) redirect("/");
  await ensureLegacyIdentity(session.user.id);
  if (!(await hasPeran(session.user.id, "admin"))) redirect("/");

  return (
    <CommandMenuProvider>
      <OpsAiProvider>
        <ApplicationShell
          showOrnaments={false}
          desktopSidebar={<AdminSidebar />}
          mobileTopNav={<AdminMobileTopNav />}
          mobileBottomNav={<AdminMobileBottomNav />}
          overlays={<><OpsAiDrawer accountId={session.user.id} /><PushPermissionInit /></>}
          mainClassName="transition-[width] duration-75"
        >
          <AdminMobileSubTabNav />
          <ApplicationPage>{children}</ApplicationPage>
        </ApplicationShell>
      </OpsAiProvider>
    </CommandMenuProvider>
  );
}
