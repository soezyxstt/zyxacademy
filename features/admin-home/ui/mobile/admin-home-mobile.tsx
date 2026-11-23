"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  Library,
  Zap,
} from "lucide-react";
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
  kpis,
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

  const kpiItems = [
    {
      label: "Mata Kuliah",
      value: kpis.totalCourses,
      href: "/admin/courses",
      icon: GraduationCap,
      iconColor: "text-brand-secondary",
    },
    {
      label: "Tinjau Soal",
      value: kpis.pendingQuestions,
      href: "/admin/questions",
      icon: Library,
      iconColor: "text-status-success",
    },
    {
      label: "Generasi Aktif",
      value: kpis.runningJobs,
      href: "/admin/jobs",
      icon: Zap,
      iconColor: "text-status-warning",
    },
    {
      label: "Permintaan AI",
      value: kpis.aiRequestsToday,
      href: "/admin/ops",
      icon: Activity,
      iconColor: "text-status-info",
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col space-y-5">
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

      <section
        aria-label="Ringkasan"
        className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3"
      >
        {kpiItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="min-w-0 rounded-md py-1 transition-colors active:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className={`size-3.5 shrink-0 ${item.iconColor}`} aria-hidden />
                <span className="truncate text-body-xs font-medium">{item.label}</span>
              </div>
              <p className="mt-1 font-heading text-h5 font-bold tabular-nums text-foreground">
                {item.value}
              </p>
            </Link>
          );
        })}
      </section>

      <div className="space-y-5">
        {categories.map((category) => (
          <section key={category.name} className="min-w-0">
            <h2 className="border-b border-border/60 pb-2 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {category.name}
            </h2>
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
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
