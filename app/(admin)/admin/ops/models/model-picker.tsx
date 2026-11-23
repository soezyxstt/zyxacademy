"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, CircleHelp, Grid2X2, Plug, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { getSelectableModelOption, type FeatureModelSettingView } from "@/lib/ai/model-settings";
import { modelDisplayName } from "@/lib/ai/provider/recent-models";
import { getTextProfile, isTextProfile, type ModelId } from "@/lib/ai/provider/model-registry";
import { medianModelLatency, sortModelsByDate } from "@/lib/ai/provider/model-observations";

const providerLogos: Partial<Record<string, string>> = {
  Google: "gemini",
  "OpenAI GPT": "openai",
  DeepSeek: "deepseek",
  "Meta Muse": "meta",
};

function ProviderIcon({ provider }: { provider: string }) {
  const logo = providerLogos[provider];
  if (!logo) {
    const Icon = provider ? Plug : Grid2X2;
    return <Icon aria-hidden className="size-4 shrink-0" />;
  }
  return <span aria-hidden className="size-4 shrink-0 bg-current"
    style={{ mask: `url(/icons/ai-providers/${logo}.svg) center / contain no-repeat` }} />;
}

export function ModelPicker({ view, value, label, disabled, onChange, priorities }: {
  view: FeatureModelSettingView;
  value: ModelId;
  label: string;
  disabled: boolean;
  onChange: (id: ModelId) => void;
  priorities: Partial<Record<ModelId, string>>;
}) {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [openedAt, setOpenedAt] = useState(0);
  const provider = (id: ModelId) => isTextProfile(id) ? getTextProfile(id)!.label : "Google";
  const name = (id: ModelId) => modelDisplayName(view.modelLabels?.[id] ?? getSelectableModelOption(id).label);
  const providers = [...new Set(view.selectableModels.map(provider))];
  const options = sortModelsByDate(view.selectableModels, view.modelDates ?? {}).filter(id => (!filter || provider(id) === filter) &&
    ([provider(id), name(id), view.modelLabels?.[id], id].join(" ")).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Popover open={open && !disabled} onOpenChange={next => { setOpen(next); setOpenedAt(Date.now()); setQuery(""); setFilter(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} aria-label={label + ": " + name(value)} className="h-9 w-full min-w-0 text-left [&>span]:justify-start">
          <span className="min-w-0 flex-1 truncate">{name(value)}</span><ChevronsUpDown aria-hidden className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} aria-label={label}
        className="grid w-[22rem] max-w-[calc(100vw-1.5rem)] grid-cols-[2.75rem_minmax(0,1fr)] overflow-hidden rounded-xl p-0">
        <div className="flex flex-col items-center gap-1 border-r border-border bg-muted/30 py-2">
          {["", ...providers].map(item => {
            const title = item || t("modelsUI.allProviders");
            return <Button key={item} type="button" variant={filter === item ? "secondary" : "ghost"} size="icon"
              className="size-9" title={title} aria-label={title} aria-pressed={filter === item} onClick={() => setFilter(item)}>
              <ProviderIcon provider={item} />
            </Button>;
          })}
        </div>
        <div className="min-w-0 p-2">
          <div className="flex items-center gap-2 border-b border-border px-2 focus-within:border-primary">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Input autoFocus className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" aria-label={t("modelsUI.findModel")} placeholder={t("modelsUI.findModel")} value={query} onChange={event => setQuery(event.target.value)} />
            <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label={t("modelsUI.modelDataHelp")}><CircleHelp aria-hidden className="size-4" /></Button></PopoverTrigger>
              <PopoverContent className="text-body-xs" align="end">{t("modelsUI.modelDataExplanation")}</PopoverContent>
            </Popover>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map(id => {
              const date = view.modelDates?.[id], observation = view.modelLatencies?.[id];
              const live = view.requestLatencies?.[id] ?? view.requestLatencies?.[id.split(":").at(-1)!];
              const ordered = live?.samples.slice().sort((a, b) => a - b) ?? [];
              const mid = Math.floor(ordered.length / 2);
              const median = ordered.length ? (ordered[mid] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2 : medianModelLatency(observation);
              const measuredAt = live?.checkedAt ?? observation?.checkedAt;
              const stale = measuredAt && openedAt - measuredAt >= 12 * 60 * 60_000;
              const missingStatus = observation?.status ?? "unmeasured";
              const latency = median === undefined ? t(`modelsUI.probeStatus.${missingStatus}`) : `${stale ? t("modelsUI.staleLatency") + " " : ""}${(median / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} s`;
              const latencyDescription = median === undefined ? latency : t(live ? "modelsUI.requestLatencyMeasured" : "modelsUI.latencyMeasured", { value: latency, count: ordered.length, time: new Date(measuredAt!).toLocaleString(locale) });
              return <Button key={id} variant="ghost" className="h-auto w-full px-2 py-2 text-left [&>span]:justify-start" aria-pressed={value === id}
                aria-label={name(id)} aria-description={[priorities[id], date && `${t(date.kind === "released" ? "modelsUI.releasedAt" : "modelsUI.createdAt")} ${new Date(date.timestamp).toLocaleDateString(locale, { timeZone: "UTC" })}`, latencyDescription].filter(Boolean).join(". ")}
                onClick={() => { onChange(id); setOpen(false); }}>
                <ProviderIcon provider={provider(id)} />
                <span className="min-w-0 flex-1 whitespace-normal break-words">{name(id)}
                  {date && <span aria-hidden className="block text-body-xs text-muted-foreground">{t(date.kind === "released" ? "modelsUI.releasedAt" : "modelsUI.createdAt")} {new Date(date.timestamp).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span>}
                </span>
                {priorities[id] && <span className="shrink-0 text-body-xs text-muted-foreground">{priorities[id]}</span>}
                {value === id && <Check aria-hidden className="size-4 shrink-0" />}
                <span aria-hidden title={latencyDescription} className="shrink-0 self-start whitespace-nowrap text-body-xs tabular-nums text-muted-foreground">{latency}</span>
              </Button>;
            })}
            {!options.length && <p role="status" className="p-2 text-body-xs text-muted-foreground">{t("modelsUI.noModels")}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
