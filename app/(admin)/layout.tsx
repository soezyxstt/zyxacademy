import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { OpsAiDrawer } from "@/components/admin/ops-ai/ops-ai-drawer";
import { OpsAiProvider } from "@/components/admin/ops-ai/ops-ai-context";
import { MobileNavbar } from "@/components/mobile-navbar";
import { CommandMenuProvider } from "@/components/command-menu";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) redirect("/");

  return (
    <CommandMenuProvider>
      <OpsAiProvider>
        <ApplicationShell
          sidebar={<AdminSidebar />}
          mobileNavigation={<MobileNavbar surface="admin" />}
          overlays={<OpsAiDrawer />}
          mainClassName="px-4 py-8 sm:px-6 lg:px-8 transition-[width] duration-75"
        >
          {children}
        </ApplicationShell>
      </OpsAiProvider>
    </CommandMenuProvider>
  );
}
