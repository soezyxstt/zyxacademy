"use client";

import { useLayoutEffect, type RefObject } from "react";

// A software keyboard can shrink and pan the visual viewport while fixed
// panels remain positioned in the original layout viewport.
export function usePanelViewport(ref: RefObject<HTMLElement | null>, visible: boolean) {
  useLayoutEffect(() => {
    const panel = ref.current;
    const viewport = window.visualViewport;
    if (!visible || !panel || !viewport) return;

    const measure = () => {
      panel.style.setProperty("--panel-visible-height", `${viewport.height}px`);
      panel.style.setProperty("--panel-visible-top", `${viewport.offsetTop}px`);
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      panel.style.removeProperty("--panel-visible-height");
      panel.style.removeProperty("--panel-visible-top");
    };
  }, [ref, visible]);
}
