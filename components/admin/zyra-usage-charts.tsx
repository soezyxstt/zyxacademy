"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminErrorState } from "@/components/admin/state-panels";
import { RefreshCw } from "lucide-react";

type UserUsage = {
  userId: string;
  name: string | null;
  email: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type DailyUsage = {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export function ZyraUsageCharts() {
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<"7" | "30" | "90">("30");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const res = await fetch(`/api/admin/ai-analytics/usage?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setUsers(json.data.users);
      setDaily(json.data.daily);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <div className="space-y-4 mt-5">
        <AdminErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  const formatDateTick = (value: string) => {
    try {
      const [y, m, d] = value.split("-");
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    } catch {
      return value;
    }
  };

  const formatTooltipLabel = (label: any) => {
    if (typeof label !== "string") return label;
    try {
      const [y, m, d] = label.split("-");
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return label;
    }
  };

  return (
    <div className="space-y-8 mt-12 border-t border-border pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-body-base font-semibold text-foreground">
            Penggunaan Zyra (Token &amp; Request)
          </h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Laporan penggunaan Zyra per user dan harian.
          </p>
        </div>
        <Select
          value={dateRange}
          onValueChange={(val) => setDateRange(val as any)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Hari Terakhir</SelectItem>
            <SelectItem value="30">30 Hari Terakhir</SelectItem>
            <SelectItem value="90">90 Hari Terakhir</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground text-body-sm">
          <RefreshCw className="size-4 animate-spin mr-2" />
          Memuat data penggunaan Zyra...
        </div>
      ) : (
        <>
          <div className="min-w-0 space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground mb-4">
              Tren Penggunaan Harian
            </h3>
            <div className="h-72 w-full">
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      tickMargin={10}
                      tickFormatter={formatDateTick}
                      stroke="var(--color-border)"
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      stroke="var(--color-border)"
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      stroke="var(--color-border)"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        borderColor: "var(--color-border)",
                        borderRadius: "8px",
                        color: "var(--color-foreground)",
                        fontSize: "13px",
                      }}
                      itemStyle={{ color: "var(--color-foreground)" }}
                      labelStyle={{ color: "var(--color-foreground)", fontWeight: 600, marginBottom: "4px" }}
                      formatter={(value: any, name?: any) => [
                        Number(value).toLocaleString("id-ID"),
                        String(name ?? ""),
                      ]}
                      labelFormatter={formatTooltipLabel}
                      cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: "16px", fontSize: "12px" }}
                      formatter={(value) => (
                        <span className="text-body-xs text-foreground font-medium">{value}</span>
                      )}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="inputTokens"
                      name="Input Tokens"
                      stackId="tokens"
                      fill="var(--color-brand-primary)"
                      maxBarSize={32}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="outputTokens"
                      name="Output Tokens"
                      stackId="tokens"
                      fill="var(--color-brand-secondary)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="requests"
                      name="Total Request"
                      fill="var(--color-status-info)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-body-sm">
                  Tidak ada data untuk rentang waktu ini.
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-heading text-body-base font-semibold text-foreground mb-4">
              Penggunaan per User
            </h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                        Pengguna
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        Permintaan
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        Token input
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        Token output
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                        Total token
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map((u) => (
                      <tr
                        key={u.userId}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {u.name || "Unknown"}
                          {u.email && <span className="block text-muted-foreground font-normal text-body-xs">{u.email}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {u.requests.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {u.inputTokens.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {u.outputTokens.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground font-medium">
                          {u.totalTokens.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                            Belum ada data penggunaan per pengguna.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
