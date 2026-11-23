"use client";

import { ZyraUsageSkeleton } from "@/components/admin/content-loading-skeletons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminUsageQuery, type UsageRangeDays } from "@/lib/admin/ops-query";
import { useQueryAccountId } from "@/hooks/use-query-account";
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
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/lib/i18n/client";
import { useViewportMode } from "@/hooks/use-viewport-mode";

const USERS_PER_PAGE = 15;

export function ZyraUsageCharts() {
  const t = useTranslations("admin.usageCharts");
  const isMobile = useViewportMode() === "mobile";
  const [dateRange, setDateRange] = useState<UsageRangeDays>(30);
  const [userPage, setUserPage] = useState(1);
  const userId = useQueryAccountId();

  const { data, isPending, error, refetch } = useQuery(adminUsageQuery(userId ?? "", dateRange));

  if (error) {
    return (
      <div className="mt-5 space-y-4">
        <AdminErrorState message={t("loadFailed")} onRetry={() => refetch()} />
      </div>
    );
  }

  const users = data?.users ?? [];
  const daily = data?.daily ?? [];
  const totalUsers = users.length;
  const totalUserPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, totalUserPages);
  const startUserIndex = (safeUserPage - 1) * USERS_PER_PAGE;
  const endUserIndex = Math.min(startUserIndex + USERS_PER_PAGE, totalUsers);
  const pagedUsers = users.slice(startUserIndex, endUserIndex);

  const formatDateTick = (value: string) => {
    try {
      const [y, m, d] = value.split("-");
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    } catch {
      return value;
    }
  };

  const formatTooltipLabel = (label: unknown) => {
    if (typeof label !== "string") return String(label ?? "");
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
    <div className="mt-6 space-y-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-body-base font-semibold text-foreground">
            Penggunaan Zyra (Token &amp; Request)
          </h2>
        </div>
        <Select
          value={String(dateRange)}
          onValueChange={(val) => {
            setDateRange(val === "7" ? 7 : val === "90" ? 90 : 30);
            setUserPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[170px] rounded-lg text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Hari Terakhir</SelectItem>
            <SelectItem value="30">30 Hari Terakhir</SelectItem>
            <SelectItem value="90">90 Hari Terakhir</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending || !userId ? (
        <ZyraUsageSkeleton />
      ) : (
        <>
          <div className="min-w-0 space-y-3">
            <h3 className="mb-4 text-body-sm font-semibold text-foreground">
              Tren Penggunaan Harian
            </h3>
            <div className={daily.length ? "h-56 md:h-72 w-full" : "w-full"}>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={daily}
                    margin={
                      isMobile
                        ? { top: 8, right: 0, left: -16, bottom: 0 }
                        : { top: 10, right: 10, left: -10, bottom: 0 }
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--color-border)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="date"
                      interval={isMobile ? "preserveStartEnd" : "preserveEnd"}
                      tick={{ fontSize: isMobile ? 11 : 12, fill: "var(--color-muted-foreground)" }}
                      tickMargin={isMobile ? 6 : 10}
                      tickFormatter={formatDateTick}
                      stroke="var(--color-border)"
                    />
                    <YAxis
                      yAxisId="left"
                      width={isMobile ? 36 : undefined}
                      tick={{ fontSize: isMobile ? 11 : 12, fill: "var(--color-muted-foreground)" }}
                      stroke="var(--color-border)"
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      width={isMobile ? 28 : undefined}
                      allowDecimals={false}
                      tick={{ fontSize: isMobile ? 11 : 12, fill: "var(--color-muted-foreground)" }}
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
                      labelStyle={{
                        color: "var(--color-foreground)",
                        fontWeight: 600,
                        marginBottom: "4px",
                      }}
                      formatter={(value: unknown, name?: unknown) => [
                        Number(value).toLocaleString("id-ID"),
                        String(name ?? ""),
                      ]}
                      labelFormatter={formatTooltipLabel}
                      cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: isMobile ? "8px" : "16px", fontSize: isMobile ? "11px" : "12px" }}
                      formatter={(value) => (
                        <span className="text-body-xs font-medium text-foreground">{value}</span>
                      )}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="inputTokens"
                      name="Input Tokens"
                      stackId="tokens"
                      fill="var(--color-brand-primary)"
                      maxBarSize={isMobile ? 22 : 32}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="outputTokens"
                      name="Output Tokens"
                      stackId="tokens"
                      fill="var(--color-brand-secondary)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={isMobile ? 22 : 32}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="requests"
                      name="Total Request"
                      fill="var(--color-status-info)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={isMobile ? 22 : 32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <AdminEmptyState title="Tidak ada data untuk rentang waktu ini" />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-heading text-body-base font-semibold text-foreground">
              Penggunaan per User
            </h3>
            {users.length === 0 ? (
              <AdminEmptyState title="Belum ada data penggunaan per pengguna" />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
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
                      {pagedUsers.length > 0 ? (
                        pagedUsers.map((u) => (
                          <tr
                            key={u.userId}
                            className="border-b border-border last:border-0 transition-colors hover:bg-muted/20"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              {u.name || "Unknown"}
                              {u.email && (
                                <span className="block text-body-xs font-normal text-muted-foreground">
                                  {u.email}
                                </span>
                              )}
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
                            <td className="px-4 py-3 text-right font-medium text-foreground">
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

                <ul className="divide-y divide-border/40 border-y border-border md:hidden">
                  {pagedUsers.map((u) => (
                    <li key={u.userId} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium text-foreground">
                            {u.name || "Unknown"}
                          </p>
                          {u.email && (
                            <p className="truncate text-body-xs text-muted-foreground">
                              {u.email}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <p className="text-body-sm font-semibold text-foreground">
                            {u.totalTokens.toLocaleString("id-ID")}
                          </p>
                          <p className="text-body-2xs text-muted-foreground">
                            Total token
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs tabular-nums text-muted-foreground">
                        <span>{u.requests.toLocaleString("id-ID")} permintaan</span>
                        <span>
                          In {u.inputTokens.toLocaleString("id-ID")} / Out {u.outputTokens.toLocaleString("id-ID")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {totalUsers > USERS_PER_PAGE && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
                <span>
                  {t("pageSummary", {
                    start: startUserIndex + 1,
                    end: endUserIndex,
                    total: totalUsers,
                  })}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeUserPage <= 1}
                    onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeUserPage >= totalUserPages}
                    onClick={() =>
                      setUserPage((prev) => Math.min(totalUserPages, prev + 1))
                    }
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
