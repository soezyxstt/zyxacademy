"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Grid2X2, Plug, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslations } from "@/lib/i18n/client";
import { getSelectableModelOption, type FeatureModelSettingView } from "@/lib/ai/model-settings";
import { modelDisplayName } from "@/lib/ai/provider/recent-models";
import { TEXT_PROFILES, isTextProfile, type ModelId } from "@/lib/ai/provider/model-registry";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const provider = (id: ModelId) => isTextProfile(id) ? TEXT_PROFILES[id].label : "Google";
  const name = (id: ModelId) => modelDisplayName(view.modelLabels?.[id] ?? getSelectableModelOption(id).label);
  const providers = [...new Set(view.selectableModels.map(provider))];
  const options = view.selectableModels.filter(id => (!filter || provider(id) === filter) &&
    ([provider(id), name(id), view.modelLabels?.[id], id].join(" ")).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Popover open={open && !disabled} onOpenChange={next => { setOpen(next); setQuery(""); setFilter(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} aria-label={label + ": " + name(value)} className="w-full text-left [&>span]:justify-start">
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
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map(id => (
              <Button key={id} variant="ghost" className="h-auto w-full px-2 py-2 text-left [&>span]:justify-start" aria-pressed={value === id}
                onClick={() => { onChange(id); setOpen(false); }}>
                <ProviderIcon provider={provider(id)} />
                <span className="min-w-0 flex-1 whitespace-normal break-words">{name(id)}</span>
                {priorities[id] && <span className="shrink-0 text-body-xs text-muted-foreground">{priorities[id]}</span>}
                {value === id && <Check aria-hidden className="size-4 shrink-0" />}
              </Button>
            ))}
            {!options.length && <p role="status" className="p-2 text-body-xs text-muted-foreground">{t("modelsUI.noModels")}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
