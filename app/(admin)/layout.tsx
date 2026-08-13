import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { AdminSidebar } from "@/components/admin-sidebar";
import { PageOrnaments } from "@/components/ui/page-ornaments";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (env.FEATURE_PERAN_V2 === "1") {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) redirect("/");
  }

  return (
    <div className="relative flex min-h-screen flex-row overflow-x-clip bg-background">
      <PageOrnaments variant="about" />
      <AdminSidebar />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
