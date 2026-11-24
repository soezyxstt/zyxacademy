"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
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
    <div className="space-y-(--section-gap)">
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

      <AdminStatStrip className="sm:grid-cols-3">
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

      <section className="space-y-1">
        <AdminSectionTitle title={t("opsUI.jobHealth")} icon={Clock} border />
        <ul className="divide-y divide-border/60">
          {pipelines.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 py-(--row-padding)"
            >
              <span className="min-w-0 text-body-sm font-medium text-foreground">
                {item.label}
              </span>
              <StatusBadge className="shrink-0" tone={item.lastRun ? "success" : "muted"}>
                {relativeTime(item.lastRun, t)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1">
        <AdminSectionTitle title={t("opsUI.monitoringShortcuts")} border />
        <ul className="grid sm:grid-cols-2 sm:gap-x-(--section-gap)">
          {quickLinks.map((item) => (
            <li key={item.href} className="border-b border-border/60 last:border-b-0 sm:nth-last-2:border-b-0">
              <Link
                href={item.href}
                className="flex min-h-10 items-start gap-2 rounded-md py-(--row-padding) text-body-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <item.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 wrap-break-word">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
