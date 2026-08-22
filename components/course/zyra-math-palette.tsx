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
    { label: "\u221A", insert: "\u221A", description: "Akar kuadrat" },
    { label: "\u2044", insert: "/", description: "Pecahan" },
    { label: "\u222B\u2090\u1D47", insert: "\u222B_a^b", description: "Integral tentu" },
    { label: "\u03C0", insert: "\u03C0", description: "Pi" },
    { label: "\u2264", insert: "\u2264", description: "Lebih kecil sama dengan" },
    { label: "\u2265", insert: "\u2265", description: "Lebih besar sama dengan" },
    { label: "\u2260", insert: "\u2260", description: "Tidak sama dengan" },
  ],
  trig: [
    { label: "sin", insert: "sin(", description: "Sinus" },
    { label: "cos", insert: "cos(", description: "Cosinus" },
    { label: "tan", insert: "tan(", description: "Tangen" },
    { label: "log", insert: "log(", description: "Logaritma basis 10" },
    { label: "ln", insert: "ln(", description: "Logaritma natural" },
    { label: "e\u02E3", insert: "e^", description: "Eksponensial" },
    { label: "\u03B8", insert: "\u03B8", description: "Theta" },
    { label: "\u00B0", insert: "\u00B0", description: "Derajat" },
    { label: "\u00B1", insert: "\u00B1", description: "Plus minus" },
    { label: "\u221E", insert: "\u221E", description: "Tak hingga" },
  ],
  kalkulus: [
    { label: "\u222B", insert: "\u222B", description: "Integral" },
    { label: "\u222C", insert: "\u222C", description: "Integral lipat dua" },
    { label: "d/dx", insert: "d/dx ", description: "Turunan" },
    { label: "\u2202", insert: "\u2202", description: "Turunan parsial" },
    { label: "lim", insert: "lim", description: "Limit" },
    { label: "\u03A3", insert: "\u03A3", description: "Sigma, deret" },
    { label: "\u220F", insert: "\u220F", description: "Pi produk" },
    { label: "\u2192", insert: "\u2192", description: "Menuju" },
    { label: "\u2032", insert: "'", description: "Prima, turunan" },
    { label: "(n k)", insert: "C(n,k)", description: "Kombinasi" },
  ],
  himpunan: [
    { label: "\u2208", insert: "\u2208", description: "Anggota dari" },
    { label: "\u2209", insert: "\u2209", description: "Bukan anggota" },
    { label: "\u2282", insert: "\u2282", description: "Himpunan bagian" },
    { label: "\u2286", insert: "\u2286", description: "Bagian dari atau sama" },
    { label: "\u222A", insert: "\u222A", description: "Gabungan" },
    { label: "\u2229", insert: "\u2229", description: "Irisan" },
    { label: "\u2205", insert: "\u2205", description: "Himpunan kosong" },
    { label: "\u21D2", insert: "\u21D2", description: "Implikasi" },
    { label: "\u21D4", insert: "\u21D4", description: "Biimplikasi" },
    { label: "\u2200 \u2203", insert: "\u2200 \u2203 ", description: "Kuantor semua dan ada" },
  ],
  yunani: [
    { label: "\u03B1", insert: "\u03B1", description: "Alfa" },
    { label: "\u03B2", insert: "\u03B2", description: "Beta" },
    { label: "\u03B3", insert: "\u03B3", description: "Gama" },
    { label: "\u03B4", insert: "\u03B4", description: "Delta kecil" },
    { label: "\u03B5", insert: "\u03B5", description: "Epsilon" },
    { label: "\u03BB", insert: "\u03BB", description: "Lambda" },
    { label: "\u03BC", insert: "\u03BC", description: "Mu" },
    { label: "\u03C6", insert: "\u03C6", description: "Fi" },
    { label: "\u03C9", insert: "\u03C9", description: "Omega kecil" },
    { label: "\u03A9", insert: "\u03A9", description: "Omega besar" },
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
        <Tabs defaultValue="populer">
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
