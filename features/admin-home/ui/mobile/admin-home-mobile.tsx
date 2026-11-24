"use client";

import { useMemo } from "react";
import Link from "next/link";
import { LayoutDashboard, Zap } from "lucide-react";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  MOBILE_TOP_NAV_ICON_BUTTON_CLASS,
  useMobileTopNav,
} from "@/components/navigation";
import type { AdminHomeViewProps } from "@/features/admin-home/model/types";
import { AdminHomeItemIcon } from "@/features/admin-home/ui/shared/admin-home-icons";

export function AdminHomeMobile({
  failedJobs,
  categories,
}: AdminHomeViewProps) {
  const topNavConfig = useMemo(
    () => ({
      pageActions: (
        <RefreshAnalyticsButton
          variant="outline"
          className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
        />
      ),
    }),
    []
  );
  useMobileTopNav(topNavConfig);

  return (
    <div className="flex w-full min-w-0 flex-col space-y-(--section-gap)">
      <AdminPageHeader icon={LayoutDashboard} title="Admin" />

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

      <div className="space-y-(--section-gap)">
        {categories.map((category) => (
          <section key={category.name} className="min-w-0">
            {category.name && <h2 className="border-b border-border/60 pb-2 font-heading text-body-base font-bold">{category.name}</h2>}
            <div className="divide-y divide-border/50">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 min-w-0 items-center justify-between gap-3 py-2.5 transition-colors active:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                      <AdminHomeItemIcon
                        iconKey={item.iconKey}
                        className={`size-4 ${item.iconColor}`}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block break-words text-body-sm font-semibold text-foreground">
                        {item.title}
                      </span>
                      {item.stat && (
                        <span className="mt-0.5 block break-words text-body-xs text-muted-foreground">
                          {item.stat}
                        </span>
                      )}
                    </div>
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
