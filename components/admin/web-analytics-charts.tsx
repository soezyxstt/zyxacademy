"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ResponsiveContainer } from "recharts";
import type { AnalyticsDashboardData } from "@/lib/analytics-dashboard";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { AdminEmptyState } from "@/components/admin/state-panels";

export function WebAnalyticsCharts({ data }: { data: AnalyticsDashboardData["dailyData"] }) {
  const t = useTranslations("adminOps.webAnalytics");
  const { locale } = useAppLocale();
  const chartData = useMemo(() => {
    const date = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return data.map((point) => {
      const day = new Date(point.date);
      return { ...point, displayDate: Number.isNaN(day.valueOf()) ? point.date : date.format(day) };
    });
  }, [data, locale]);

  if (chartData.length === 0) {
    return <AdminEmptyState compact title={t("noChartData")} />;
  }

  return (
    <div className="h-56 w-full md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
          <XAxis 
            dataKey="displayDate" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} 
            dy={10} 
            minTickGap={20}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} 
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
          />
          <Tooltip 
            contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-card)", color: "var(--color-foreground)", fontSize: "14px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
            itemStyle={{ color: "var(--color-foreground)", fontWeight: 500 }}
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Legend wrapperStyle={{ paddingTop: "8px" }} formatter={(label) => <span className="text-body-xs text-foreground">{label}</span>} />
          <Line
            type="monotone" 
            name={t("views")}
            dataKey="views" 
            stroke="var(--color-brand-primary)" 
            strokeWidth={3} 
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 6, fill: "var(--color-brand-primary)", stroke: "var(--color-background)", strokeWidth: 2 }}
          />
          <Line
            type="monotone" 
            name={t("chartSessions")}
            dataKey="sessions" 
            stroke="var(--color-tertiary-1)" 
            strokeWidth={3} 
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 6, fill: "var(--color-tertiary-1)", stroke: "var(--color-background)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
