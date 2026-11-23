"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Database,
  Globe,
  LineChart,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";
import { OpsMetricsSkeleton } from "@/components/admin/content-loading-skeletons";
import { AdminIconAction } from "@/components/admin/icon-action";
import {
  MOBILE_TOP_NAV_ICON_BUTTON_CLASS,
  useMobileTopNav,
} from "@/components/navigation";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminErrorState } from "@/components/admin/state-panels";
import { StatusBadge } from "@/components/admin/status-badges";
import { adminOpsQuery } from "@/lib/admin/ops-query";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { useTranslations } from "@/lib/i18n/client";

function relativeTime(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return t("opsUI.never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("opsUI.justNow");
  if (diffMin < 60) return t("opsUI.minutes", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("opsUI.hours", { count: diffH });
  return t("opsUI.days", { count: Math.floor(diffH / 24) });
}

export function OpsClient() {
  const t = useTranslations("adminOps");
  const tNav = useTranslations("admin.navigation");
  const userId = useQueryAccountId();
  const { data, isPending, isFetching, error, refetch } = useQuery(adminOpsQuery(userId ?? ""));

  const refreshLabel = t("opsUI.refresh");
  const mobileTopNavConfig = useMemo(
    () => ({
      pageActions: (
        <AdminIconAction
          label={refreshLabel}
          variant="outline"
          disabled={isFetching}
          onClick={() => refetch()}
          className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </AdminIconAction>
      ),
    }),
    [isFetching, refetch, refreshLabel]
  );
  useMobileTopNav(mobileTopNavConfig);

  if (isPending || !userId) return <OpsMetricsSkeleton />;

  if (error || !data) {
    return (
      <AdminErrorState message={t("opsUI.loadError")} onRetry={() => refetch()} />
    );
  }

  const hasFailures = data.jobFailures24h > 0;
  const queueHigh = data.syncQueueDepth > 100;

  const pipelines = [
    {
      id: "recommendations",
      label: t("opsUI.dailyRecommendations"),
      lastRun: data.jobHealth.recommendationsLastAt,
    },
    {
      id: "snapshots",
      label: t("opsUI.analyticsSnapshots"),
      lastRun: data.jobHealth.snapshotsLastAt,
    },
    {
      id: "study-paths",
      label: t("opsUI.studyPaths"),
      lastRun: data.jobHealth.pathsLastAt,
    },
  ];

  const quickLinks = [
    {
      href: "/admin/ops/web-analytics",
      label: tNav("webAnalytics"),
      icon: Globe,
    },
    {
      href: "/admin/ops/analytics",
      label: tNav("zyraAnalytics"),
      icon: LineChart,
    },
    {
      href: "/admin/ops/feature-usage",
      label: tNav("featureUsage"),
      icon: MousePointerClick,
    },
    {
      href: "/admin/ops/tutor-activity",
      label: tNav("tutorActivity"),
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge tone={hasFailures || queueHigh ? "warning" : "success"}>
            {t(`opsUI.status.${hasFailures || queueHigh ? "degraded" : "healthy"}`)}
          </StatusBadge>
          <span className="text-body-xs text-muted-foreground">
            {t("opsUI.checked", { time: relativeTime(data.checkedAt, t) })}
          </span>
        </div>
        <AdminIconAction
          className="hidden md:inline-flex"
          label={refreshLabel}
          variant="outline"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </AdminIconAction>
      </div>

      <AdminStatStrip className="grid-cols-1 sm:grid-cols-3">
        <AdminStatStripItem
          label={t("opsUI.jobFailures")}
          value={data.jobFailures24h}
          caption={t("opsUI.failedJobs")}
          tone={hasFailures ? "error" : "default"}
          icon={AlertTriangle}
        />
        <AdminStatStripItem
          label={t("opsUI.vectorQueue")}
          value={data.syncQueueDepth}
          caption={t("opsUI.pendingItems")}
          tone={queueHigh ? "warning" : "default"}
          icon={Database}
        />
        <AdminStatStripItem
          label={tNav("zyraAnalytics")}
          value="AI Gateway"
          caption={t("opsUI.aiGatewayHint")}
          icon={LineChart}
        />
      </AdminStatStrip>

      <section className="space-y-3">
        <AdminSectionTitle title={t("opsUI.jobHealth")} icon={Clock} border />
        <div className="divide-y divide-border border-b border-border">
          {pipelines.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="text-body-sm font-medium text-foreground">
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <StatusBadge tone={item.lastRun ? "success" : "muted"}>
                  {relativeTime(item.lastRun, t)}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <AdminSectionTitle title={t("opsUI.monitoringShortcuts")} border />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-body-sm font-medium text-foreground transition-colors hover:border-brand-primary/40 hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-2">
                <item.icon className="size-4 shrink-0 text-muted-foreground group-hover:text-brand-primary" />
                <span className="truncate">{item.label}</span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
