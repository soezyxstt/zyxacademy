"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Search,
  Check,
  Copy,
  Flag,
  CheckCircle2,
  XCircle,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import type { FeatureFlagStatus } from "@/lib/feature-flags";
import { FEATURE_CATEGORIES, type FeatureCategory } from "@/lib/feature-flags";

interface FeatureFlagsApiResponse {
  checkedAt: string;
  posthogConfigured?: boolean;
  total: number;
  activeCount: number;
  inactiveCount: number;
  coveragePercent: number;
  flags: FeatureFlagStatus[];
}

function relativeTime(iso: string): string {
  if (!iso) return "belum pernah";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} jam lalu`;
  return `${Math.floor(diffH / 24)} hari lalu`;
}

async function fetchFeatureFlags(): Promise<FeatureFlagsApiResponse> {
  const res = await fetch("/api/admin/feature-flags");
  if (!res.ok) {
    throw new Error("Gagal memuat status feature flag");
  }
  return res.json();
}

export function FlagsClient() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery<FeatureFlagsApiResponse>({
    queryKey: ["admin-feature-flags"],
    queryFn: fetchFeatureFlags,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse border border-border" />
          ))}
        </div>
        <div className="h-12 rounded-xl bg-muted animate-pulse border border-border" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-status-error/20 bg-status-error/5 p-6 text-status-error">
        <p className="font-semibold text-body-base">Gagal memuat data feature flag</p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Terjadi kesalahan koneksi"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
        >
          <RefreshCw className="size-4" />
          Coba lagi
        </button>
      </div>
    );
  }

  // Filtering flags
  const filteredFlags = data.flags.filter((flag) => {
    // Status filter
    if (statusFilter === "active" && !flag.enabled) return false;
    if (statusFilter === "inactive" && flag.enabled) return false;

    // Category filter
    if (categoryFilter !== "all" && flag.category !== categoryFilter) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchKey = flag.key.toLowerCase().includes(q);
      const matchName = flag.name.toLowerCase().includes(q);
      const matchDesc = flag.description.toLowerCase().includes(q);
      if (!matchKey && !matchName && !matchDesc) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header bar with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Flag className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-foreground">Status Provider:</span>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-body-xs font-semibold ${
                data.posthogConfigured
                  ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}>
                {data.posthogConfigured ? "PostHog Active" : "Local Env Fallback"}
              </span>
            </div>
            <span className="text-body-xs text-muted-foreground">
              Terakhir diperbarui {relativeTime(data.checkedAt)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh Status
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Flag
          </p>
          <p className="mt-2 font-heading text-h3 font-bold text-foreground">
            {data.total}
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Feature flags terdaftar di sistem
          </p>
        </div>

        <div className="rounded-xl border border-status-success/20 bg-status-success/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-body-xs font-semibold text-status-success uppercase tracking-wider">
              Aktif (Enabled)
            </p>
            <CheckCircle2 className="size-4 text-status-success" />
          </div>
          <p className="mt-2 font-heading text-h3 font-bold text-status-success">
            {data.activeCount}
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Nilai &quot;1&quot; atau &quot;true&quot; di env
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Nonaktif (Disabled)
            </p>
            <XCircle className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-2 font-heading text-h3 font-bold text-muted-foreground">
            {data.inactiveCount}
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Tidak diset atau bernilai &quot;0&quot;
          </p>
        </div>

        <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4">
          <p className="text-body-xs font-semibold text-brand-primary uppercase tracking-wider">
            Persentase Fitur Aktif
          </p>
          <p className="mt-2 font-heading text-h3 font-bold text-brand-primary">
            {data.coveragePercent}%
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            {data.activeCount} dari {data.total} modul aktif
          </p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan kunci FEATURE_*, nama, atau deskripsi..."
              className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semua ({data.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "active"
                  ? "bg-status-success/15 text-status-success shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Aktif ({data.activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "inactive"
                  ? "bg-background text-muted-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nonaktif ({data.inactiveCount})
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          <span className="flex items-center gap-1 text-body-xs font-semibold text-muted-foreground mr-1">
            <SlidersHorizontal className="size-3.5" /> Kategori:
          </span>

          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`rounded-md border px-2.5 py-1 text-body-xs font-medium transition-colors cursor-pointer ${
              categoryFilter === "all"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Semua Kategori
          </button>

          {(Object.keys(FEATURE_CATEGORIES) as FeatureCategory[]).map((catKey) => {
            const label = FEATURE_CATEGORIES[catKey];
            const isSelected = categoryFilter === catKey;
            const catCount = data.flags.filter((f) => f.category === catKey).length;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setCategoryFilter(catKey)}
                className={`rounded-md border px-2.5 py-1 text-body-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label} ({catCount})
              </button>
            );
          })}
        </div>
      </div>

      {/* Flags List Table / Cards */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-5 py-3 flex items-center justify-between">
          <h2 className="font-heading text-h6 font-semibold text-foreground">
            Daftar Feature Flag ({filteredFlags.length})
          </h2>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="text-body-xs text-brand-primary hover:underline"
            >
              Reset filter
            </button>
          )}
        </div>

        {filteredFlags.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-body-base font-semibold text-foreground">
              Tidak ada feature flag yang cocok
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Coba sesuaikan kata kunci pencarian atau pilihan filter di atas.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredFlags.map((flag) => {
              const isJustCopied = copiedKey === flag.key;

              return (
                <div
                  key={flag.key}
                  className="p-4 sm:p-5 transition-colors hover:bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-h6 font-semibold text-foreground">
                        {flag.name}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                        {flag.categoryLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <code className="rounded bg-muted/80 px-2 py-0.5 font-mono text-body-xs font-semibold text-foreground border border-border/60">
                        {flag.key}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyKey(flag.key)}
                        title="Salin nama variabel lingkungan"
                        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                      >
                        {isJustCopied ? (
                          <Check className="size-3.5 text-status-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-body-sm text-muted-foreground leading-relaxed">
                      {flag.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 self-end sm:self-center">
                    {/* Raw Value Indicator */}
                    <div className="text-right">
                      <span className="text-[11px] font-medium text-muted-foreground block">
                        Nilai env:
                      </span>
                      <code className="font-mono text-body-xs font-semibold text-foreground">
                        {flag.rawValue !== undefined ? `"${flag.rawValue}"` : "(tidak diset)"}
                      </code>
                    </div>

                    {/* Status Badge */}
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-body-xs font-bold ${
                        flag.enabled
                          ? "border-status-success/30 bg-status-success/10 text-status-success"
                          : "border-border bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      {flag.enabled ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          <span>AKTIF</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="size-3.5" />
                          <span>NONAKTIF</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Information Guide Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold text-body-base">
          <Info className="size-5 text-brand-primary" />
          <span>Cara Mengubah Status Feature Flag</span>
        </div>
        <div className="space-y-2 text-body-sm text-muted-foreground leading-relaxed">
          <p>
            Feature flags di Zyx dikendalikan sepenuhnya oleh Environment Variables pada layer runtime. Untuk mengaktifkan atau menonaktifkan fitur:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              <strong className="text-foreground">Mengaktifkan Fitur:</strong> Set variabel lingkungan seperti <code className="font-mono text-body-xs bg-muted px-1.5 py-0.5 rounded">FEATURE_PKA=&quot;1&quot;</code> di file <code className="font-mono text-body-xs bg-muted px-1.5 py-0.5 rounded">.env</code> atau pada dashboard hosting (Cloudflare / Vercel / Railway).
            </li>
            <li>
              <strong className="text-foreground">Menonaktifkan Fitur:</strong> Set variabel lingkungan ke <code className="font-mono text-body-xs bg-muted px-1.5 py-0.5 rounded">&quot;0&quot;</code> atau hapus variabel dari konfigurasi lingkungan.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
