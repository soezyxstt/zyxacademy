"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FeatureUsageDailyPoint } from "@/lib/feature-usage-metrics";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { AdminEmptyState } from "@/components/admin/state-panels";

const FEATURE_KEYS = ["materi", "flashcard", "kuis", "kuisLive", "zyra"] as const;

const FEATURE_COLORS: Record<(typeof FEATURE_KEYS)[number], string> = {
  materi: "var(--color-brand-primary)",
  flashcard: "var(--color-tertiary-1)",
  kuis: "var(--color-brand-secondary)",
  kuisLive: "var(--color-status-warning)",
  zyra: "var(--color-status-success)",
};

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid var(--color-border)",
  backgroundColor: "var(--color-card)",
  color: "var(--color-foreground)",
  fontSize: "14px",
} as const;

export function FeatureDailyChart({ daily }: { daily: FeatureUsageDailyPoint[] }) {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const isMobile = useViewportMode() === "mobile";
  const hasData = daily.some((point) =>
    FEATURE_KEYS.some((key) => point[key] > 0)
  );

  if (!hasData) return <AdminEmptyState compact title={t("featureUsageUI.noDailyData")} />;
  const localeTag = locale === "id" ? "id-ID" : "en-US";
  const date = new Intl.DateTimeFormat(localeTag, { month: "short", day: "numeric", timeZone: "UTC" });
  const axisNumber = new Intl.NumberFormat(localeTag, { notation: "compact", maximumFractionDigits: 1 });

  return (
    <div className="h-56 md:h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={daily}
          margin={{ left: 0, right: isMobile ? 4 : 8, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
          <XAxis
            dataKey="date"
            interval={isMobile ? "preserveStartEnd" : "preserveEnd"}
            tick={{ fontSize: isMobile ? 11 : 12, fill: "var(--color-muted-foreground)" }}
            tickMargin={isMobile ? 6 : 10}
            tickFormatter={(value: string) => {
              const day = new Date(value);
              return Number.isNaN(day.valueOf()) ? value : date.format(day);
            }}
            stroke="var(--color-border)"
          />
          <YAxis
            allowDecimals={false}
            width={isMobile ? 44 : undefined}
            tickFormatter={(value: number) => axisNumber.format(value)}
            tick={{ fontSize: isMobile ? 11 : 12, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
          <Legend wrapperStyle={{ paddingTop: isMobile ? "8px" : "12px" }} formatter={(label) => <span className="text-body-xs text-foreground">{label}</span>} />
          {FEATURE_KEYS.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="usage"
              name={t(`featureUsageUI.featureLabels.${key}`)}
              fill={FEATURE_COLORS[key]}
              maxBarSize={isMobile ? 24 : 36}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
