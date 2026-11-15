"use client";

import Image from "next/image";
import { Bot } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { getZyraAvatar } from "@/lib/gamification/zyra-cosmetics";
import "./zyra-cosmetics.css";

const InteractiveMascot = lazy(() => import("./zyra-mascot-3d").then(module => ({ default: module.ZyraMascot3D })));

export type ZyraCosmeticAvatarProps = {
  cosmeticId?: string | null;
  size?: number;
  animated?: boolean;
  name?: string;
  interactive?: boolean;
};

export function ZyraCosmeticAvatar({ cosmeticId, size = 40, animated = false, name = "Zyra", interactive = false }: ZyraCosmeticAvatarProps) {
  const avatar = getZyraAvatar(cosmeticId);
  const ref = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasArt = !!avatar && failedSrc !== avatar.src;
  useEffect(() => {
    const element = ref.current;
    if (!animated || interactive || !hasArt || !element) return;
    let inView = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setRunning(inView && !document.hidden && !reduced.matches);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (observer) observer.observe(element);
    else inView = true;
    update();
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
    };
  }, [animated, hasArt, interactive]);
  const extent = Number.isFinite(size) && size > 0 ? size : 40;
  if (interactive && extent >= 128 && avatar) return <Suspense fallback={<ZyraCosmeticAvatar cosmeticId={cosmeticId} size={extent} name={name} />}><InteractiveMascot cosmeticId={cosmeticId} size={extent} animated={animated} /></Suspense>;
  return <span ref={ref} role="img" aria-label={name} className="zyra-cosmetic-avatar" data-running={animated && running && hasArt} style={{ width: extent, height: extent }}>
    {hasArt ? <Image src={avatar.src} alt="" width={extent} height={extent} sizes={`${extent}px`} draggable={false} onError={() => setFailedSrc(avatar.src)} className="zyra-cosmetic-avatar__art" /> : <Bot aria-hidden="true" className="size-3/4 text-primary" />}
  </span>;
}
