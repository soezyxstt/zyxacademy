"use client";

import Link from "next/link";
import { LayoutDashboard, Zap } from "lucide-react";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminHomeViewProps } from "@/features/admin-home/model/types";
import { AdminHomeItemIcon } from "@/features/admin-home/ui/shared/admin-home-icons";

export function AdminHomeDesktop({ failedJobs, categories }: AdminHomeViewProps) {
  return (
    <div className="space-y-(--section-gap)">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Admin"
        actions={<RefreshAnalyticsButton />}
      />

      {failedJobs > 0 && (
        <Alert variant="destructive">
          <Zap className="size-4" aria-hidden />
          <AlertTitle>{failedJobs} generasi soal gagal</AlertTitle>
          <AlertDescription>
            <Link href="/admin/jobs" className="underline underline-offset-4">
              Tinjau generasi
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
        {categories.map((category) => (
          <section key={category.name} className="mb-5 inline-block w-full align-top">
            {category.name && <h2 className="border-b border-border/60 pb-2 font-heading text-body-base font-bold">{category.name}</h2>}
            <div className="divide-y divide-border/60">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-w-0 items-center gap-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                    <AdminHomeItemIcon
                      iconKey={item.iconKey}
                      className={`size-4 ${item.iconColor}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-body-sm font-semibold text-foreground group-hover:text-primary">
                      {item.title}
                    </span>
                    {item.stat && (
                      <span className="mt-0.5 block text-body-xs text-muted-foreground">
                        {item.stat}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
