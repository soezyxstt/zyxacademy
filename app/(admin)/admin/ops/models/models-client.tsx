"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Image as ImageIcon,
  Info,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
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
  selectableModels,
  type FeatureModelSettingView,
  type ModelFeature,
  type ModelFeatureGroup,
} from "@/lib/ai/model-settings";
import type { ModelId } from "@/lib/ai/provider/model-registry";
import { FormattedDate } from "@/components/ui/formatted-date";
import { useTranslations } from "@/lib/i18n/client";
import {
  listAiModelSettingsAction,
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
  initialSearch = "",
  initialGroupFilter = "all",
  initialStatusFilter = "all",
  initialBannerError = null,
}: ModelsClientProps) {
  const t = useTranslations("adminOps");
  const [views, setViews] = useState<FeatureModelSettingView[]>(initialViews);
  const [drafts, setDrafts] = useState<Partial<Record<ModelFeature, ModelTrio>>>({});
  const [pendingFeature, setPendingFeature] = useState<ModelFeature | null>(null);
  const [pendingKind, setPendingKind] = useState<"save" | "reset" | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(initialBannerError);
  const [search, setSearch] = useState(initialSearch);
  const [groupFilter, setGroupFilter] = useState<"all" | ModelFeatureGroup>(initialGroupFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const customCount = useMemo(
    () => views.filter((view) => view.isCustom).length,
    [views],
  );
  const defaultCount = views.length - customCount;

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
      if (groupFilter !== "all" && view.group !== groupFilter) return false;
      if (statusFilter === "custom" && !view.isCustom) return false;
      if (statusFilter === "default" && view.isCustom) return false;
      if (!query) return true;

      const modelText = view.models
        .map((id) => `${id} ${formatModelLabel(id)}`)
        .join(" ")
        .toLowerCase();
      return (
        view.label.toLowerCase().includes(query) ||
        view.feature.toLowerCase().includes(query) ||
        view.description.toLowerCase().includes(query) ||
        modelText.includes(query)
      );
    });
  }, [views, groupFilter, statusFilter, search]);

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
      const runRefresh = onRefreshOverride ?? listAiModelSettingsAction;
      const result = await runRefresh();
      if (!result.ok) {
        setBannerError(result.error);
        toast.error(result.error);
        return;
      }
      setViews(result.views);
      setBannerError(null);
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
    <div className="space-y-6">
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label={t("modelsUI.totalFeatures")}
          value={views.length}
          icon={Layers}
        />
        <AdminStatStripItem
          label={t("modelsUI.customChains")}
          value={customCount}
          icon={SlidersHorizontal}
          tone={customCount > 0 ? "brand" : "default"}
        />
        <AdminStatStripItem
          label={t("modelsUI.defaultChains")}
          value={defaultCount}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label={t("modelsUI.availableModels")}
          value={selectableModels.length}

          icon={Cpu}
        />
      </AdminStatStrip>

      {bannerError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-status-error/30 bg-status-error/5 px-4 py-3 text-body-sm text-foreground"
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

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          ref={searchInputRef}
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          shortcut="/"
          placeholder={t("modelsUI.search")}
          containerClassName="min-w-[140px] flex-1"
        />

        <Select
          value={groupFilter}
          onValueChange={(value) => setGroupFilter(value as "all" | ModelFeatureGroup)}
        >
          <SelectTrigger
            aria-label={t("modelsUI.allGroups")}
            className="h-9 w-full rounded-lg text-body-sm sm:w-[210px] [&>span]:truncate"
          >
            <SelectValue placeholder={t("modelsUI.allGroups")} />
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
          <SelectTrigger aria-label={t("modelsUI.filterAll")} className="h-9 w-[140px] shrink-0 rounded-lg text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modelsUI.filterAll")}</SelectItem>
            <SelectItem value="custom">{t("modelsUI.filterCustom")}</SelectItem>
            <SelectItem value="default">{t("modelsUI.filterDefault")}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || pendingFeature !== null}
          className="h-9 px-3"
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-brand-primary" : ""}`} />
          <span>{t("modelsUI.refresh")}</span>
        </Button>
      </div>

      {groupedViews.length === 0 ? (
        <AdminEmptyState icon={Search} title={t("modelsUI.noMatchTitle")} description={t("modelsUI.noMatchDescription")}
          action={hasActiveFilter ? <Button variant="outline" size="sm" onClick={clearFilters}>{t("modelsUI.clearFilters")}</Button> : undefined} />
      ) : (
        <div className="space-y-6">
          {groupedViews.map(({ groupKey, items }) => (
            <section key={groupKey} className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <h2 className="font-heading text-body-base font-semibold text-foreground">
                  {t(`modelsUI.groups.${groupKey}`)}
                </h2>
              </div>

              <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
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
                      className="grid grid-cols-1 gap-4 p-4 transition-colors hover:bg-muted/15 xl:grid-cols-[minmax(220px,1fr)_minmax(480px,1.45fr)] xl:items-start sm:px-5"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-body-base font-semibold text-foreground">
                            {view.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-body-xs font-medium ${
                              view.isCustom
                                ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary"
                                : "border-border bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {view.isCustom ? t("modelsUI.statusCustom") : t("modelsUI.statusDefault")}
                          </span>
                          {view.supportsImages && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-body-xs text-muted-foreground">
                              <ImageIcon className="size-3" aria-hidden />
                              <span>{t("modelsUI.tagVisual")}</span>
                            </span>
                          )}
                          {view.requiresStreamingTools && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-body-xs text-muted-foreground">
                              <Wrench className="size-3" aria-hidden />
                              <span>{t("modelsUI.tagStreamingTools")}</span>
                            </span>
                          )}
                        </div>

                        <p className="text-body-xs text-muted-foreground leading-relaxed">
                          {view.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-muted-foreground">
                          <span>
                            {t("modelsUI.runtimeDefaultPrefix")}{" "}
                            {view.runtimeDefaultModels.map(formatModelLabel).join(", ")}
                          </span>
                        </div>

                        {view.isCustom && view.updatedAt && (
                          <p className="text-body-xs text-muted-foreground">
                            {t("modelsUI.updatedMeta", { time: "" }).trim()} {" "}
                            <FormattedDate date={view.updatedAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
                          </p>
                        )}

                        {view.supportsImages && !hasVisualInDraft && (
                          <p className="text-body-xs text-muted-foreground">
                            {t("modelsUI.visualFallbackHint")}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 space-y-3">
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                          {([0, 1, 2] as const).map((slotIndex) => {
                            const selectedId = draftModels[slotIndex];
                            return (
                              <div key={slotIndex} className="min-w-0 space-y-1">
                                <span className="block text-body-xs font-medium text-muted-foreground">
                                  {priorityLabels[slotIndex]}
                                </span>
                                <Select
                                  value={selectedId}
                                  disabled={isRowBusy}
                                  onValueChange={(val) =>
                                    handleModelChange(view, slotIndex, val as ModelId)
                                  }
                                >
                                  <SelectTrigger
                                    aria-label={`${view.label} ${priorityLabels[slotIndex]}`}
                                    className="h-9 w-full min-w-0 rounded-lg text-body-sm [&>span]:truncate"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {view.selectableModels.map((candidateId) => {
                                      const opt = getSelectableModelOption(candidateId);
                                      const inSlot = draftModels.indexOf(candidateId);
                                      const slotSuffix =
                                        inSlot !== -1 && inSlot !== slotIndex
                                          ? ` (${priorityLabels[inSlot]})`
                                          : "";
                                      return (
                                        <SelectItem key={candidateId} value={candidateId}>
                                          {opt.label}
                                          {slotSuffix}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {isDirty && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isRowBusy}
                              onClick={() => handleDiscardDraft(view.feature)}
                            >
                              {t("modelsUI.discard")}
                            </Button>
                          )}

                          {view.isCustom && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              isLoading={isResetting}
                              disabled={pendingFeature !== null && !isRowBusy}
                              onClick={() => handleReset(view)}
                            >
                              <RotateCcw className="size-3.5" />
                              <span>{t("modelsUI.resetDefault")}</span>
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant={isDirty ? "default" : "outline"}
                            size="sm"
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

      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex items-center gap-2 font-heading text-body-base font-semibold text-foreground">
          <Info className="size-4 text-brand-primary" aria-hidden />
          <span>{t("modelsUI.capabilityHeading")}</span>
        </div>
        <ul className="space-y-1.5 text-body-xs text-muted-foreground leading-relaxed list-disc pl-5">
          <li>{t("modelsUI.capabilityDistinct")}</li>
          <li>{t("modelsUI.capabilityOpsAi")}</li>
          <li>{t("modelsUI.capabilityVisual")}</li>
        </ul>
      </div>
    </div>
  );
}
