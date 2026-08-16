"use client";

import { useState, useRef, useEffect } from "react";
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
  X,
  Terminal,
  Layers,
  Activity,
  Zap,
} from "lucide-react";
import type { FeatureFlagStatus } from "@/lib/feature-flags";
import { FEATURE_CATEGORIES, type FeatureCategory } from "@/lib/feature-flags";
import { SearchBar } from "@/components/ui/search-bar";

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
  const [copiedEnvSnippet, setCopiedEnvSnippet] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery<FeatureFlagsApiResponse>({
    queryKey: ["admin-feature-flags"],
    queryFn: fetchFeatureFlags,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  // Global hotkey '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleCopyAllEnv = () => {
    if (!data?.flags) return;
    const envLines = data.flags
      .map((f) => `# ${f.name} (${f.categoryLabel})\n${f.key}="${f.enabled ? "1" : "0"}"`)
      .join("\n\n");
    navigator.clipboard.writeText(envLines);
    setCopiedEnvSnippet(true);
    setTimeout(() => setCopiedEnvSnippet(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/60 animate-pulse border border-border" />
          ))}
        </div>
        <div className="h-14 rounded-xl bg-muted/60 animate-pulse border border-border" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/60 animate-pulse border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-status-error/30 bg-status-error/5 p-6 text-status-error">
        <div className="flex items-center gap-3">
          <XCircle className="size-6 shrink-0 text-status-error" />
          <div>
            <p className="font-heading text-h6 font-semibold text-foreground">Gagal memuat data feature flag</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Terjadi kesalahan koneksi sistem"}
            </p>
          </div>
        </div>
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
      {/* Subheader bar with provider status & actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
            <Flag className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-body-sm font-semibold text-foreground">Provider Layer:</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-body-xs font-semibold ${
                  data.posthogConfigured
                    ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    data.posthogConfigured ? "bg-brand-primary animate-pulse" : "bg-muted-foreground/60"
                  }`}
                />
                {data.posthogConfigured ? "PostHog Active" : "Local Env Fallback"}
              </span>
            </div>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              Pengecekan otomatis terakhir: {relativeTime(data.checkedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleCopyAllEnv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-body-xs font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
            title="Salin semua variabel lingkungan ke clipboard"
          >
            {copiedEnvSnippet ? (
              <>
                <Check className="size-3.5 text-status-success" />
                <span className="text-status-success">Tersalin!</span>
              </>
            ) : (
              <>
                <Terminal className="size-3.5 text-muted-foreground" />
                <span>Salin .env Template</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-1.5 text-body-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-brand-primary" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
          <div className="flex items-center justify-between">
            <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Feature Flag
            </p>
            <Layers className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-2 font-heading text-h3 font-bold text-foreground">
            {data.total}
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Katalog resmi &amp; variabel dinamik
          </p>
        </div>

        <div className="rounded-xl border border-status-success/30 bg-status-success/5 p-4 transition-all hover:border-status-success/50">
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
            Bernilai &quot;1&quot; atau &quot;true&quot; di runtime
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
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

        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-4 transition-all hover:border-brand-primary/50">
          <div className="flex items-center justify-between">
            <p className="text-body-xs font-semibold text-brand-primary uppercase tracking-wider">
              Cakupan Modul Aktif
            </p>
            <Activity className="size-4 text-brand-primary" />
          </div>
          <p className="mt-2 font-heading text-h3 font-bold text-brand-primary">
            {data.coveragePercent}%
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-md bg-brand-primary/15">
            <div
              className="h-full bg-brand-primary transition-all duration-500 rounded-md"
              style={{ width: `${Math.min(100, Math.max(0, data.coveragePercent))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Control Panel: Search & Filters */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Field */}
          <SearchBar
            ref={searchInputRef}
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            shortcut="/"
            placeholder="Cari kunci FEATURE_*, nama modul, atau deskripsi..."
            containerClassName="flex-1 max-w-xl"
          />

          {/* Status Tabs (Segmented Button Bar) */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 self-start lg:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-md px-3 py-1.5 text-body-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-background text-foreground shadow-xs border border-border/60"
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
                  ? "bg-status-success/15 text-status-success shadow-xs border border-status-success/30"
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
                  ? "bg-background text-muted-foreground shadow-xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nonaktif ({data.inactiveCount})
            </button>
          </div>
        </div>

        {/* Category Chips Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
          <span className="flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground mr-1">
            <SlidersHorizontal className="size-3.5" /> Filter Kategori:
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
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-body-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                    isSelected
                      ? "bg-brand-primary/20 text-brand-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {catCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Flags List Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-brand-primary" />
            <h2 className="font-heading text-h6 font-semibold text-foreground">
              Daftar Feature Flag ({filteredFlags.length})
            </h2>
          </div>

          {(search || statusFilter !== "all" || categoryFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline cursor-pointer"
            >
              <X className="size-3" />
              Reset filter
            </button>
          )}
        </div>

        {filteredFlags.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Search className="size-6" />
            </div>
            <div>
              <p className="text-body-base font-semibold text-foreground">
                Tidak ada feature flag yang cocok
              </p>
              <p className="mt-1 text-body-sm text-muted-foreground max-w-md mx-auto">
                Coba sesuaikan kata kunci pencarian atau bersihkan filter status dan kategori di atas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-body-sm font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Tampilkan semua flag
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredFlags.map((flag) => {
              const isJustCopied = copiedKey === flag.key;

              return (
                <div
                  key={flag.key}
                  className="p-4 sm:p-5 transition-colors hover:bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left items-start"
                >
                  {/* Info Column */}
                  <div className="min-w-0 flex-1 space-y-2 text-left items-start">
                    <div className="flex flex-wrap items-center justify-start gap-2 text-left">
                      <span className="font-heading text-h6 font-semibold text-foreground text-left">
                        {flag.name}
                      </span>
                      <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                        {flag.categoryLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-start gap-2 text-left">
                      <code className="rounded bg-muted/80 px-2 py-0.5 font-mono text-body-xs font-semibold text-foreground border border-border/80">
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

                    <p className="text-body-sm text-muted-foreground leading-relaxed text-left">
                      {flag.description}
                    </p>
                  </div>

                  {/* Status & Value Column */}
                  <div className="flex shrink-0 items-center justify-start gap-4 self-start md:self-center border-t md:border-t-0 border-border/40 pt-3 md:pt-0 text-left">
                    <div className="text-left">
                      <span className="text-[11px] font-medium text-muted-foreground block text-left">
                        Nilai env:
                      </span>
                      <code className="font-mono text-body-xs font-semibold text-foreground">
                        {flag.rawValue !== undefined ? `"${flag.rawValue}"` : "(tidak diset)"}
                      </code>
                    </div>

                    {/* Status Badge */}
                    <div
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-body-xs font-bold ${
                        flag.enabled
                          ? "border-status-success/30 bg-status-success/10 text-status-success"
                          : "border-border bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          flag.enabled ? "bg-status-success animate-pulse" : "bg-muted-foreground/50"
                        }`}
                      />
                      <span>{flag.enabled ? "AKTIF" : "NONAKTIF"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Operational Guide Box */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold text-body-base">
          <Info className="size-5 text-brand-primary" />
          <span>Panduan Pengaturan Feature Flag</span>
        </div>
        <div className="space-y-3 text-body-sm text-muted-foreground leading-relaxed">
          <p>
            Feature flag kategori 4 di Zyx Academy dikendalikan melalui variabel lingkungan pada layer runtime; fondasi sistem berjalan selalu aktif.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1.5">
              <p className="font-semibold text-foreground text-body-xs uppercase tracking-wider">
                Mengaktifkan Fitur
              </p>
              <p className="text-body-xs">
                Set nilai variabel ke <code className="font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">&quot;1&quot;</code> atau <code className="font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">&quot;true&quot;</code> di file <code className="font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">.env</code>.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1.5">
              <p className="font-semibold text-foreground text-body-xs uppercase tracking-wider">
                Menonaktifkan Fitur
              </p>
              <p className="text-body-xs">
                Set nilai variabel ke <code className="font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">&quot;0&quot;</code> atau hapus variabel tersebut dari konfigurasi lingkungan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
