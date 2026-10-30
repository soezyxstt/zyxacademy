"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Search,
  Check,
  Copy,
  CheckCircle2,
  XCircle,
  Info,
  X,
  Terminal,
  Layers,
  Activity,
  Zap,
} from "lucide-react";
import type { FeatureFlagStatus } from "@/lib/feature-flags";
import { FEATURE_CATEGORIES, type FeatureCategory } from "@/lib/feature-flags";
import { SearchBar } from "@/components/ui/search-bar";
import { useTranslations } from "@/lib/i18n/client";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FeatureFlagsApiResponse {
  checkedAt: string;
  posthogConfigured?: boolean;
  total: number;
  activeCount: number;
  inactiveCount: number;
  coveragePercent: number;
  flags: FeatureFlagStatus[];
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations<"adminOps">>): string {
  if (!iso) return t("opsUI.never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("opsUI.justNow");
  if (diffMin < 60) return t("opsUI.minutes", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("opsUI.hours", { count: diffH });
  return t("opsUI.days", { count: Math.floor(diffH / 24) });
}

async function fetchFeatureFlags(): Promise<FeatureFlagsApiResponse> {
  const res = await fetch("/api/admin/feature-flags");
  if (!res.ok) {
    throw new Error("Gagal memuat status feature flag");
  }
  return res.json();
}

export function FlagsClient() {
  const t = useTranslations("adminOps");
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
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted/60 animate-pulse" />
          ))}
        </div>
        <div className="h-14 rounded-xl bg-muted/60 animate-pulse border border-border" />
        <div className="overflow-hidden rounded-xl border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 border-b border-border bg-muted/60 animate-pulse" />
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
          <p className="font-heading text-body-base font-semibold text-foreground">{t("flagsUI.failed")}</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {t("flagsUI.connectionError")}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm"
          type="button"
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
        >
          <RefreshCw className="size-4" />
          {t("flagsUI.retry")}
        </Button>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-body-sm font-semibold text-foreground">{t("flagsUI.provider")}</span>
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
                {data.posthogConfigured ? t("flagsUI.posthogActive") : t("flagsUI.localFallback")}
              </span>
            </div>
            <p className="text-body-xs text-muted-foreground mt-0.5">
              {t("flagsUI.checked", { time: relativeTime(data.checkedAt, t) })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button variant="ghost" size="sm"
            type="button"
            onClick={handleCopyAllEnv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
            title={t("flagsUI.copyEnv")}
          >
            {copiedEnvSnippet ? (
              <>
                <Check className="size-3.5 text-status-success" />
                <span className="text-status-success">{t("flagsUI.copied")}</span>
              </>
            ) : (
              <>
                <Terminal className="size-3.5 text-muted-foreground" />
                <span>{t("flagsUI.copyEnvTemplate")}</span>
              </>
            )}
          </Button>

          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-1.5 text-body-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-brand-primary" : ""}`} />
            <span>{t("flagsUI.refresh")}</span>
          </Button>
        </div>
      </div>

      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem label={t("flagsUI.flags")} value={data.total} icon={Layers} />
        <AdminStatStripItem label={t("flagsUI.active")} value={data.activeCount} icon={CheckCircle2} tone="success" />
        <AdminStatStripItem label={t("flagsUI.inactive")} value={data.inactiveCount} icon={XCircle} />
        <AdminStatStripItem label={t("flagsUI.coverage")} value={`${data.coveragePercent}%`} icon={Activity} tone="brand" />
      </AdminStatStrip>

      {/* Control Panel: Search & Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Field */}
        <SearchBar
          size="sm"
          ref={searchInputRef}
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          shortcut="/"
          placeholder={t("flagsUI.search")}
          containerClassName="flex-1 min-w-[140px]"
        />

        {/* Category Select */}
        <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val as any)}>
          <SelectTrigger aria-label={t("flagsUI.allCategories")} className="w-[140px] sm:w-[160px] h-9 text-body-sm rounded-lg shrink-0">
            <SelectValue placeholder={t("flagsUI.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("flagsUI.allCategories")}</SelectItem>
            {(Object.keys(FEATURE_CATEGORIES) as FeatureCategory[]).map((catKey) => (
              <SelectItem key={catKey} value={catKey}>
                {t(`flagsUI.categories.${catKey}`)} ({data.flags.filter((f) => f.category === catKey).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Tabs (Segmented Button Bar) */}
        <div className="flex flex-wrap items-center rounded-lg border border-border bg-muted/40 p-0.5">
          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => setStatusFilter("all")}
            aria-pressed={statusFilter === "all"}
            className={`rounded-md px-2.5 py-1 text-body-sm font-semibold transition-all cursor-pointer ${
              statusFilter === "all"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("flagsUI.all")} ({data.total})
          </Button>
          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => setStatusFilter("active")}
            aria-pressed={statusFilter === "active"}
            className={`rounded-md px-2.5 py-1 text-body-sm font-semibold transition-all cursor-pointer ${
              statusFilter === "active"
                ? "bg-status-success/15 text-status-success shadow-xs border border-status-success/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("flagsUI.active")} ({data.activeCount})
          </Button>
          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => setStatusFilter("inactive")}
            aria-pressed={statusFilter === "inactive"}
            className={`rounded-md px-2.5 py-1 text-body-sm font-semibold transition-all cursor-pointer ${
              statusFilter === "inactive"
                ? "bg-background text-muted-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("flagsUI.inactive")} ({data.inactiveCount})
          </Button>
        </div>
      </div>

      {/* Main Flags List Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Zap className="size-4 text-brand-primary" />
            <h2 className="font-heading text-body-base font-semibold text-foreground">
              {t("flagsUI.flagList", { count: filteredFlags.length })}
            </h2>
          </div>

          {(search || statusFilter !== "all" || categoryFilter !== "all") && (
            <Button variant="ghost" size="sm"
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="inline-flex items-center gap-1 text-body-sm font-semibold text-brand-primary hover:underline cursor-pointer"
            >
              <X className="size-3" />
              {t("flagsUI.reset")}
            </Button>
          )}
        </div>

        {filteredFlags.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Search className="size-6" />
            </div>
            <div>
              <p className="text-body-base font-semibold text-foreground">
                {t("flagsUI.noMatch")}
              </p>
              <p className="mt-1 text-body-sm text-muted-foreground max-w-md mx-auto">
                {t("flagsUI.adjustSearch")}
              </p>
            </div>
            <Button variant="ghost" size="sm"
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setCategoryFilter("all");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-body-sm font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {t("flagsUI.showAll")}
            </Button>
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
                      <span className="font-heading text-body-base font-semibold text-foreground text-left">
                        {flag.name}
                      </span>
                      <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                        {t(`flagsUI.categories.${flag.category}`)}
                      </span>
                    </div>

                    <div className="flex items-center justify-start gap-2 text-left">
                      <code className="min-w-0 break-all rounded bg-muted/80 px-2 py-0.5 font-mono text-body-xs font-semibold text-foreground border border-border/80">
                        {flag.key}
                      </code>
                      <Button variant="ghost" size="sm"
                        type="button"
                        onClick={() => handleCopyKey(flag.key)}
                        title={t("flagsUI.copyName")}
                        aria-label={t("flagsUI.copyName")}
                        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                      >
                        {isJustCopied ? (
                          <Check className="size-3.5 text-status-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    </div>

                    <p className="text-body-sm text-muted-foreground leading-relaxed text-left">
                      {flag.description}
                    </p>
                  </div>

                  {/* Status & Value Column */}
                  <div className="flex shrink-0 items-center justify-start gap-4 self-start md:self-center border-t md:border-t-0 border-border/40 pt-3 md:pt-0 text-left">
                    <div className="text-left">
                      <span className="text-body-xs font-medium text-muted-foreground block text-left">
                        {t("flagsUI.envValue")}
                      </span>
                      <code className="font-mono text-body-xs font-semibold text-foreground">
                        {flag.rawValue !== undefined ? `"${flag.rawValue}"` : t("flagsUI.unset")}
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
                      <span>{flag.enabled ? t("flagsUI.enabled") : t("flagsUI.disabled")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Operational Guide Box */}
      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex items-center gap-2 text-foreground font-semibold text-body-base">
          <Info className="size-5 text-brand-primary" />
          <span>{t("flagsUI.guide")}</span>
        </div>
        <div className="space-y-3 text-body-sm text-muted-foreground leading-relaxed">
          <p>
            Feature flag kategori 4 di Zyx Academy dikendalikan melalui variabel lingkungan pada layer runtime; fondasi sistem berjalan selalu aktif.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1.5">
              <p className="font-semibold text-foreground text-body-sm">
                {t("flagsUI.enabledTitle")}
              </p>
              <p className="text-body-xs">
                {t("flagsUI.enabledHelp")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1.5">
              <p className="font-semibold text-foreground text-body-sm">
                {t("flagsUI.disabledTitle")}
              </p>
              <p className="text-body-xs">
                {t("flagsUI.disabledHelp")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
