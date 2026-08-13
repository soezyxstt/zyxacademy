"use client";

import * as React from "react";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZyraCharacter } from "@/components/course/zyra-character";
import { ZyraPet, zyraPetLabels } from "@/components/course/zyra-pet";
import type { ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";

const POSITION_KEY = "zyx-zyra-pet-position-v1";
const VISIBILITY_KEY = "zyx-zyra-pet-visible-v1";
const PET_WIDTH = 188;
const PET_HEIGHT = 80;
const EDGE_GAP = 16;

type Point = { x: number; y: number };

export function clampZyraPetPosition(point: Point, viewport: { width: number; height: number }): Point {
  return {
    x: Math.min(Math.max(EDGE_GAP, point.x), Math.max(EDGE_GAP, viewport.width - PET_WIDTH - EDGE_GAP)),
    y: Math.min(Math.max(EDGE_GAP, point.y), Math.max(EDGE_GAP, viewport.height - PET_HEIGHT - EDGE_GAP)),
  };
}

function defaultPosition(): Point {
  return clampZyraPetPosition(
    { x: window.innerWidth - PET_WIDTH - 32, y: window.innerHeight - PET_HEIGHT - 32 },
    { width: window.innerWidth, height: window.innerHeight },
  );
}

export function ZyraFloatingPet({ state, onOpen }: { state: ZyraPetState; onOpen: () => void }) {
  const [position, setPosition] = React.useState<Point | null>(null);
  const [visible, setVisible] = React.useState(true);
  const dragRef = React.useRef<{
    pointerId: number;
    origin: Point;
    start: Point;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);

  React.useEffect(() => {
    const savedVisibility = window.localStorage.getItem(VISIBILITY_KEY);
    setVisible(savedVisibility !== "0");

    let initial = defaultPosition();
    const savedPosition = window.localStorage.getItem(POSITION_KEY);
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition) as Partial<Point>;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          initial = clampZyraPetPosition(
            { x: parsed.x, y: parsed.y },
            { width: window.innerWidth, height: window.innerHeight },
          );
        }
      } catch {
        window.localStorage.removeItem(POSITION_KEY);
      }
    }
    setPosition(initial);

    const keepInsideViewport = () => {
      setPosition((current) => current
        ? clampZyraPetPosition(current, { width: window.innerWidth, height: window.innerHeight })
        : defaultPosition());
    };
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, []);

  const setPetVisibility = (nextVisible: boolean) => {
    setVisible(nextVisible);
    window.localStorage.setItem(VISIBILITY_KEY, nextVisible ? "1" : "0");
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!position) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: position,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.start.x;
    const deltaY = event.clientY - drag.start.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
    setPosition(clampZyraPetPosition(
      { x: drag.origin.x + deltaX, y: drag.origin.y + deltaY },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (position) window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    suppressClickRef.current = drag.moved;
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  if (!visible) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setPetVisibility(true)}
        className="fixed bottom-4 right-4 z-40 size-11 rounded-xl border-brand-primary/30 bg-card text-brand-primary shadow-md"
        aria-label="Tampilkan pet Zyra"
        title="Tampilkan Zyra"
      >
        <ZyraCharacter state="idle" className="size-9" />
        <Eye className="absolute -right-1 -top-1 size-3.5 rounded-full bg-card" aria-hidden="true" />
      </Button>
    );
  }

  if (!position) return null;

  return (
    <div
      className="fixed z-40 animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{ left: position.x, top: position.y, width: PET_WIDTH }}
    >
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onClick={handleClick}
        className={cn(
          "group flex h-20 w-full touch-none select-none items-center gap-2.5 rounded-2xl border border-brand-primary/25 bg-card/95 p-2.5 pr-10 text-left shadow-lg transition-colors duration-150",
          "hover:border-brand-primary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label="Seret untuk memindahkan Zyra, atau klik untuk membuka"
        title="Seret untuk memindahkan, klik untuk membuka"
      >
        <ZyraPet state={state} className="shrink-0" />
        <span className="min-w-0">
          <span className="block font-heading text-body-sm font-semibold text-foreground">Zyra</span>
          <span className="block truncate text-body-xs text-muted-foreground">{zyraPetLabels[state]}</span>
        </span>
        <GripVertical className="absolute right-2.5 size-4 text-muted-foreground" aria-hidden="true" />
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setPetVisibility(false)}
        className="absolute -right-2 -top-2 size-7 rounded-full border border-border bg-card text-muted-foreground shadow-sm"
        aria-label="Sembunyikan pet Zyra"
        title="Sembunyikan Zyra"
      >
        <EyeOff className="size-3.5" />
      </Button>
    </div>
  );
}
