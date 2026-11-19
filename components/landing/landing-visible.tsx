"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAppReducedMotion } from "@/components/appearance-preferences";

type LandingVisibleProps = {
 children: ReactNode;
 className?: string;
 /** IntersectionObserver rootMargin ; default triggers slightly before fully in view. */
 rootMargin?: string;
 threshold?: number;
};

/**
 * Tiny client island that flips `data-visible` to "true" once its content
 * scrolls into view (immediately under prefers-reduced-motion). All landing
 * animations (`.landing-rise`, `.landing-bar`, `.landing-pop`,
 * `.landing-draw-line`, `.landing-stagger-on-visible`) key off this attribute
 * in globals.css, so arbitrarily complex server-rendered children animate
 * without their own JS.
 */
export function LandingVisible({
 children,
 className,
 rootMargin = "0px 0px -12% 0px",
 threshold = 0.15,
}: LandingVisibleProps) {
 const reducedMotion = useAppReducedMotion();
 const ref = useRef<HTMLDivElement | null>(null);
 const [visible, setVisible] = useState(false);

 useEffect(() => {
 const node = ref.current;
 if (!node || visible) return;

 if (
 typeof window.IntersectionObserver === "undefined" ||
 reducedMotion
 ) {
 setVisible(true);
 return;
 }

 const observer = new IntersectionObserver(
 (entries) => {
 if (entries.some((entry) => entry.isIntersecting)) {
 setVisible(true);
 observer.disconnect();
 }
 },
 { rootMargin, threshold },
 );

 observer.observe(node);
 return () => observer.disconnect();
 }, [rootMargin, threshold, visible, reducedMotion]);

 return (
 <div ref={ref} data-visible={visible ? "true" : "false"} className={className}>
 {children}
 </div>
 );
}
