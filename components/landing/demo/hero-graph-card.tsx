"use client";

import { useState } from "react";
import { DesmosStyleGraph } from "@/components/landing/desmos-style-graph";

/**
 * Hero demo: a quadratic graph with one draggable coefficient slider ;
 * the first thing a visitor can interact with on the page.
 */
export function HeroGraphCard() {
 const [a, setA] = useState(-0.08);

 return (
 <div className="relative mx-auto w-full max-w-lg justify-self-end lg:max-w-none">
 <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5">
 <DesmosStyleGraph mode="quadratic" a={a} b={0} c={2} className="w-full" />
 <div className="border-t border-border bg-card px-4 py-3 md:px-5">
 <label className="flex items-center gap-3">
 <span className="shrink-0 font-mono text-body-sm font-semibold text-foreground">
 a = {a.toFixed(2)}
 </span>
 <input
 type="range"
 min={-0.2}
 max={0.2}
 step={0.01}
 value={a}
 onChange={(event) => setA(Number(event.target.value))}
 className="h-1.5 w-full cursor-pointer accent-brand-secondary"
 aria-label="Ubah koefisien a pada grafik kuadratik"
 />
 </label>
 </div>
 </div>
 </div>
 );
}
