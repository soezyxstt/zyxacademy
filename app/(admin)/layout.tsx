import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { AdminSidebar } from "@/components/admin-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { OpsAiDrawer } from "@/components/admin/ops-ai/ops-ai-drawer";
import { OpsAiProvider } from "@/components/admin/ops-ai/ops-ai-context";
import { MobileNavbar } from "@/components/mobile-navbar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) redirect("/");

  return (
    <OpsAiProvider>
      <div className="relative flex min-h-screen flex-col md:flex-row overflow-x-clip bg-background">
        <PageOrnaments variant="about" />
        <AdminSidebar />
        <div className="relative z-10 flex flex-1 flex-col min-w-0">
          <MobileNavbar surface="admin" />
          <main
            id="main-content"
            tabIndex={-1}
            className="relative min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8 transition-[width] duration-75"
          >
            {children}
          </main>
        </div>
        <OpsAiDrawer />
      </div>
    </OpsAiProvider>
  );
}
