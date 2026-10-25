"use client";

import React, { useState, useRef, useMemo, useCallback } from "react";
import katex from "@/lib/math/katex";
import "katex/dist/katex.min.css";
import { X, Sigma, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  validateAndNormalizeScientificAnswer,
  scientificTextToLatex,
} from "@/lib/math/scientific-answer-normalizer";

export type ScientificCategory = "math" | "physics" | "chem";

export interface ScientificSymbolItem {
  label: string;
  code: string;
  title?: string;
}

export const SCIENTIFIC_PALETTES: Record<ScientificCategory, ScientificSymbolItem[]> = {
  math: [
    // Pangkat, Akar & Pecahan
    { label: "x²", code: "^2", title: "Pangkat dua" },
    { label: "x³", code: "^3", title: "Pangkat tiga" },
    { label: "xⁿ", code: "^{}", title: "Pangkat umum" },
    { label: "a/b", code: "\\frac{}{}", title: "Pecahan" },
    { label: "√x", code: "\\sqrt{}", title: "Akar kuadrat" },
    { label: "ⁿ√x", code: "\\sqrt[]{}", title: "Akar pangkat n" },
    { label: "xₙ", code: "_{}", title: "Subskrip indeks" },
    { label: "x₀", code: "_0", title: "Subskrip nol" },
    { label: "xᵢ", code: "_i", title: "Subskrip i" },
    // Operator & Simbol
    { label: "±", code: "\\pm", title: "Plus minus" },
    { label: "∓", code: "\\mp", title: "Minus plus" },
    { label: "×", code: "\\times", title: "Kali" },
    { label: "÷", code: "\\div", title: "Bagi" },
    { label: "·", code: "\\cdot", title: "Titik perkalian" },
    { label: "π", code: "\\pi", title: "Pi" },
    { label: "e", code: "e", title: "Konstanta Euler" },
    { label: "∞", code: "\\infty", title: "Tak hingga" },
    // Relasi & Logika
    { label: "≤", code: "\\le", title: "Kurang dari sama dengan" },
    { label: "≥", code: "\\ge", title: "Lebih dari sama dengan" },
    { label: "≠", code: "\\ne", title: "Tidak sama dengan" },
    { label: "≈", code: "\\approx", title: "Mendekati" },
    { label: "∈", code: "\\in", title: "Elemen dari" },
    { label: "∉", code: "\\notin", title: "Bukan elemen dari" },
    // Kalkulus & Aljabar
    { label: "dy/dx", code: "\\frac{dy}{dx}", title: "Turunan dy/dx" },
    { label: "∂/∂x", code: "\\frac{\\partial}{\\partial x}", title: "Turunan parsial" },
    { label: "∫", code: "\\int", title: "Integral tak tentu" },
    { label: "∫ₐᵇ", code: "\\int_{}^{}", title: "Integral tentu" },
    { label: "∑", code: "\\sum", title: "Sigma / Penjumlahan" },
    { label: "lim", code: "\\lim_{x \\to }", title: "Limit" },
    { label: "→", code: "\\to", title: "Menuju ke" },
    // Trigonometri & Logaritma
    { label: "sin", code: "\\sin", title: "Sinus" },
    { label: "cos", code: "\\cos", title: "Cosinus" },
    { label: "tan", code: "\\tan", title: "Tangen" },
    { label: "arcsin", code: "\\arcsin", title: "Invers sinus" },
    { label: "arccos", code: "\\arccos", title: "Invers cosinus" },
    { label: "arctan", code: "\\arctan", title: "Invers tangen" },
    { label: "ln", code: "\\ln", title: "Logaritma natural" },
    { label: "log", code: "\\log", title: "Logaritma basis 10" },
    // Kurung Khusus
    { label: "|x|", code: "|{}|", title: "Nilai mutlak" },
    { label: "[x]", code: "[{}]", title: "Kurung siku" },
    { label: "{x}", code: "\\{{}\\}", title: "Kurung kurawal" },
  ],
  physics: [
    // Sudut & Huruf Yunani
    { label: "θ", code: "\\theta", title: "Sudut theta" },
    { label: "ϕ", code: "\\phi", title: "Sudut phi" },
    { label: "λ", code: "\\lambda", title: "Panjang gelombang" },
    { label: "Δ", code: "\\Delta", title: "Perubahan / Delta" },
    { label: "ω", code: "\\omega", title: "Kecepatan sudut" },
    { label: "Ω", code: "\\Omega", title: "Ohm / Hambatan" },
    { label: "μ", code: "\\mu", title: "Koefisien gesek / mikro" },
    { label: "α", code: "\\alpha", title: "Percepatan sudut / alfa" },
    { label: "β", code: "\\beta", title: "Beta" },
    { label: "γ", code: "\\gamma", title: "Gamma" },
    { label: "ρ", code: "\\rho", title: "Massa jenis" },
    { label: "τ", code: "\\tau", title: "Torsi" },
    { label: "σ", code: "\\sigma", title: "Tegangan / konduktivitas" },
    { label: "ε₀", code: "\\varepsilon_0", title: "Permitivitas vakum" },
    { label: "ℏ", code: "\\hbar", title: "Konstanta Planck tereduksi" },
    // Notasi Ilmiah & Derajat
    { label: "10ⁿ", code: "10^{}", title: "Pangkat 10 positif" },
    { label: "10⁻ⁿ", code: "10^{-}", title: "Pangkat 10 negatif" },
    { label: "°", code: "^\\circ", title: "Derajat" },
    { label: "°C", code: "^\\circ\\text{C}", title: "Derajat Celcius" },
    // Vektor & Kinematika
    { label: "v₀", code: "v_0", title: "Kecepatan awal" },
    { label: "a_t", code: "a_t", title: "Percepatan tangensial" },
    { label: "v⃗", code: "\\vec{v}", title: "Vektor kecepatan" },
    { label: "F⃗", code: "\\vec{F}", title: "Vektor gaya" },
    { label: "î", code: "\\hat{i}", title: "Vektor satuan i" },
    { label: "ĵ", code: "\\hat{j}", title: "Vektor satuan j" },
    { label: "k̂", code: "\\hat{k}", title: "Vektor satuan k" },
    // Termodinamika
    { label: "ΔU", code: "\\Delta U", title: "Perubahan energi dalam" },
    { label: "ΔS", code: "\\Delta S", title: "Perubahan entropi" },
    { label: "Q", code: "Q", title: "Kalor" },
    { label: "W", code: "W", title: "Usaha" },
    { label: "η", code: "\\eta", title: "Efisiensi termal" },
    // Satuan
    { label: "m/s", code: " m/s", title: "Meter per detik" },
    { label: "m/s²", code: " m/s^2", title: "Meter per detik kuadrat" },
    { label: "kg", code: " kg", title: "Kilogram" },
    { label: "N", code: " N", title: "Newton" },
    { label: "J", code: " J", title: "Joule" },
    { label: "W", code: " W", title: "Watt" },
    { label: "Pa", code: " Pa", title: "Pascal" },
    { label: "Hz", code: " Hz", title: "Hertz" },
    { label: "eV", code: " eV", title: "Elektronvolt" },
    { label: "K", code: " K", title: "Kelvin" },
  ],
  chem: [
    // Molekul Umum
    { label: "H₂O", code: "H2O", title: "Air" },
    { label: "CO₂", code: "CO2", title: "Karbon dioksida" },
    { label: "CH₄", code: "CH4", title: "Metana" },
    { label: "NH₃", code: "NH3", title: "Amonia" },
    { label: "H₂SO₄", code: "H2SO4", title: "Asam sulfat" },
    { label: "O₂", code: "O2", title: "Oksigen" },
    { label: "H⁺", code: "H^+", title: "Ion hidrogen" },
    { label: "OH⁻", code: "OH^-", title: "Ion hidroksida" },
    // Muatan Ion
    { label: "²⁺", code: "^{2+}", title: "Muatan kation 2+" },
    { label: "³⁺", code: "^{3+}", title: "Muatan kation 3+" },
    { label: "⁴⁺", code: "^{4+}", title: "Muatan kation 4+" },
    { label: "⁻", code: "^-", title: "Muatan anion 1-" },
    { label: "²⁻", code: "^{2-}", title: "Muatan anion 2-" },
    { label: "³⁻", code: "^{3-}", title: "Muatan anion 3-" },
    // Panah Reaksi
    { label: "→", code: "->", title: "Reaksi searah" },
    { label: "⇌", code: "<=>", title: "Reaksi kesetimbangan" },
    { label: "↔", code: "\\leftrightarrow", title: "Resonansi" },
    { label: "↑", code: "\\uparrow", title: "Pelepasan gas" },
    { label: "↓", code: "\\downarrow", title: "Endapan" },
    // Fase Zat
    { label: "(aq)", code: "(aq)", title: "Larutan akuatik" },
    { label: "(g)", code: "(g)", title: "Fase gas" },
    { label: "(s)", code: "(s)", title: "Fase padat" },
    { label: "(l)", code: "(l)", title: "Fase cair" },
    // Termokimia & Kesetimbangan
    { label: "ΔH", code: "\\Delta H", title: "Entalpi reaksi" },
    { label: "ΔG°", code: "\\Delta G^\\circ", title: "Energi bebas Gibbs standar" },
    { label: "ΔS", code: "\\Delta S", title: "Entropi" },
    { label: "Ka", code: "K_a", title: "Konstanta asam" },
    { label: "Kb", code: "K_b", title: "Konstanta basa" },
    { label: "Ksp", code: "K_{sp}", title: "Hasil kali kelarutan" },
    { label: "pH", code: "\\text{pH}", title: "pH" },
    { label: "E°", code: "E^\\circ", title: "Potensial sel standar" },
    // Ikatan
    { label: "—", code: "-", title: "Ikatan tunggal" },
    { label: "═", code: "=", title: "Ikatan rangkap dua" },
    { label: "≡", code: "\\equiv", title: "Ikatan rangkap tiga" },
  ],
};

export interface ScientificInputProps {
  value: string;
  onChange: (value: string) => void;
  onNormalizedChange?: (normalized: { raw: string; normalized: string; latex: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultCategory?: ScientificCategory;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  initialPaletteOpen?: boolean;
}

export function ScientificInput({
  value,
  onChange,
  onNormalizedChange,
  placeholder,
  disabled = false,
  defaultCategory = "math",
  className,
  autoFocus = false,
  id,
  name,
  initialPaletteOpen = false,
}: ScientificInputProps) {
  const t = useTranslations("ui");
  const [activeCategory, setActiveCategory] = useState<ScientificCategory>(defaultCategory);
  const [isPaletteOpen, setIsPaletteOpen] = useState(initialPaletteOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validation & KaTeX conversion
  const validation = useMemo(() => {
    return validateAndNormalizeScientificAnswer(value);
  }, [value]);

  // Render KaTeX HTML
  const renderedHtml = useMemo(() => {
    if (!value.trim()) return null;
    const latexExpr = scientificTextToLatex(value);
    try {
      return katex.renderToString(latexExpr, {
        displayMode: false,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [value]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextVal = e.target.value;
      onChange(nextVal);
      if (onNormalizedChange) {
        const result = validateAndNormalizeScientificAnswer(nextVal);
        onNormalizedChange({
          raw: nextVal,
          normalized: result.normalized,
          latex: result.latex,
        });
      }
    },
    [onChange, onNormalizedChange],
  );

  const insertSymbol = useCallback(
    (code: string) => {
      if (disabled) return;
      const input = inputRef.current;
      if (!input) return;

      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;

      let insertedText = code;
      let newCursor = start + code.length;

      if (code.includes("{}")) {
        const selected = value.substring(start, end);
        if (selected) {
          insertedText = code.replace("{}", `{${selected}}`);
          newCursor = start + insertedText.length;
        } else {
          newCursor = start + code.indexOf("{}") + 1;
        }
      }

      const nextVal = value.substring(0, start) + insertedText + value.substring(end);
      onChange(nextVal);

      if (onNormalizedChange) {
        const result = validateAndNormalizeScientificAnswer(nextVal);
        onNormalizedChange({
          raw: nextVal,
          normalized: result.normalized,
          latex: result.latex,
        });
      }

      // Restore focus and cursor position smoothly
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(newCursor, newCursor);
      });
    },
    [disabled, onChange, onNormalizedChange, value],
  );

  const handleClear = useCallback(() => {
    if (disabled) return;
    onChange("");
    if (onNormalizedChange) {
      onNormalizedChange({ raw: "", normalized: "", latex: "" });
    }
    inputRef.current?.focus();
  }, [disabled, onChange, onNormalizedChange]);

  const currentSymbols = SCIENTIFIC_PALETTES[activeCategory] || [];
  const validationErrorMessage = validation.error === "Tanda kurung penutup tidak cocok atau berlebih."
    ? t("scientific.errors.mismatchedClosing")
    : validation.error === "Kurung kurawal belum tertutup."
      ? t("scientific.errors.unclosedBrace")
      : validation.error === "Kurung siku belum tertutup."
        ? t("scientific.errors.unclosedBracket")
        : validation.error
          ? t("scientific.errors.unclosedParenthesis")
          : undefined;

  return (
    <div className={cn("space-y-1 font-sans", className)}>
      {/* Error description: immediately ABOVE input field when invalid */}
      {!validation.isValid && validationErrorMessage && (
        <p className="text-body-xs font-medium text-status-error animate-in fade-in duration-200">
          {validationErrorMessage}
        </p>
      )}

      {/* Main input container with actions */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder ?? t("scientific.placeholder")}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            "w-full h-10 rounded-lg border bg-background pl-3 pr-20 text-body-sm font-medium text-foreground placeholder:text-muted-foreground",
            "transition-colors focus:outline-none",
            validation.isValid
              ? "border-border hover:border-border/80 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30"
              : "border-status-error focus:border-status-error focus:ring-1 focus:ring-status-error/30",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />

        {/* Right inline controls: Clear and Palette Toggle */}
        <div className="absolute right-1.5 flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 flex items-center justify-center transition-colors"
              title={t("scientific.clear")}
              aria-label={t("scientific.clear")}
            >
              <X className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPaletteOpen((prev) => !prev)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-body-xs font-semibold border transition-colors select-none",
              isPaletteOpen
                ? "border-brand-primary/40 bg-brand-primary/10 text-brand-primary"
                : "border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50",
            )}
            title={t("scientific.togglePalette")}
            aria-label={t("scientific.paletteLabel")}
            aria-expanded={isPaletteOpen}
          >
            <Sigma className="size-3" />
            <span className="text-body-2xs font-semibold">{t("scientific.symbols")}</span>
            {isPaletteOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>
      </div>

      {/* Dimmed live KaTeX preview: directly BELOW input field, NO 'Pratinjau:' label */}
      <div
        className="min-h-[1.25rem] px-1 flex items-center text-body-xs text-muted-foreground/80 overflow-x-auto scrollbar-none"
        aria-live="polite"
      >
        {renderedHtml ? (
          <div
            className="font-serif italic text-foreground opacity-80"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : null}
      </div>

      {/* Collapsible Palette Drawer */}
      {isPaletteOpen && (
        <div className="pt-1.5 space-y-1.5 border-t border-border animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Category Tabs (Compact) */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 text-body-xs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === "math"}
                onClick={() => setActiveCategory("math")}
                className={cn(
                  "px-2.5 py-0.5 rounded-md text-body-xs font-semibold transition-colors",
                  activeCategory === "math"
                    ? "bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50",
                )}
              >
                {t("scientific.math")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === "physics"}
                onClick={() => setActiveCategory("physics")}
                className={cn(
                  "px-2.5 py-0.5 rounded-md text-body-xs font-semibold transition-colors",
                  activeCategory === "physics"
                    ? "bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50",
                )}
              >
                {t("scientific.physics")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === "chem"}
                onClick={() => setActiveCategory("chem")}
                className={cn(
                  "px-2.5 py-0.5 rounded-md text-body-xs font-semibold transition-colors",
                  activeCategory === "chem"
                    ? "bg-brand-primary/15 text-brand-primary border border-brand-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent hover:bg-muted/50",
                )}
              >
                {t("scientific.chemistry")}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsPaletteOpen(false)}
              className="text-body-2xs text-muted-foreground hover:text-foreground px-1 py-0.5 rounded transition-colors"
            >
              {t("scientific.closePalette")}
            </button>
          </div>

          {/* Symbol Buttons Grid */}
          <div className="flex flex-wrap items-center gap-1 p-1.5 bg-card border border-border rounded-lg max-h-44 overflow-y-auto scrollbar-thin">
            {currentSymbols.map((item, idx) => (
              <button
                key={`${item.code}-${idx}`}
                type="button"
                disabled={disabled}
                onClick={() => insertSymbol(item.code)}
                title={item.title || item.code}
                className={cn(
                  "min-w-8 h-7 px-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground text-body-xs font-medium font-serif",
                  "flex items-center justify-center transition-all active:scale-95 select-none shrink-0",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
