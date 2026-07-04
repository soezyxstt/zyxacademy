"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AnalyticsDashboardData } from "@/lib/analytics-dashboard";

export function WebAnalyticsCharts({ data }: { data: AnalyticsDashboardData["dailyData"] }) {
  const chartData = useMemo(() => {
    // Optionally format date for display e.g. "24 Jul"
    return data.map(d => {
      const dateObj = new Date(d.date);
      const formattedDate = dateObj.toLocaleDateString("id-ID", {
        month: "short",
        day: "numeric",
      });
      return {
        ...d,
        displayDate: formattedDate,
      };
    });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-muted/20 text-body-sm text-muted-foreground">
        Tidak ada data grafik tersedia
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
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
          <Line 
            type="monotone" 
            name="Page Views"
            dataKey="views" 
            stroke="var(--color-brand-primary)" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, fill: "var(--color-brand-primary)", stroke: "var(--color-background)", strokeWidth: 2 }}
          />
          <Line 
            type="monotone" 
            name="Sessions"
            dataKey="sessions" 
            stroke="var(--color-tertiary-1)" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, fill: "var(--color-tertiary-1)", stroke: "var(--color-background)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
