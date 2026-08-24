import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { AdminSidebar } from "@/components/admin-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { OpsAiDrawer } from "@/components/admin/ops-ai/ops-ai-drawer";
import { OpsAiTrigger } from "@/components/admin/ops-ai/ops-ai-trigger";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) redirect("/");

  return (
    <div className="relative flex min-h-screen flex-row overflow-x-clip bg-background">
      <PageOrnaments variant="about" />
      <AdminSidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar with Ops AI Trigger */}
        <header className="sticky top-0 z-20 flex h-12 w-full items-center justify-between border-b border-border/80 bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-body-xs text-muted-foreground font-mono">
            <span className="font-semibold text-foreground">Console</span>
          </div>
          <div className="flex items-center gap-2">
            <OpsAiTrigger />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
      <OpsAiDrawer />
    </div>
  );
}
