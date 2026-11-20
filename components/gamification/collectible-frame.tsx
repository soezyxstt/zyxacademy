"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { getFrameCollection } from "@/lib/gamification/collection-art";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { cn } from "@/lib/utils";
import "./collectible-frame.css";
import { FrameChoreography } from "./frame-choreography";

// Share one intersection observer and visibility listener for all heroes.
const visible = new Map<Element, (value: boolean) => void>();
let observer: IntersectionObserver | undefined;
function updateVisibility() {
  visible.forEach((set, element) => set(!document.hidden && element.getAttribute("data-in-view") === "true"));
}
function observe(element: Element, set: (value: boolean) => void) {
  if (!visible.size) {
    document.addEventListener("visibilitychange", updateVisibility);
  }
  visible.set(element, set);
  if (typeof IntersectionObserver === "undefined") {
    element.setAttribute("data-in-view", "true");
    updateVisibility();
  } else {
    observer ??= new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.setAttribute("data-in-view", String(entry.isIntersecting)));
      updateVisibility();
    });
    observer.observe(element);
  }
  return () => {
    observer?.unobserve(element);
    visible.delete(element);
    if (!visible.size) {
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
      observer = undefined;
    }
  };
}

export type CollectibleFrameProps = {
  frameId: string | null | undefined;
  size?: number;
  animated?: boolean;
  children: ReactNode;
  className?: string;
};

export function CollectibleFrame({ frameId, size = 48, animated = false, children, className }: CollectibleFrameProps) {
  const reducedMotion = useAppReducedMotion();
  const art = getFrameCollection(frameId);
  const ref = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedArt, setLoadedArt] = useState<{ src: string; url: string } | null>(null);
  const hasArt = !!art && failedSrc !== art.src;
  const hero = animated && !reducedMotion && size >= 96 && hasArt;
  useEffect(() => {
    if (!hero || !ref.current) return;
    return observe(ref.current, setRunning);
  }, [hero]);
  return <span ref={ref} className={cn("collectible-frame", className)}
    style={{ width: size, height: size }}
    data-motion={art?.motion ?? "none"} data-depth={hero} data-running={hero && running}
    >
    <span className="collectible-frame__identity" style={{ inset: hasArt ? `${(1 - art.aperture) * 50}%` : 0 }}>{children}</span>
    {hasArt && <span aria-hidden="true" className="collectible-frame__scene">
      <Image src={art.src} width={size} height={size} sizes={`${size}px`} alt="" draggable={false}
        onLoad={hero ? event => setLoadedArt({ src: art.src, url: event.currentTarget.currentSrc || event.currentTarget.src }) : undefined}
        onError={() => setFailedSrc(art.src)} className="collectible-frame__art" />
      {hero && loadedArt?.src === art.src && <FrameChoreography art={art} imageUrl={loadedArt.url} />}
    </span>}
  </span>;
}
