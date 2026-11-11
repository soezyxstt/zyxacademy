"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /**
   * IntersectionObserver rootMargin (bottom offset).
   * Positive % triggers earlier (before element enters viewport).
   * @default "0px 0px -6% 0px"
   */
  rootMargin?: string;
  /** IntersectionObserver threshold. @default 0.01 */
  threshold?: number;
  /** Extra translate-y distance before animation. @default "translate-y-8" */
  translateFrom?: string;
  /** Animation duration class. @default "duration-700" */
  duration?: string;
};

/**
 * Scroll-triggered fade + slide-in (same as LandingReveal, usable site-wide).
 * Respects `prefers-reduced-motion`.
 */
export function Reveal({
  children,
  className,
  rootMargin = "0px 0px -6% 0px",
  threshold = 0.01,
  translateFrom = "translate-y-8",
  duration = "duration-700",
}: RevealProps) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const isAdmin = pathname !== null && pathname.startsWith("/admin");
  const isDemo = pathname !== null && /^(?:\/(?:en|id))?\/demo(?:\/|$)/.test(pathname);

  useEffect(() => {
    setMounted(true);
    if (isAdmin || isDemo) {
      setVisible(true);
      return;
    }

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onMq = () => {
      if (mq.matches) setVisible(true);
    };
    onMq();
    mq.addEventListener("change", onMq);

    const el = ref.current;
    if (!el) return () => mq.removeEventListener("change", onMq);

    const ob = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setVisible(true);
      },
      { rootMargin, threshold }
    );
    ob.observe(el);

    return () => {
      mq.removeEventListener("change", onMq);
      ob.disconnect();
    };
  }, [rootMargin, threshold, isAdmin, isDemo]);

  // Once mounted, bypass animation completely on admin pages to prevent viewport lock on tall pages
  if (isDemo || (isAdmin && mounted)) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={cn(
        `motion-safe:transition-all motion-safe:ease-out motion-safe:${duration}`,
        visible ? "translate-y-0 opacity-100" : `${translateFrom} opacity-0`,
        "motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}
