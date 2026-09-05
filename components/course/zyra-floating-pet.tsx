"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZyraCharacter } from "@/components/course/zyra-character";
import { ZyraPet, zyraPetLabels } from "@/components/course/zyra-pet";
import type { ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";
import { useZyraPetVisibility, ZYRA_PET_VISIBILITY_KEY as VISIBILITY_KEY } from "@/hooks/use-zyra-pet-visibility";

export { VISIBILITY_KEY };

const POSITION_KEY = "zyx-zyra-pet-anchor-v2";
const PET_WIDTH = 80;
const PET_HEIGHT = 88;
const EDGE_GAP = 16;
type Point = { x: number; y: number };
export type ZyraPetAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function clampZyraPetPosition(point: Point, viewport: { width: number; height: number }, safeLeft = EDGE_GAP): Point {
  return {
    x: Math.min(Math.max(safeLeft, point.x), Math.max(safeLeft, viewport.width - PET_WIDTH - EDGE_GAP)),
    y: Math.min(Math.max(EDGE_GAP, point.y), Math.max(EDGE_GAP, viewport.height - PET_HEIGHT - EDGE_GAP)),
  };
}

export function zyraPetAnchorPositions(viewport: { width: number; height: number }, safeLeft = EDGE_GAP): Record<ZyraPetAnchor, Point> {
  const left = Math.min(safeLeft, Math.max(EDGE_GAP, viewport.width - PET_WIDTH - EDGE_GAP));
  const right = Math.max(left, viewport.width - PET_WIDTH - EDGE_GAP);
  const top = EDGE_GAP;
  const bottom = Math.max(top, viewport.height - PET_HEIGHT - EDGE_GAP);
  return { "top-left": { x: left, y: top }, "top-right": { x: right, y: top }, "bottom-left": { x: left, y: bottom }, "bottom-right": { x: right, y: bottom } };
}

export function nearestZyraPetAnchor(point: Point, viewport: { width: number; height: number }, safeLeft = EDGE_GAP): ZyraPetAnchor {
  const anchors = zyraPetAnchorPositions(viewport, safeLeft);
  return (Object.entries(anchors) as Array<[ZyraPetAnchor, Point]>).sort((left, right) => {
    const leftDistance = (left[1].x - point.x) ** 2 + (left[1].y - point.y) ** 2;
    const rightDistance = (right[1].x - point.x) ** 2 + (right[1].y - point.y) ** 2;
    return leftDistance - rightDistance;
  })[0]![0];
}

function studentContentLeft(): number {
  if (!window.matchMedia("(min-width: 768px)").matches) return EDGE_GAP;
  const sidebar = Array.from(document.querySelectorAll("aside")).find((element) => element.getBoundingClientRect().left === 0);
  return sidebar ? Math.round(sidebar.getBoundingClientRect().right + EDGE_GAP) : EDGE_GAP;
}

export function ZyraFloatingPet({ state, onOpen }: { state: ZyraPetState; onOpen: () => void }) {
  const [position, setPositionState] = React.useState<Point | null>(null);
  const [anchor, setAnchor] = React.useState<ZyraPetAnchor>("bottom-right");
  const [dragging, setDragging] = React.useState(false);
  const { visible, setVisible: setPetVisibility } = useZyraPetVisibility();
  const positionRef = React.useRef<Point | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const dragRef = React.useRef<{ pointerId: number; origin: Point; start: Point; moved: boolean } | null>(null);
  const suppressClickRef = React.useRef(false);
  const setPosition = React.useCallback((next: Point) => { positionRef.current = next; setPositionState(next); }, []);

  const snapTo = React.useCallback((nextAnchor: ZyraPetAnchor) => {
    const next = zyraPetAnchorPositions({ width: window.innerWidth, height: window.innerHeight }, studentContentLeft())[nextAnchor];
    setAnchor(nextAnchor); setPosition(next); window.localStorage.setItem(POSITION_KEY, nextAnchor);
  }, [setPosition]);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(POSITION_KEY) as ZyraPetAnchor | null;
    const initialAnchor: ZyraPetAnchor = saved && ["top-left", "top-right", "bottom-left", "bottom-right"].includes(saved) ? saved : "bottom-right";
    snapTo(initialAnchor);
    const handleResize = () => {
      const storedAnchor = window.localStorage.getItem(POSITION_KEY) as ZyraPetAnchor | null;
      snapTo(storedAnchor && ["top-left", "top-right", "bottom-left", "bottom-right"].includes(storedAnchor) ? storedAnchor : "bottom-right");
    };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, [snapTo]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = positionRef.current; if (!current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, origin: current, start: { x: event.clientX, y: event.clientY }, moved: false };
    setDragging(true);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.start.x; const deltaY = event.clientY - drag.start.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 6) drag.moved = true;
    const next = clampZyraPetPosition({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }, { width: window.innerWidth, height: window.innerHeight }, studentContentLeft());
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => setPosition(next));
  };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null; setDragging(false); suppressClickRef.current = drag.moved;
    const current = positionRef.current;
    if (current) snapTo(nearestZyraPetAnchor(current, { width: window.innerWidth, height: window.innerHeight }, studentContentLeft()));
  };
  const handleClick = () => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onOpen(); };

  if (!visible) return <Button type="button" variant="outline" size="icon" onClick={() => setPetVisibility(true)} className="fixed bottom-6 right-6 z-40 size-12 rounded-full border-brand-primary/40 bg-card/90 text-brand-primary shadow-lg backdrop-blur-md" aria-label="Tampilkan pet Zyra"><ZyraCharacter state="idle" className="size-10" /><Eye className="absolute -right-1 -top-1 size-4 rounded-full border border-border bg-card p-0.5 text-muted-foreground" /></Button>;
  if (!position) return null;

  return (
    <div className={cn("group fixed z-40 select-none touch-none transition-[left,top] duration-200 ease-out motion-reduce:transition-none", dragging && "transition-none")} style={{ left: position.x, top: position.y, width: PET_WIDTH, height: PET_HEIGHT }} data-anchor={anchor}>
      <div className={cn("pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-brand-primary/30 bg-card/95 px-2.5 py-1 shadow-lg backdrop-blur-md transition-opacity", state !== "idle" ? "opacity-100" : "opacity-0 group-hover:opacity-100")}><span className="flex items-center gap-1.5 text-body-xs font-semibold"><span className={cn("size-1.5 rounded-full bg-brand-primary", state === "success" && "bg-status-success", state === "error" && "bg-status-error", state === "quota_resting" && "bg-status-warning")} />{zyraPetLabels[state]}</span></div>
      <button type="button" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={handleClick} className={cn("relative flex size-full flex-col items-center justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", dragging ? "cursor-grabbing" : "cursor-grab")} aria-label={`Zyra, ${zyraPetLabels[state]}. Seret ke sudut atau klik untuk chat.`}>
        <div className={cn("transition-transform duration-200 group-hover:scale-105", !dragging && "animate-zyra-float")}><ZyraPet state={state} /></div>
        <div className="mt-0.5 h-1.5 w-10 rounded-[100%] bg-black/40 blur-[1.5px]" />
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); setPetVisibility(false); }} className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100" aria-label="Sembunyikan pet Zyra"><EyeOff className="size-3" /></button>
    </div>
  );
}
