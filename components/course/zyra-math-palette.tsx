"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sigma } from "lucide-react";

interface MathSymbol {
  /** Rendered glyph on the palette button. */
  label: string;
  /** Text inserted into the composer at the caret. */
  insert: string;
  description: string;
}

const SYMBOL_GROUPS: Record<string, MathSymbol[]> = {
  populer: [
    { label: "x\u00B2", insert: "^2", description: "Kuadrat" },
    { label: "x\u00B3", insert: "^3", description: "Pangkat tiga" },
    { label: "x\u207F", insert: "^", description: "Pangkat" },
    { label: "\u221A", insert: "\\sqrt{}", description: "Akar kuadrat" },
    { label: "\u2044", insert: "\\frac{}{}", description: "Pecahan" },
    { label: "\u222B\u2090\u1D47", insert: "\\int_{a}^{b} ", description: "Integral tentu" },
    { label: "\u03C0", insert: "\\pi ", description: "Pi" },
    { label: "\u2264", insert: "\\le ", description: "Lebih kecil sama dengan" },
    { label: "\u2265", insert: "\\ge ", description: "Lebih besar sama dengan" },
    { label: "\u2260", insert: "\\ne ", description: "Tidak sama dengan" },
  ],
  trig: [
    { label: "sin", insert: "\\sin(", description: "Sinus" },
    { label: "cos", insert: "\\cos(", description: "Cosinus" },
    { label: "tan", insert: "\\tan(", description: "Tangen" },
    { label: "log", insert: "\\log(", description: "Logaritma basis 10" },
    { label: "ln", insert: "\\ln(", description: "Logaritma natural" },
    { label: "e\u02E3", insert: "e^", description: "Eksponensial" },
    { label: "\u03B8", insert: "\\theta ", description: "Theta" },
    { label: "\u00B0", insert: "^\\circ ", description: "Derajat" },
    { label: "\u00B1", insert: "\\pm ", description: "Plus minus" },
    { label: "\u221E", insert: "\\infty ", description: "Tak hingga" },
  ],
  kalkulus: [
    { label: "\u222B", insert: "\\int ", description: "Integral" },
    { label: "\u222C", insert: "\\iint ", description: "Integral lipat dua" },
    { label: "d/dx", insert: "\\frac{\\mathrm{d}}{\\mathrm{d}x} ", description: "Turunan" },
    { label: "\u2202", insert: "\\partial ", description: "Turunan parsial" },
    { label: "lim", insert: "\\lim_{x \\to 0} ", description: "Limit" },
    { label: "\u03A3", insert: "\\sum_{n=1}^{\\infty} ", description: "Sigma, deret" },
    { label: "\u220F", insert: "\\prod ", description: "Pi produk" },
    { label: "\u2192", insert: "\\to ", description: "Menuju" },
    { label: "\u2032", insert: "'", description: "Prima, turunan" },
    { label: "(n k)", insert: "\\binom{n}{k}", description: "Kombinasi" },
  ],
  himpunan: [
    { label: "\u2208", insert: "\\in ", description: "Anggota dari" },
    { label: "\u2209", insert: "\\notin ", description: "Bukan anggota" },
    { label: "\u2282", insert: "\\subset ", description: "Himpunan bagian" },
    { label: "\u2286", insert: "\\subseteq ", description: "Bagian dari atau sama" },
    { label: "\u222A", insert: "\\cup ", description: "Gabungan" },
    { label: "\u2229", insert: "\\cap ", description: "Irisan" },
    { label: "\u2205", insert: "\\emptyset ", description: "Himpunan kosong" },
    { label: "\u21D2", insert: "\\Rightarrow ", description: "Implikasi" },
    { label: "\u21D4", insert: "\\Leftrightarrow ", description: "Biimplikasi" },
    { label: "\u2200 \u2203", insert: "\\forall \\exists ", description: "Kuantor semua dan ada" },
  ],
  yunani: [
    { label: "\u03B1", insert: "\\alpha ", description: "Alfa" },
    { label: "\u03B2", insert: "\\beta ", description: "Beta" },
    { label: "\u03B3", insert: "\\gamma ", description: "Gama" },
    { label: "\u03B4", insert: "\\delta ", description: "Delta kecil" },
    { label: "\u03B5", insert: "\\varepsilon ", description: "Epsilon" },
    { label: "\u03BB", insert: "\\lambda ", description: "Lambda" },
    { label: "\u03BC", insert: "\\mu ", description: "Mu" },
    { label: "\u03C6", insert: "\\phi ", description: "Fi" },
    { label: "\u03C9", insert: "\\omega ", description: "Omega kecil" },
    { label: "\u03A9", insert: "\\Omega ", description: "Omega besar" },
  ],
};

const TAB_ITEMS = [
  { value: "populer", label: "Populer" },
  { value: "trig", label: "Trig & Log" },
  { value: "kalkulus", label: "Kalkulus" },
  { value: "himpunan", label: "Relasi & Himpunan" },
  { value: "yunani", label: "Yunani" },
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
                aria-label="Input matematika"
                aria-expanded={open}
                className={cnTrigger(open)}
              >
                <Sigma className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Input matematika</TooltipContent>
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
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-2">
              <div className="grid grid-cols-5 gap-1">
                {SYMBOL_GROUPS[tab.value].map((symbol) => (
                  <button
                    key={`${tab.value}-${symbol.description}`}
                    type="button"
                    onClick={() => {
                      onInsert(symbol.insert);
                    }}
                    title={symbol.description}
                    aria-label={`Sisipkan ${symbol.description}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-background font-mono text-body-sm text-foreground hover:bg-muted hover:border-brand-primary/40 transition-colors"
                  >
                    {symbol.label}
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <p className="mt-1.5 text-body-xs text-muted-foreground text-center select-none">
          Simbol disisipkan di posisi kursor
        </p>
      </PopoverContent>
    </Popover>
  );
}

function cnTrigger(open: boolean) {
  return `size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/80 ${open ? "text-brand-primary bg-muted/60" : ""}`;
}
