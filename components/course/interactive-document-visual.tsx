"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

// assetUrl must resolve an authorized content version and field, never a bare digest.
export function InteractiveDocumentVisual({ spec, assetUrl }: { spec: InteractiveDocumentSpec; assetUrl?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [height, setHeight] = useState(spec.height);
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLElement>(null);
  const visible = useRef(true);
  const mounted = status === "ready" || status === "loading";

  useEffect(() => {
    if (!mounted) return;
    let lastResize = -Infinity;
    let resizeTimer: number | undefined;
    let pendingHeight = spec.height;
    const resize = () => {
      lastResize = performance.now();
      resizeTimer = undefined;
      setHeight(pendingHeight + (frame.current ? frame.current.offsetHeight - frame.current.clientHeight : 0));
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "zyx:ready") { setStatus(current => current === "loading" ? "ready" : current); return; }
      if (event.data?.type !== "zyx:resize") return;
      const value = event.data.height;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 240 || value > 2400) return;
      pendingHeight = Math.round(value);
      if (resizeTimer === undefined) {
        const delay = 100 - (performance.now() - lastResize);
        if (delay <= 0) resize();
        else resizeTimer = window.setTimeout(resize, delay);
      }
    };
    window.addEventListener("message", receive);
    if (frame.current && assetUrl && frame.current.getAttribute("src") !== assetUrl) frame.current.src = assetUrl;
    return () => { window.removeEventListener("message", receive); window.clearTimeout(resizeTimer); };
  }, [mounted, assetUrl, spec.height]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("error"), 15000);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => { setStatus("idle"); setHeight(spec.height); }, [assetUrl, spec.height]);

  const sendPreferences = () => {
    frame.current?.contentWindow?.postMessage({
      type: "zyx:preferences",
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      active: visible.current && !document.hidden,
    }, "*");
  };

  useEffect(() => {
    if (status !== "ready") return;
    sendPreferences();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new MutationObserver(sendPreferences);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    motion.addEventListener("change", sendPreferences);
    document.addEventListener("visibilitychange", sendPreferences);
    const intersection = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible.current = !!entry?.isIntersecting;
      sendPreferences();
    });
    if (container.current) intersection?.observe(container.current);
    return () => {
      frame.current?.contentWindow?.postMessage({ type: "zyx:visibility", active: false }, "*");
      observer.disconnect(); intersection?.disconnect(); motion.removeEventListener("change", sendPreferences);
      document.removeEventListener("visibilitychange", sendPreferences);
    };
  }, [status]);

  return <figure ref={container} id={spec.id} data-interactive-document className="space-y-2" aria-label={spec.label}>
    <figcaption className="font-heading text-body-sm font-bold">{spec.label}</figcaption>
    <p className="text-body-sm">{spec.description}</p>
    {status === "ready" || status === "loading" ? <iframe ref={frame} title={spec.label} sandbox="allow-scripts" referrerPolicy="no-referrer" inert={status !== "ready"} aria-hidden={status !== "ready"} tabIndex={status === "ready" ? 0 : -1} onError={() => setStatus("error")} className="block w-full rounded-lg border border-border bg-background" style={{ height }} /> : null}
    {status === "loading" ? <p role="status" className="text-body-sm text-muted-foreground">Memuat visual...</p> : null}
    {status === "error" ? <p role="alert" className="text-body-sm text-muted-foreground">Visual belum tersedia. Coba lagi.</p> : null}
    {status !== "ready" ? <div className="text-body-sm"><p>{spec.staticFallback.summary}</p><p>{spec.staticFallback.content}</p></div> : null}
    {assetUrl ? <Button type="button" variant="outline" size="sm" onClick={() => {
      if (status === "ready" || status === "loading") setStatus("idle");
      else setStatus(/^\/(?![\\/])/.test(assetUrl) ? "loading" : "error");
    }}>{status === "ready" || status === "loading" ? "Tutup visual" : status === "error" ? "Coba lagi" : "Buka visual"}</Button> : null}
  </figure>;
}
