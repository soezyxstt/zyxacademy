"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { LoaderCircle, MousePointer2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppReducedMotion } from "@/components/appearance-preferences";

export interface TourSpotlightProps {
  target: HTMLElement | null;
  step: number;
  total: number;
  title: string;
  description: string;
  instruction: string;
  progressLabel: string;
  skipLabel: string;
  loadingLabel: string;
  unavailableLabel: string;
  retryLabel: string;
  /** Returning false leaves a stateful control available for its next action. */
  onTargetActivate: (event: MouseEvent) => void | false;
  onSkip: () => void;
  onRetry: () => void;
  onSkipStep?: () => void;
  skipStepLabel?: string;
  unavailable?: boolean;
  busy?: boolean;
}

type Viewport = { left: number; top: number; width: number; height: number };
type TargetBox = { left: number; top: number; width: number; height: number };
type Measurement = { target: TargetBox | null; viewport: Viewport; panelHeight: number };

const GAP = 16;
const EDGE = 16;
const HALO = 6;
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

function canFocus(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 &&
    !element.closest("[inert]") &&
    !element.matches(':disabled,[aria-disabled="true"],[hidden]') &&
    getComputedStyle(element).visibility !== "hidden";
}

function focusableWithin(element: HTMLElement | null, includeTarget = false): HTMLElement[] {
  if (!element) return [];
  const candidates = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
  // A highlighted Radix menu item can have tabindex=-1 until it receives focus.
  // The guide owns the tab order while that real control is the active target.
  if (element.matches(FOCUSABLE) || (includeTarget && element.hasAttribute("tabindex"))) candidates.unshift(element);
  return candidates.filter(canFocus);
}

function getViewport(): Viewport {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function getTargetBox(target: HTMLElement | null, viewport: Viewport): TargetBox | null {
  if (!target?.isConnected || !canFocus(target)) return null;
  const bounds = target.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  // A target may sit inside an independently scrolling sidebar or tab strip.
  let left = Math.max(viewport.left, bounds.left);
  let top = Math.max(viewport.top, bounds.top);
  let right = Math.min(viewport.left + viewport.width, bounds.right);
  let bottom = Math.min(viewport.top + viewport.height, bounds.bottom);
  for (let ancestor = target.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    const clipX = /auto|scroll|hidden|clip/.test(style.overflowX);
    const clipY = /auto|scroll|hidden|clip/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const clip = ancestor.getBoundingClientRect();
    if (clipX) {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    if (clipY) {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  if (right <= left || bottom <= top) return null;
  return {
    left: Math.max(viewport.left, left - HALO),
    top: Math.max(viewport.top, top - HALO),
    width: Math.min(viewport.left + viewport.width, right + HALO) - Math.max(viewport.left, left - HALO),
    height: Math.min(viewport.top + viewport.height, bottom + HALO) - Math.max(viewport.top, top - HALO),
  };
}

function panelPosition({ target, viewport, panelHeight }: Measurement) {
  const width = Math.min(352, viewport.width - EDGE * 2);
  const leftEdge = viewport.left + EDGE;
  const topEdge = viewport.top + EDGE;
  const bottomEdge = viewport.top + viewport.height - EDGE;
  const maxHeight = Math.max(120, viewport.height - EDGE * 2);
  const height = Math.min(panelHeight, maxHeight);

  if (!target) {
    return { left: leftEdge + (viewport.width - EDGE * 2 - width) / 2, top: topEdge + (maxHeight - height) / 2, width, maxHeight };
  }

  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const clampTop = (top: number) => Math.max(topEdge, Math.min(top, bottomEdge - height));
  if (viewport.width >= 768) {
    if (viewport.left + viewport.width - EDGE - targetRight >= width + GAP) {
      return { left: targetRight + GAP, top: clampTop(target.top), width, maxHeight };
    }
    if (target.left - leftEdge >= width + GAP) {
      return { left: target.left - GAP - width, top: clampTop(target.top), width, maxHeight };
    }
  }

  const roomAbove = target.top - GAP - topEdge;
  const roomBelow = bottomEdge - targetBottom - GAP;
  const below = roomBelow >= height || roomBelow >= roomAbove;
  const availableHeight = Math.max(96, below ? roomBelow : roomAbove);
  const visibleHeight = Math.min(height, availableHeight);
  return {
    left: Math.max(leftEdge, Math.min(target.left + target.width / 2 - width / 2, viewport.left + viewport.width - EDGE - width)),
    top: below ? targetBottom + GAP : target.top - GAP - visibleHeight,
    width,
    maxHeight: Math.min(maxHeight, availableHeight),
  };
}

/** Keep the real target interactive. The guide never clones or clicks it. */
export function TourSpotlight({
  target,
  step,
  total,
  title,
  description,
  instruction,
  progressLabel,
  skipLabel,
  loadingLabel,
  unavailableLabel,
  retryLabel,
  onTargetActivate,
  onSkip,
  onRetry,
  onSkipStep,
  skipStepLabel,
  unavailable = false,
  busy = false,
}: TourSpotlightProps) {
  const reduceMotion = useAppReducedMotion();
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const instructionId = `${id}-instruction`;
  const portalRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activationRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMounted(true);
    return () => {
      if (previousFocus?.isConnected && canFocus(previousFocus)) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const measure = () => {
      const viewport = getViewport();
      const next = {
        target: getTargetBox(target, viewport),
        viewport,
        panelHeight: panelRef.current?.scrollHeight ?? 240,
      };
      setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "instant" : "smooth" });
    measure();
    const observer = new ResizeObserver(schedule);
    if (target) observer.observe(target);
    if (panelRef.current) observer.observe(panelRef.current);
    observer.observe(document.documentElement);
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("animationend", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      changes.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [mounted, target, step, reduceMotion]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const portal = portalRef.current;
    if (!portal) return;
    const changed = new Map<HTMLElement, boolean>();
    const restore = () => {
      for (const [element, previous] of changed) {
        element.inert = previous;
        element.removeAttribute("data-tour-inert");
      }
      changed.clear();
    };
    const protect = (element: HTMLElement) => {
      if (element === portal || element === target) return;
      if (element.contains(portal) || (target && element.contains(target))) {
        for (const child of element.children) if (child instanceof HTMLElement) protect(child);
        return;
      }
      // Native controls may already hide a panel with inert. Do not own that
      // state: opening the panel must be free to clear it during the tour.
      if (!element.inert) {
        changed.set(element, false);
        element.setAttribute("data-tour-inert", "");
        element.inert = true;
      }
    };
    const refresh = () => {
      restore();
      for (const child of document.body.children) if (child instanceof HTMLElement) protect(child);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    const previousDescription = target?.getAttribute("aria-describedby") ?? null;
    target?.setAttribute("data-tour-current", "");
    target?.setAttribute("aria-describedby", [previousDescription, descriptionId, instructionId].filter(Boolean).join(" "));
    const focusFrame = requestAnimationFrame(() => {
      const first = focusableWithin(target, true)[0] ?? focusableWithin(panelRef.current)[0] ?? panelRef.current;
      first?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      restore();
      if (target) {
        target.removeAttribute("data-tour-current");
        if (previousDescription === null) target.removeAttribute("aria-describedby");
        else target.setAttribute("aria-describedby", previousDescription);
      }
    };
  }, [mounted, target, step, descriptionId, instructionId]);

  useEffect(() => {
    if (!busy) activationRef.current = false;
  }, [target, step, busy]);

  useEffect(() => {
    if (!mounted) return;
    const isPanel = (node: EventTarget | null) => node instanceof Node && Boolean(panelRef.current?.contains(node));
    const isTarget = (node: EventTarget | null) => node instanceof Node && Boolean(target?.contains(node));
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const pointer = (event: Event) => {
      if (!isPanel(event.target) && (busy || !isTarget(event.target))) stop(event);
    };
    const click = (event: MouseEvent) => {
      if (isPanel(event.target)) return;
      if (!isTarget(event.target) || busy || activationRef.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !target || !canFocus(target)) {
        stop(event);
        return;
      }
      activationRef.current = true;
      // A route step may persist its state before navigating. Native controls
      // retain their own action unless the owner explicitly cancels this event.
      if (onTargetActivate(event) === false) activationRef.current = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stop(event);
        onSkip();
        return;
      }
      if (event.key === "Tab") {
        const elements = [...new Set([...(!busy ? focusableWithin(target, true) : []), ...focusableWithin(panelRef.current)])];
        stop(event);
        if (!elements.length) {
          panelRef.current?.focus({ preventScroll: true });
          return;
        }
        const current = elements.indexOf(document.activeElement as HTMLElement);
        const next = current < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
        elements[next].focus({ preventScroll: true });
        return;
      }
      if (!isPanel(event.target) && (busy || !isTarget(event.target))) {
        stop(event);
        return;
      }
      const editable = event.target instanceof HTMLElement && Boolean(event.target.closest('input,textarea,[contenteditable="true"]'));
      if ((event.metaKey || event.ctrlKey) && !editable) stop(event);
    };
    const focusin = (event: FocusEvent) => {
      if (!isPanel(event.target) && (busy || !isTarget(event.target))) {
        const first = (!busy ? focusableWithin(target, true)[0] : null) ?? focusableWithin(panelRef.current)[0] ?? panelRef.current;
        first?.focus({ preventScroll: true });
      }
    };
    const scroll = (event: Event) => {
      if (!isPanel(event.target)) stop(event);
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("click", click, true);
    document.addEventListener("auxclick", stop, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin, true);
    document.addEventListener("wheel", scroll, { capture: true, passive: false });
    document.addEventListener("touchmove", scroll, { capture: true, passive: false });
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("auxclick", stop, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin, true);
      document.removeEventListener("wheel", scroll, true);
      document.removeEventListener("touchmove", scroll, true);
    };
  }, [mounted, target, busy, onTargetActivate, onSkip]);

  if (!mounted) return null;

  const box = measurement?.target ?? null;
  const viewport = measurement?.viewport ?? { left: 0, top: 0, width: 0, height: 0 };
  const panel = measurement ? panelPosition(measurement) : null;
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  const scrims = box
    ? [
        { left: 0, top: 0, width: "100vw", height: box.top },
        { left: 0, top: box.top, width: box.left, height: box.height },
        { left: box.left + box.width, top: box.top, width: Math.max(0, right - box.left - box.width), height: box.height },
        { left: 0, top: box.top + box.height, width: "100vw", height: Math.max(0, bottom - box.top - box.height) },
      ]
    : [{ left: 0, top: 0, width: "100vw", height: "100dvh" }];
  const transition = { duration: reduceMotion ? 0 : 0.22, ease: "easeOut" as const };
  const waiting = busy || !box;

  return createPortal(
    <div ref={portalRef} data-tour-spotlight="" className="pointer-events-none fixed inset-0 z-[300] font-sans">
      <div aria-hidden="true">
        {scrims.map((scrim, index) => (
          <motion.div
            key={index}
            className="pointer-events-auto fixed touch-none bg-black-1/60"
            initial={false}
            animate={scrim}
            transition={transition}
          />
        ))}
        {box ? (
          <motion.div
            data-tour-highlight=""
            className="pointer-events-none fixed rounded-xl border-2 border-zx-accent shadow-[0_0_0_3px_var(--background)]"
            initial={false}
            animate={box}
            transition={transition}
          />
        ) : null}
      </div>

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        data-tour-panel=""
        data-tour-step={step}
        className="pointer-events-auto fixed flex flex-col overflow-y-auto overscroll-contain rounded-xl border border-border bg-card text-card-foreground shadow-xl focus-visible:outline-2 focus-visible:outline-ring"
        initial={false}
        animate={panel ? { left: panel.left, top: panel.top, width: panel.width, opacity: 1 } : { opacity: 0 }}
        style={{ maxHeight: panel ? `calc(${panel.maxHeight}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))` : undefined }}
        transition={transition}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <span className="text-body-xs tabular-nums text-muted-foreground">{progressLabel}</span>
          <Button type="button" variant="ghost" size="lg" onClick={onSkip} className="-mr-2 min-h-9 text-muted-foreground">
            {skipLabel}
          </Button>
        </div>
        <div className="mx-4 mt-2 h-1 overflow-hidden rounded-md bg-muted" aria-hidden="true">
          <motion.div className="h-full rounded-md bg-zx-accent" initial={false} animate={{ width: `${((step + 1) / Math.max(total, 1)) * 100}%` }} transition={transition} />
        </div>
        <motion.div key={step} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="space-y-2 px-4 pb-4 pt-3" aria-live="polite" aria-atomic="true">
          <h2 id={titleId} className="font-heading text-body-base font-semibold leading-snug">{title}</h2>
          <p id={descriptionId} className="text-body-sm leading-relaxed text-muted-foreground">{description}</p>
        </motion.div>
        <div className="border-t border-border px-4 py-3">
          {onSkipStep && <Button type="button" variant="outline" className="mb-3 w-full" disabled={busy} onClick={onSkipStep}>{skipStepLabel}</Button>}
          <p id={instructionId} className="flex items-start gap-2 text-body-xs font-medium leading-relaxed">
            {waiting && !unavailable ? <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <MousePointer2 className="mt-0.5 size-3.5 shrink-0 text-zx-accent" aria-hidden="true" />}
            <span>{unavailable ? unavailableLabel : waiting ? loadingLabel : instruction}</span>
          </p>
          {unavailable ? <Button type="button" variant="outline" size="lg" className="mt-3" onClick={onRetry} disabled={busy}><RotateCcw aria-hidden="true" />{retryLabel}</Button> : null}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
