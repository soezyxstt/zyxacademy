"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ScrollStep = {
 id: string;
 /** Server-rendered copy block (number, title, body). */
 copy: ReactNode;
 /** Server-rendered visual pane shown in the sticky panel while this step is active. */
 pane: ReactNode;
};

type LandingScrollStepsProps = {
 steps: ScrollStep[];
 /** Sticky visual panel wrapper (typically a DemoFrame) rendered around the panes. */
 renderPanel?: (panes: ReactNode) => ReactNode;
 className?: string;
};

/**
 * Brilliant-style sticky scroll story. Desktop (lg+): sticky visual panel on
 * the left cross-fades panes while copy steps scroll on the right; the active
 * step is detected with one IntersectionObserver over step sentinels.
 * Mobile: panel is hidden and each step renders its pane inline beneath it.
 *
 * Copy and panes are passed in as ReactNode from Server Components, so this
 * island ships only the observer + class toggling.
 */
export function LandingScrollSteps({ steps, renderPanel, className }: LandingScrollStepsProps) {
 const [active, setActive] = useState(0);
 const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

 useEffect(() => {
 if (typeof window.IntersectionObserver === "undefined") return;

 const observer = new IntersectionObserver(
 (entries) => {
 for (const entry of entries) {
 if (!entry.isIntersecting) continue;
 const index = Number((entry.target as HTMLElement).dataset.stepIndex);
 if (!Number.isNaN(index)) setActive(index);
 }
 },
 // A narrow horizontal band around the viewport middle: whichever step
 // crosses it becomes active.
 { rootMargin: "-38% 0px -48% 0px", threshold: 0 },
 );

 for (const node of stepRefs.current) {
 if (node) observer.observe(node);
 }
 return () => observer.disconnect();
 }, [steps.length]);

 const panes = (
 <div className="relative h-[420px] w-full xl:h-[470px]">
 {steps.map((step, index) => (
 <div
 key={step.id}
 aria-hidden={active !== index}
 className={cn(
 "absolute inset-0 transition-opacity duration-500 ease-out",
 active === index ? "opacity-100" : "pointer-events-none opacity-0",
 )}
 >
 {step.pane}
 </div>
 ))}
 </div>
 );

 return (
 <div className={cn("grid min-w-0 items-start gap-10 lg:grid-cols-2 lg:gap-16", className)}>
 {/* Sticky visual panel ; desktop only */}
 <div className="max-lg:hidden lg:sticky lg:top-28 lg:self-start">
 {renderPanel ? renderPanel(panes) : panes}
 </div>

 {/* Scroll steps */}
 <div className="flex min-w-0 flex-col gap-14 lg:gap-0">
 {steps.map((step, index) => (
 <div
 key={step.id}
 ref={(node) => {
 stepRefs.current[index] = node;
 }}
 data-step-index={index}
 className="lg:flex lg:min-h-[55vh] lg:items-center"
 >
 <div className="w-full min-w-0">
 <div
 className={cn(
 "border-l-2 pl-5 transition-all duration-300 md:pl-6",
 active === index
 ? "border-[var(--zx-accent)] opacity-100"
 : "border-border opacity-100 lg:opacity-40",
 )}
 >
 {step.copy}
 </div>
 {/* Inline pane ; mobile only */}
 <div className="mt-6 min-w-0 lg:hidden">{step.pane}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}
