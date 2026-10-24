"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FeatureUsageDailyPoint, FeatureUsageRow } from "@/lib/feature-usage-metrics";
import { useTranslations } from "@/lib/i18n/client";

const FEATURE_KEYS = ["materi", "flashcard", "kuis", "asesmen", "kuisLive", "zyra"] as const;

const FEATURE_COLORS: Record<(typeof FEATURE_KEYS)[number], string> = {
  materi: "var(--color-brand-primary)",
  flashcard: "var(--color-tertiary-1)",
  kuis: "var(--color-brand-secondary)",
  asesmen: "var(--color-status-info)",
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

export function FeatureRankChart({ rows }: { rows: FeatureUsageRow[] }) {
  const t = useTranslations("adminOps");
  const data = rows.map((row) => ({
    key: row.key,
    label: t(`featureUsageUI.featureLabels.${row.key}`),
    aktivitas: row.events,
  }));

  if (data.every((d) => d.aktivitas === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-body-sm text-muted-foreground">
        {t("featureUsageUI.noRangeActivity")}
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.5} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
          <Bar dataKey="aktivitas" name={t("featureUsageUI.activity")} radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={FEATURE_COLORS[entry.key as (typeof FEATURE_KEYS)[number]] ?? "var(--color-muted-foreground)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FeatureDailyChart({ daily }: { daily: FeatureUsageDailyPoint[] }) {
  const t = useTranslations("adminOps");
  const hasData = daily.some((point) =>
    FEATURE_KEYS.some((key) => point[key] > 0)
  );

  return (
    <div className="h-72 w-full">
      {hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              tickMargin={10}
              tickFormatter={(value: string) => value.slice(5)}
              stroke="var(--color-border)"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              stroke="var(--color-border)"
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
            <Legend wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }} />
            {FEATURE_KEYS.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="usage"
                name={t(`featureUsageUI.featureLabels.${key}`)}
                fill={FEATURE_COLORS[key]}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-body-sm text-muted-foreground">
          {t("featureUsageUI.noDailyData")}
        </div>
      )}
    </div>
  );
}
