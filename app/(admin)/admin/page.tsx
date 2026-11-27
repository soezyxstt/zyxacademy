import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { LayoutDashboard } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminHomeContainer } from "@/features/admin-home/ui/admin-home-container";
import { getAdminHomeDashboard } from "@/features/admin-home/model/dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const metadataText = await getTranslations("admin");
  return { title: pageTitle(metadataText("metadata.homeTitle")), description: metadataText("metadata.homeDescription") };
}

async function AdminHomeContent() {
  return <AdminHomeContainer {...await getAdminHomeDashboard()} />;
}

function AdminHomeLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-5">
      <AdminPageHeader icon={LayoutDashboard} title="Admin" actions={<Skeleton className="size-9" />} />
      <div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
        {[3, 2, 6, 2, 6].map((rows, section) => (
          <div key={section} className="mb-5 inline-block w-full align-top">
            <div className="border-b border-border pb-2"><Skeleton className="h-5 w-40" /></div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-4 w-36 max-w-full" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return <Suspense fallback={<AdminHomeLoading />}><AdminHomeContent /></Suspense>;
}
