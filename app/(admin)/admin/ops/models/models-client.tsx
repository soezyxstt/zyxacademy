"use client";

import { AdminIconAction } from "@/components/admin/icon-action";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Info,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { modelDisplayName } from "@/lib/ai/provider/recent-models";
import { ModelPicker } from "./model-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import {
  MODEL_FEATURE_GROUPS,
  getSelectableModelOption,
  type FeatureModelSettingView,
  type ModelFeature,
  type ModelFeatureGroup,
} from "@/lib/ai/model-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { EMBEDDING_PROFILES, type ModelId } from "@/lib/ai/provider/model-registry";
import { FormattedDate } from "@/components/ui/formatted-date";
import { useTranslations } from "@/lib/i18n/client";
import {
  listAiModelSettingsAction,
  refreshAiModelLatenciesAction,
  resetAiModelSettingAction,
  updateAiModelSettingAction,
  type ModelSettingMutationResult,
} from "./actions";

type ModelTrio = readonly [ModelId, ModelId, ModelId];
type StatusFilter = "all" | "custom" | "default";

export interface ModelsClientProps {
  initialViews: FeatureModelSettingView[];
  onSaveOverride?: (input: {
    feature: string;
    models: readonly string[];
    expectedUpdatedAt?: string | null;
  }) => Promise<ModelSettingMutationResult>;
  onResetOverride?: (input: {
    feature: string;
    expectedUpdatedAt?: string | null;
  }) => Promise<ModelSettingMutationResult>;
  onRefreshOverride?: () => Promise<ModelSettingMutationResult>;
  onReadOverride?: () => Promise<ModelSettingMutationResult>;
  initialSearch?: string;
  initialGroupFilter?: "all" | ModelFeatureGroup;
  initialStatusFilter?: StatusFilter;
  initialBannerError?: string | null;
}

function sameModels(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function formatModelLabel(modelId: ModelId): string {
  return getSelectableModelOption(modelId).label;
}

export function ModelsClient({
  initialViews,
  onSaveOverride,
  onResetOverride,
  onRefreshOverride,
  onReadOverride,
  initialSearch = "",
  initialGroupFilter = "all",
  initialStatusFilter = "all",
  initialBannerError = null,
}: ModelsClientProps) {
  const t = useTranslations("adminOps");
  const [selectedTask, setTask] = useUrlTab("task", "all");
  const task = ["zyra", "admin-ops-ai", "embedding"].includes(selectedTask) ? selectedTask : "all";
  const [views, setViews] = useState<FeatureModelSettingView[]>(initialViews);
  const [drafts, setDrafts] = useState<Partial<Record<ModelFeature, ModelTrio>>>({});
  const [pendingFeature, setPendingFeature] = useState<ModelFeature | null>(null);
  const [pendingKind, setPendingKind] = useState<"save" | "reset" | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyRefreshRequestedAt, setLatencyRefreshRequestedAt] = useState<number | null>(null);
  const refreshing = isRefreshing || latencyRefreshRequestedAt !== null;
  const [bannerError, setBannerError] = useState<string | null>(initialBannerError);
  const [search, setSearch] = useState(initialSearch);
  const [groupFilter, setGroupFilter] = useState<"all" | ModelFeatureGroup>(initialGroupFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchExpanded, setSearchExpanded] = useState(Boolean(initialSearch));

  useEffect(() => {
    if (latencyRefreshRequestedAt === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await (onReadOverride ?? listAiModelSettingsAction)();
        if (cancelled) return;
        if (!result.ok) throw new Error(result.error);
        setViews(result.views);
        const models = [...new Set(result.views.flatMap(view => view.selectableModels ?? []))];
        const observations: NonNullable<FeatureModelSettingView["modelLatencies"]> = Object.assign({}, ...result.views.map(view => view.modelLatencies ?? {}));
        if (models.length && models.every(id => observations[id]?.status === "complete" && (observations[id]?.checkedAt ?? 0) >= latencyRefreshRequestedAt)) {
          setLatencyRefreshRequestedAt(null);
          toast.success(t("modelsUI.latencyUpdated"));
          return;
        }
        if (Date.now() - latencyRefreshRequestedAt >= 15 * 60_000) throw new Error(t("modelsUI.latencyWaiting"));
        timer = setTimeout(poll, 10_000);
      } catch (error) {
        if (!cancelled) {
          setLatencyRefreshRequestedAt(null);
          setBannerError(error instanceof Error ? error.message : t("modelsUI.latencyWaiting"));
        }
      }
    };
    timer = setTimeout(poll, 10_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [latencyRefreshRequestedAt, onReadOverride, t]);

  useEffect(() => { if (searchExpanded) searchInputRef.current?.focus(); }, [searchExpanded]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        target?.tagName !== "INPUT" &&
        target?.tagName !== "TEXTAREA" &&
        !target?.isContentEditable
      ) {
        event.preventDefault();
        setSearchExpanded(true);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const groupCounts = useMemo(() => {
    const counts = new Map<ModelFeatureGroup, number>();
    for (const view of views) {
      counts.set(view.group, (counts.get(view.group) ?? 0) + 1);
    }
    return counts;
  }, [views]);

  const filteredViews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return views.filter((view) => {
      if (task !== "all") return view.feature === task;
      if (groupFilter !== "all" && view.group !== groupFilter) return false;
      if (statusFilter === "custom" && !view.isCustom) return false;
      if (statusFilter === "default" && view.isCustom) return false;
      if (!query) return true;

      const modelText = view.models
        .map((id) => `${id} ${view.modelLabels?.[id] ?? ""} ${modelDisplayName(view.modelLabels?.[id] ?? formatModelLabel(id))}`)
        .join(" ")
        .toLowerCase();
      return (
        view.label.toLowerCase().includes(query) ||
        view.feature.toLowerCase().includes(query) ||
        view.description.toLowerCase().includes(query) ||
        modelText.includes(query)
      );
    });
  }, [views, groupFilter, statusFilter, search, task]);

  const groupedViews = useMemo(() => {
    return MODEL_FEATURE_GROUPS.map(([groupKey]) => ({
      groupKey,
      items: filteredViews.filter((item) => item.group === groupKey),
    })).filter((section) => section.items.length > 0);
  }, [filteredViews]);

  const getDraftModels = (view: FeatureModelSettingView): ModelTrio => {
    return drafts[view.feature] ?? view.models;
  };

  const handleModelChange = (
    view: FeatureModelSettingView,
    slotIndex: 0 | 1 | 2,
    nextModelId: ModelId,
  ) => {
    const current = [...getDraftModels(view)] as [ModelId, ModelId, ModelId];
    const previousAtSlot = current[slotIndex];
    if (previousAtSlot === nextModelId) return;

    const duplicateIndex = current.findIndex(
      (candidate, index) => index !== slotIndex && candidate === nextModelId,
    );
    if (duplicateIndex !== -1) {
      current[duplicateIndex] = previousAtSlot;
    }
    current[slotIndex] = nextModelId;

    setDrafts((prev) => {
      const next = { ...prev };
      if (sameModels(current, view.models)) {
        delete next[view.feature];
      } else {
        next[view.feature] = current;
      }
      return next;
    });
  };

  const handleDiscardDraft = (feature: ModelFeature) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[feature];
      return next;
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const runRefresh = onRefreshOverride ?? refreshAiModelLatenciesAction;
      const result = await runRefresh();
      if (!result.ok) {
        const message = result.code === "LATENCY_COOLDOWN" ? t("modelsUI.latencyCooldown") : result.error;
        setBannerError(message);
        toast.error(message);
        return;
      }
      setViews(result.views);
      setBannerError(null);
      if (result.latencyRefreshRequestedAt) {
        setLatencyRefreshRequestedAt(result.latencyRefreshRequestedAt);
        toast.success(t("modelsUI.latencyQueued"));
      }
    } catch {
      setBannerError("Gagal memuat konfigurasi. Coba muat ulang.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async (view: FeatureModelSettingView) => {
    const nextModels = getDraftModels(view);
    if (new Set(nextModels).size !== 3) {
      const message = t("modelsUI.distinctRequired");
      setBannerError(message);
      toast.error(message);
      return;
    }

    setPendingFeature(view.feature);
    setPendingKind("save");
    try {
      const runSave = onSaveOverride ?? updateAiModelSettingAction;
      const result = await runSave({
        feature: view.feature,
        models: nextModels,
        expectedUpdatedAt: view.updatedAt,
      });

      if (result.views) {
        setViews(result.views);
      }

      if (!result.ok) {
        setBannerError(result.error);
        if (result.code === "MODEL_SETTING_CONFLICT") {
          handleDiscardDraft(view.feature);
        }
        toast.error(result.error);
        return;
      }

      handleDiscardDraft(view.feature);
      setBannerError(null);
      toast.success(t("modelsUI.savedToast", { feature: view.label }));
    } catch {
      setBannerError("Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setPendingFeature(null);
      setPendingKind(null);
    }
  };

  const handleReset = async (view: FeatureModelSettingView) => {
    setPendingFeature(view.feature);
    setPendingKind("reset");
    try {
      const runReset = onResetOverride ?? resetAiModelSettingAction;
      const result = await runReset({
        feature: view.feature,
        expectedUpdatedAt: view.updatedAt,
      });

      if (result.views) {
        setViews(result.views);
      }

      if (!result.ok) {
        setBannerError(result.error);
        if (result.code === "MODEL_SETTING_CONFLICT") {
          handleDiscardDraft(view.feature);
        }
        toast.error(result.error);
        return;
      }

      handleDiscardDraft(view.feature);
      setBannerError(null);
      toast.success(t("modelsUI.resetToast", { feature: view.label }));
    } catch {
      setBannerError("Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setPendingFeature(null);
      setPendingKind(null);
    }
  };

  const hasActiveFilter =
    Boolean(search.trim()) || groupFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setGroupFilter("all");
    setStatusFilter("all");
  };

  const priorityLabels = [
    t("modelsUI.primaryModel"),
    t("modelsUI.fallback1"),
    t("modelsUI.fallback2"),
  ] as const;

  return (
    <div>
      {bannerError && (
        <div
          role="alert"
          className="mb-(--compact-gap) flex items-start justify-between gap-2 border-y border-status-error/30 py-(--compact-gap) text-body-sm text-foreground"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden />
            <p className="min-w-0 break-words">{bannerError}</p>
          </div>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setBannerError(null)}
            aria-label={t("modelsUI.dismissAlert")}
          >
            <X className="size-3.5" />
          </Button>
          </TooltipTrigger><TooltipContent>{t("modelsUI.dismissAlert")}</TooltipContent></Tooltip></TooltipProvider>
        </div>
      )}

      <Tabs value={task} onValueChange={setTask}>
        <TabsList
          flush={!bannerError}
          aria-label={t("modelsUI.assignments")}
          trailing={
            task !== "all" ? (
              <AdminIconAction
                variant="outline"
                className="size-9 shrink-0"
                label={t("modelsUI.refresh")}
                onClick={handleRefresh}
                disabled={refreshing || pendingFeature !== null}
              >
                <RefreshCw aria-hidden className={refreshing ? "animate-spin" : ""} />
              </AdminIconAction>
            ) : undefined
          }
        >
          <TabsTrigger value="all">{t("modelsUI.features")}</TabsTrigger>
          <TabsTrigger value="zyra">Zyra</TabsTrigger>
          <TabsTrigger value="admin-ops-ai">Ops AI</TabsTrigger>
          <TabsTrigger value="embedding">Embedding</TabsTrigger>
        </TabsList>
        <TabsContent value="embedding">
          <dl className="divide-y divide-border">
            {Object.values(EMBEDDING_PROFILES).map(profile => (
              <div key={profile.id} className="flex flex-wrap justify-between gap-2 py-3">
                <dt className="text-body-sm font-semibold">{t(profile.id === "canonical-content-v2" ? "modelsUI.materialSearch" : "modelsUI.semanticCache")}</dt>
                <dd className="text-body-sm">{profile.model} · {t("modelsUI.dimensions", { count: profile.dimensions })}</dd>
              </div>
            ))}
          </dl>
          <p className="text-body-xs text-muted-foreground">{t("modelsUI.embeddingMigration")}</p>
        </TabsContent>
        {task !== "embedding" && <TabsContent value={task} className="space-y-4">
      {task === "all" && <div data-testid="model-filters" className="flex items-center gap-2">
        <SearchBar
          size="sm"
          ref={searchInputRef}
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          expanded={searchExpanded}
          onExpandedChange={setSearchExpanded}
          shortcut="/"
          placeholder={t("modelsUI.search")}
          containerClassName="min-w-0 flex-1"
        />

        <Select
          value={groupFilter}
          onValueChange={(value) => setGroupFilter(value as "all" | ModelFeatureGroup)}
        >
          <SelectTrigger
            aria-label={t("modelsUI.allGroups")}
            className={`h-9 min-w-0 flex-1 rounded-lg text-body-sm sm:w-[210px] sm:flex-none [&>span]:truncate ${searchExpanded ? "hidden sm:flex" : ""}`}
          >
            <SelectValue>{groupFilter === "all" ? t("modelsUI.groupFilter") : t(`modelsUI.groups.${groupFilter}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("modelsUI.allGroups")} ({views.length})
            </SelectItem>
            {MODEL_FEATURE_GROUPS.map(([groupKey]) => (
              <SelectItem key={groupKey} value={groupKey}>
                {t(`modelsUI.groups.${groupKey}`)} ({groupCounts.get(groupKey) ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger aria-label={t("modelsUI.filterAll")} className={`h-9 w-[104px] shrink-0 rounded-lg text-body-sm sm:w-[140px] ${searchExpanded ? "hidden sm:flex" : ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modelsUI.filterAll")}</SelectItem>
            <SelectItem value="custom">{t("modelsUI.filterCustom")}</SelectItem>
            <SelectItem value="default">{t("modelsUI.filterDefault")}</SelectItem>
          </SelectContent>
        </Select>

        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon-lg" onClick={handleRefresh}
            disabled={refreshing || pendingFeature !== null} aria-label={t("modelsUI.refresh")}>
            <RefreshCw aria-hidden className={refreshing ? "animate-spin" : ""} />
          </Button>
        </TooltipTrigger><TooltipContent>{t("modelsUI.refresh")}</TooltipContent></Tooltip></TooltipProvider>
      </div>}

      {groupedViews.length === 0 ? (
        <AdminEmptyState icon={Search} title={t("modelsUI.noMatchTitle")}
          action={hasActiveFilter ? <Button variant="outline" size="sm" onClick={clearFilters}>{t("modelsUI.clearFilters")}</Button> : undefined} />
      ) : (
        <div className="space-y-6">
          {groupedViews.map(({ groupKey, items }) => (
            <section key={groupKey} className="space-y-2.5">
              {task === "all" && <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <h2 className="font-heading text-body-base font-semibold text-foreground">
                  {t(`modelsUI.groups.${groupKey}`)}
                </h2>
              </div>}

              <div className="divide-y divide-border/60 border-y border-border">
                {items.map((view) => {
                  const draftModels = getDraftModels(view);
                  const isDirty = !sameModels(draftModels, view.models);
                  const isRowBusy = pendingFeature === view.feature;
                  const isSaving = isRowBusy && pendingKind === "save";
                  const isResetting = isRowBusy && pendingKind === "reset";
                  const canSave = isDirty || !view.isCustom;
                  const hasVisualInDraft = draftModels.some(
                    (id) => getSelectableModelOption(id).supportsImage,
                  );

                  return (
                    <div
                      key={view.feature}
                      data-testid={`model-feature-row-${view.feature}`}
                      className="grid grid-cols-1 gap-3 py-3 transition-colors hover:bg-muted/15 xl:grid-cols-[minmax(160px,0.65fr)_minmax(0,3fr)] xl:items-start"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-body-base font-semibold text-foreground">
                            {view.feature === "global-default" ? t("modelsUI.globalTitle") : view.label}
                          </span>
                          {view.isCustom && <span className="inline-flex items-center rounded-md border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 text-body-xs font-medium text-brand-primary">{t("modelsUI.statusCustom")}</span>}
                        <Popover><PopoverTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={view.label + ": " + t("modelsUI.capabilityHeading")}><Info aria-hidden /></Button>
                        </PopoverTrigger><PopoverContent className="space-y-2 text-body-xs">
                          <p className="text-body-xs">{view.feature === "global-default" ? t("modelsUI.globalHelp") : view.description}</p>
                          <p className="text-body-xs">{t("modelsUI.runtimeDefaultPrefix")} {view.runtimeDefaultModels.map(formatModelLabel).join(", ")}</p>
                          <p className="text-body-xs">{t("modelsUI.capabilityDistinct")}</p>
                          {view.requiresStreamingTools && <p className="text-body-xs">{t("modelsUI.capabilityOpsAi")}</p>}
                          {view.supportsImages && <p className="text-body-xs">{t("modelsUI.capabilityVisual")}</p>}
                        </PopoverContent></Popover>
                        </div>

                        {view.isCustom && view.updatedAt && (
                          <p className="text-body-xs text-muted-foreground">
                            {t("modelsUI.updatedMeta", { time: "" }).trim()} {" "}
                            <FormattedDate date={view.updatedAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
                          </p>
                        )}

                        {draftModels.some(id => view.modelLabels?.[id]?.endsWith("-contributor")) && (
                          <p className="text-body-xs text-status-warning">{t("modelsUI.contributorUsage")}</p>
                        )}
                        {view.supportsImages && !hasVisualInDraft && (
                          <p className="text-body-xs text-muted-foreground">
                            {t("modelsUI.visualFallbackHint")}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 space-y-2 xl:flex xl:items-end xl:gap-2 xl:space-y-0">
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                          {([0, 1, 2] as const).map((slotIndex) => {
                            const selectedId = draftModels[slotIndex];
                            return (
                              <div key={slotIndex} className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-1 sm:gap-1">
                                <span className="block text-body-xs font-medium text-muted-foreground">
                                  {priorityLabels[slotIndex]}
                                </span>
                                <ModelPicker view={view} value={selectedId} disabled={isRowBusy}
                                  label={`${view.feature === "global-default" ? t("modelsUI.globalTitle") : view.label} ${priorityLabels[slotIndex]}`}
                                  priorities={Object.fromEntries(draftModels.map((id, index) => [id, priorityLabels[index]]))}
                                  onChange={id => handleModelChange(view, slotIndex, id)} />
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {(isDirty || view.isCustom) && <DropdownMenu><DropdownMenuTrigger asChild>
                            <AdminIconAction variant="ghost" disabled={isRowBusy} label={view.label + ": " + t("modelsUI.actions")}><MoreHorizontal aria-hidden /></AdminIconAction>
                          </DropdownMenuTrigger><DropdownMenuContent align="end">
                            {isDirty && <DropdownMenuItem onSelect={() => handleDiscardDraft(view.feature)}>{t("modelsUI.discard")}</DropdownMenuItem>}
                            {view.isCustom && <DropdownMenuItem disabled={pendingFeature !== null} onSelect={() => void handleReset(view)}><RotateCcw aria-hidden className={isResetting ? "animate-spin" : ""} />{t(view.feature === "global-default" ? "modelsUI.resetDefault" : "modelsUI.useGlobal")}</DropdownMenuItem>}
                          </DropdownMenuContent></DropdownMenu>}

                          <Button
                            type="button"
                            variant={isDirty ? "default" : "outline"}
                            size="sm"
                            className="h-9"
                            isLoading={isSaving}
                            disabled={!canSave || (pendingFeature !== null && !isRowBusy)}
                            onClick={() => handleSave(view)}
                          >
                            {view.isCustom && !isDirty
                              ? t("modelsUI.savedState")
                              : t("modelsUI.save")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

        </TabsContent>}
      </Tabs>
    </div>
  );
}
