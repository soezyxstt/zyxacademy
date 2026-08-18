"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZyraCharacter } from "@/components/course/zyra-character";
import { ZyraPet, zyraPetLabels } from "@/components/course/zyra-pet";
import type { ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";

const POSITION_KEY = "zyx-zyra-pet-position-v1";
const VISIBILITY_KEY = "zyx-zyra-pet-visible-v1";
const PET_WIDTH = 80;
const PET_HEIGHT = 88;
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
    { x: window.innerWidth - PET_WIDTH - 24, y: window.innerHeight - PET_HEIGHT - 24 },
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
        className="fixed bottom-6 right-6 z-40 size-12 rounded-full border-brand-primary/40 bg-card/90 text-brand-primary shadow-lg backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
        aria-label="Tampilkan pet Zyra"
        title="Tampilkan Zyra"
      >
        <ZyraCharacter state="idle" className="size-10" />
        <Eye className="absolute -top-1 -right-1 size-4 rounded-full border border-border bg-card p-0.5 text-muted-foreground" aria-hidden="true" />
      </Button>
    );
  }

  if (!position) return null;

  return (
    <div
      className="fixed z-40 select-none group touch-none animate-in fade-in slide-in-from-bottom-3 duration-300"
      style={{ left: position.x, top: position.y, width: PET_WIDTH, height: PET_HEIGHT }}
    >
      {/* Speech Bubble / Status Tooltip */}
      <div
        className={cn(
          "pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-brand-primary/30 bg-card/95 px-2.5 py-1 shadow-lg backdrop-blur-md transition-all duration-200",
          state !== "idle"
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-1 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100"
        )}
      >
        <span className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
          <span className={cn(
            "size-1.5 rounded-full shrink-0",
            state === "success" && "bg-status-success",
            state === "error" && "bg-status-error",
            state === "quota_resting" && "bg-status-warning",
            (state === "thinking" || state === "uploading" || state === "listening" || state === "explaining" || state === "checking") && "bg-brand-primary animate-ping",
            state === "idle" && "bg-brand-primary animate-pulse"
          )} />
          {zyraPetLabels[state]}
        </span>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-2 rotate-45 border-b border-r border-brand-primary/30 bg-card" />
      </div>

      {/* Main Pet Character Button */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onClick={handleClick}
        className="relative flex flex-col items-center justify-end w-full h-full cursor-pointer focus-visible:outline-none"
        aria-label={`Zyra - ${zyraPetLabels[state]}. Seret untuk memindahkan, klik untuk chat.`}
        title="Klik untuk membuka Zyra AI"
      >
        {/* Floating Mascot Character */}
        <div className="animate-zyra-float transition-transform duration-200 group-hover:scale-110 active:scale-95">
          <ZyraPet state={state} />
        </div>

        {/* Soft Ground Shadow underneath */}
        <div className="mt-0.5 h-1.5 w-10 rounded-[100%] bg-black/40 blur-[1.5px] animate-zyra-shadow" />
      </button>

      {/* Discreet Hide Button on Hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPetVisibility(false);
        }}
        className="absolute -top-1 -right-1 size-5 rounded-full border border-border bg-card/90 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm flex items-center justify-center hover:text-foreground hover:bg-muted cursor-pointer"
        aria-label="Sembunyikan pet Zyra"
        title="Sembunyikan Zyra"
      >
        <EyeOff className="size-3" />
      </button>
    </div>
  );
}
