"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sigma } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";

interface MathSymbol {
  /** Rendered glyph on the palette button. */
  label: string;
  /** Text inserted into the composer at the caret. */
  insert: string;
}

const SYMBOL_GROUPS: Record<string, MathSymbol[]> = {
  populer: [
    { label: "x\u00B2", insert: "^2" },
    { label: "x\u00B3", insert: "^3" },
    { label: "x\u207F", insert: "^" },
    { label: "\u221A", insert: "\\sqrt{}" },
    { label: "\u2044", insert: "\\frac{}{}" },
    { label: "\u222B\u2090\u1D47", insert: "\\int_{a}^{b} " },
    { label: "\u03C0", insert: "\\pi " },
    { label: "\u2264", insert: "\\le " },
    { label: "\u2265", insert: "\\ge " },
    { label: "\u2260", insert: "\\ne " },
  ],
  trig: [
    { label: "sin", insert: "\\sin(" },
    { label: "cos", insert: "\\cos(" },
    { label: "tan", insert: "\\tan(" },
    { label: "log", insert: "\\log(" },
    { label: "ln", insert: "\\ln(" },
    { label: "e\u02E3", insert: "e^" },
    { label: "\u03B8", insert: "\\theta " },
    { label: "\u00B0", insert: "^\\circ " },
    { label: "\u00B1", insert: "\\pm " },
    { label: "\u221E", insert: "\\infty " },
  ],
  kalkulus: [
    { label: "\u222B", insert: "\\int " },
    { label: "\u222C", insert: "\\iint " },
    { label: "d/dx", insert: "\\frac{\\mathrm{d}}{\\mathrm{d}x} " },
    { label: "\u2202", insert: "\\partial " },
    { label: "lim", insert: "\\lim_{x \\to 0} " },
    { label: "\u03A3", insert: "\\sum_{n=1}^{\\infty} " },
    { label: "\u220F", insert: "\\prod " },
    { label: "\u2192", insert: "\\to " },
    { label: "\u2032", insert: "'" },
    { label: "(n k)", insert: "\\binom{n}{k}" },
  ],
  himpunan: [
    { label: "\u2208", insert: "\\in " },
    { label: "\u2209", insert: "\\notin " },
    { label: "\u2282", insert: "\\subset " },
    { label: "\u2286", insert: "\\subseteq " },
    { label: "\u222A", insert: "\\cup " },
    { label: "\u2229", insert: "\\cap " },
    { label: "\u2205", insert: "\\emptyset " },
    { label: "\u21D2", insert: "\\Rightarrow " },
    { label: "\u21D4", insert: "\\Leftrightarrow " },
    { label: "\u2200 \u2203", insert: "\\forall \\exists " },
  ],
  yunani: [
    { label: "\u03B1", insert: "\\alpha " },
    { label: "\u03B2", insert: "\\beta " },
    { label: "\u03B3", insert: "\\gamma " },
    { label: "\u03B4", insert: "\\delta " },
    { label: "\u03B5", insert: "\\varepsilon " },
    { label: "\u03BB", insert: "\\lambda " },
    { label: "\u03BC", insert: "\\mu " },
    { label: "\u03C6", insert: "\\phi " },
    { label: "\u03C9", insert: "\\omega " },
    { label: "\u03A9", insert: "\\Omega " },
  ],
};

const TAB_ITEMS = [
  { value: "populer", label: "populer" },
  { value: "trig", label: "trig" },
  { value: "kalkulus", label: "kalkulus" },
  { value: "himpunan", label: "himpunan" },
  { value: "yunani", label: "yunani" },
] as const;

/**
 * Compact tabbed math symbol palette. Opens on demand next to the composer
 * controls and inserts the chosen symbol at the textarea caret, so it stays
 * out of the way until needed.
 */
export function ZyraMathPalette({
  onInsert,
  disabled,
}: {
  onInsert: (snippet: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations("studentCourse");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={t("mathPalette.open")}
                aria-expanded={open}
                className={cnTrigger(open)}
              >
                <Sigma className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{t("mathPalette.open")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-2.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Tabs defaultValue="populer" syncUrl={false}>
          <TabsList className="w-full flex-wrap h-auto gap-0.5">
            {TAB_ITEMS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-body-xs px-2 py-1">
                {t(`mathPalette.tabs.${tab.label}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-2">
              <div className="grid grid-cols-5 gap-1">
                {SYMBOL_GROUPS[tab.value].map((symbol, index) => {
                  const label = t(`mathPalette.symbols.${tab.value}.s${index}`);
                  return (
                  <button
                    key={`${tab.value}-${symbol.insert}`}
                    type="button"
                    onClick={() => {
                      onInsert(symbol.insert);
                    }}
                    title={label}
                    aria-label={t("mathPalette.insertSymbol", { symbol: label })}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-background font-mono text-body-sm text-foreground hover:bg-muted hover:border-brand-primary/40 transition-colors"
                  >
                    {symbol.label}
                  </button>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <p className="mt-1.5 text-body-xs text-muted-foreground text-center select-none">
          {t("mathPalette.insertAtCursor")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function cnTrigger(open: boolean) {
  return `size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/80 ${open ? "text-brand-primary bg-muted/60" : ""}`;
}
