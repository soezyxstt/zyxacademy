"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-6 text-status-error text-body-sm mt-8">
        Error loading Zyra usage: {error}
      </div>
    );
  }

  return (
    <div className="space-y-8 mt-12 border-t border-border pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-h5 font-semibold text-foreground">
            Penggunaan Zyra (Token & Request)
          </h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Laporan penggunaan AI per user dan harian.
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
          Loading usage data…
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-body-sm font-semibold text-foreground mb-4">
              Tren Penggunaan Harian
            </h3>
            <div className="h-72 w-full">
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={10} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      itemStyle={{ fontSize: "14px" }}
                      labelStyle={{ color: "hsl(var(--foreground))", marginBottom: "4px" }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    <Bar yAxisId="left" dataKey="inputTokens" name="Input Tokens" stackId="a" fill="hsl(var(--brand-primary))" radius={[0, 0, 4, 4]} />
                    <Bar yAxisId="left" dataKey="outputTokens" name="Output Tokens" stackId="a" fill="hsl(var(--brand-secondary))" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="requests" name="Total Request" fill="hsl(var(--status-info))" radius={4} />
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
            <h3 className="font-heading text-h6 font-semibold text-foreground mb-4">
              Penggunaan per User
            </h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Requests
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Input Tokens
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Output Tokens
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Total Tokens
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
                          {u.email && <span className="block text-muted-foreground font-normal text-xs">{u.email}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {u.requests.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {u.inputTokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {u.outputTokens.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground font-medium">
                          {u.totalTokens.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Tidak ada data user.
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
