"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Layers3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DemoFlashcard as DemoFlashcardData } from "@/app/(marketing)/demo/demo-data";
import { DemoAuthCta } from "./demo-shell";

export function DemoFlashcards({ cards, nextPath }: { cards: DemoFlashcardData[]; nextPath: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const card = cards[activeIndex];

  if (!card) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + cards.length) % cards.length);
    setRevealed(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers3 className="size-5 text-brand-primary" aria-hidden="true" />
            <h2 className="font-heading text-h5 font-bold text-foreground">Flashcard bab pertama</h2>
          </div>
          <span className="text-body-xs font-semibold text-muted-foreground">
            {activeIndex + 1} dari {cards.length}
          </span>
        </div>

        <button
          type="button"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
          className="mt-8 flex min-h-64 w-full flex-col items-center justify-center rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-6 text-center outline-none transition-colors hover:bg-brand-primary/10 focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)]"
        >
          <span className="text-body-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">
            {revealed ? "Jawaban" : "Pertanyaan"}
          </span>
          <span className="mt-4 max-w-lg text-body-base leading-relaxed text-foreground">
            {revealed ? card.back : card.front}
          </span>
          {revealed && card.explanation ? (
            <span className="mt-4 max-w-lg text-body-xs leading-relaxed text-muted-foreground">{card.explanation}</span>
          ) : null}
          <span className="mt-6 inline-flex items-center gap-1.5 text-body-xs font-semibold text-brand-primary">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {revealed ? "Klik untuk kembali" : "Klik untuk membalik"}
          </span>
        </button>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => move(-1)} className="gap-1.5 rounded-lg">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Sebelumnya
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => move(1)} className="gap-1.5 rounded-lg">
            Berikutnya
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">Simpan latihanmu</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">Masuk untuk mengakses flashcard di setiap mata kuliah.</p>
        </div>
        <DemoAuthCta nextPath={nextPath} />
      </div>
    </div>
  );
}
