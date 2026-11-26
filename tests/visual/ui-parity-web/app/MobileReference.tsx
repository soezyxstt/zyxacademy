"use client";

import { useEffect } from "react";
import { parityFrame } from "@/packages/ui-parity/frame";
import { componentNames, galleryCases, type GalleryCase } from "@/packages/ui-parity/gallery";

function marker(width: number) {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.style.width = `${width}px`;
  element.style.height = `${parityFrame.markerHeight}px`;
  element.style.backgroundColor = parityFrame.markerColor;
  return element;
}

function ready(item: GalleryCase, frame: HTMLElement): boolean {
  if (item.family !== "avatar") return true;
  if (frame.querySelector("[data-parity-image-status]")?.getAttribute("data-parity-image-status") !== item.status) return false;
  const image = frame.querySelector("img[data-slot='avatar-image']");
  return item.status !== "loaded" || (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
}

export function MobileReference() {
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("mobile-reference");
    const component = componentNames.find(name => name === requested);
    if (!component) return;

    const main = document.querySelector("main");
    if (!main) return;
    const cases = galleryCases.filter(item => item.component === component);
    const allFrames = [...main.querySelectorAll<HTMLElement>("[data-parity-case]")];
    const selected = cases.map(item => allFrames.find(frame => frame.dataset.parityCase === item.id));
    if (selected.some(frame => !frame)) return;

    const hidden = allFrames.filter(frame => !selected.includes(frame));
    for (const frame of hidden) frame.hidden = true;
    const markers: HTMLElement[] = [];
    let stopped = false;
    let animation: number | undefined;

    function addMarkers() {
      if (stopped) return;
      if (!cases.every((item, index) => ready(item, selected[index]!))) {
        animation = window.requestAnimationFrame(addMarkers);
        return;
      }

      for (const frame of selected) {
        const specimen = frame!.querySelector<HTMLElement>("[data-slot='skeleton']");
        if (specimen) {
          // Match the reduced-motion state captured by Playwright.
          specimen.style.animation = "none";
          specimen.style.opacity = "0.65";
        }
        const strip = marker(parityFrame.width);
        strip.style.position = "absolute";
        strip.style.top = `-${parityFrame.markerHeight}px`;
        strip.style.left = "0";
        frame!.prepend(strip);
        markers.push(strip);
      }
      // Use a separate marker range so a stale native screen cannot count as a WebView frame.
      const identity = marker(96 + componentNames.indexOf(component));
      main!.prepend(identity);
      markers.push(identity);
    }

    void Promise.all([
      document.fonts.load('400 16px "Parity Inter"'),
      document.fonts.load('700 16px "Parity Lexend"'),
      document.fonts.ready,
    ]).then(([inter, lexend]) => {
      if (!stopped && inter.length && lexend.length) animation = window.requestAnimationFrame(addMarkers);
    }).catch(() => {});

    return () => {
      stopped = true;
      if (animation !== undefined) window.cancelAnimationFrame(animation);
      for (const frame of hidden) frame.hidden = false;
      for (const strip of markers) strip.remove();
    };
  }, []);
  return null;
}
