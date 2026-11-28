"use client";

import React, { type ReactNode } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";

export interface SimulationParameterControl {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (next: number) => void;
}

export interface SimulationReadout {
  label: string;
  value: string;
  tone?: "default" | "primary" | "secondary" | "success" | "warning";
}

export interface SimulationViewOption {
  value: string;
  label: string;
}

export interface SimulationShellProps {
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onReset?: () => void;
  speed?: number;
  onSpeedChange?: (speed: number) => void;
  time?: number;
  duration?: number;
  onTimeScrub?: (t: number) => void;
  views?: SimulationViewOption[];
  activeView?: string;
  onViewChange?: (view: string) => void;
  readouts?: SimulationReadout[];
  parameters?: SimulationParameterControl[];
  summary?: string;
  dataKind: string;
  children: ReactNode;
}

export function SimulationShell({
  isPlaying,
  onTogglePlay,
  onReset,
  speed = 1,
  onSpeedChange,
  time,
  duration,
  onTimeScrub,
  views,
  activeView,
  onViewChange,
  readouts,
  parameters,
  summary,
  dataKind,
  children,
}: SimulationShellProps) {
  return (
    <div
      data-assessment-sim={dataKind}
      className="space-y-3"
    >
      {/* Top bar: Playback Toolbar + View SegmentedControl */}
      {(onTogglePlay || onReset || (views && views.length > 1)) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {(onTogglePlay || onReset) ? (
            <Toolbar
              aria-label="Kontrol simulasi"
              className="inline-flex items-center gap-1"
            >
              {onTogglePlay ? (
                <ToolbarButton
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? "Jeda simulasi" : "Putar simulasi"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 text-body-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="size-3.5 text-brand-primary" aria-hidden />
                      <span>Jeda</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 text-brand-primary" aria-hidden />
                      <span>Putar</span>
                    </>
                  )}
                </ToolbarButton>
              ) : null}
              {onReset ? (
                <ToolbarButton
                  onClick={onReset}
                  aria-label="Reset simulasi"
                  className="inline-flex size-8 items-center justify-center rounded-md border border-border/80 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                </ToolbarButton>
              ) : null}
              {onSpeedChange ? (
                <SegmentedControl
                  aria-label="Kecepatan simulasi"
                  value={String(speed)}
                  onValueChange={(next) => {
                    if (!next) return;
                    const parsed = Number(next);
                    if (Number.isFinite(parsed)) onSpeedChange(parsed);
                  }}
                  className="ml-1 items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
                >
                  <SegmentedControlIndicator className="rounded bg-background shadow-2xs" />
                  {[0.5, 1, 2].map((s) => (
                    <SegmentedControlItem
                      key={s}
                      value={String(s)}
                      className="rounded px-1.5 py-0.5 text-body-2xs font-semibold tabular-nums text-muted-foreground transition-colors hover:text-foreground data-checked:text-foreground"
                    >
                      {s}x
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              ) : null}
            </Toolbar>
          ) : null}

          {views && views.length > 1 && activeView && onViewChange ? (
            <SegmentedControl
              aria-label="Mode tampilan simulasi"
              value={activeView}
              onValueChange={(next) => {
                if (next) onViewChange(next);
              }}
              className="items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
            >
              <SegmentedControlIndicator className="rounded bg-background shadow-2xs" />
              {views.map((view) => (
                <SegmentedControlItem
                  key={view.value}
                  value={view.value}
                  className="rounded px-2 py-1 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-checked:text-foreground"
                >
                  {view.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null}
        </div>
      ) : null}

      {/* Main Canvas / Chart Stage */}
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {children}
      </div>

      {/* Time scrubber when simulation is time-based */}
      {typeof time === "number" && typeof duration === "number" && onTimeScrub ? (
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-body-xs font-medium tabular-nums text-muted-foreground">
            t = {time.toFixed(2)} s
          </span>
          <Slider
            value={time}
            min={0}
            max={duration}
            step={duration / 200}
            onValueChange={(next) => {
              const val = Array.isArray(next) ? next[0] : next;
              if (typeof val === "number" && Number.isFinite(val)) {
                onTimeScrub(val);
              }
            }}
            aria-label="Waktu simulasi"
            className="flex flex-1 items-center"
          >
            <SliderControl className="flex h-6 w-full cursor-pointer items-center">
              <SliderTrack className="relative h-1.5 w-full rounded-full bg-muted">
                <SliderIndicator className="h-full rounded-full bg-brand-primary" />
                <SliderThumb
                  aria-label="Waktu simulasi"
                  className="top-1/2 size-3.5 -translate-y-1/2 rounded-full border border-brand-primary bg-background shadow-sm transition-transform hover:scale-110 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                />
              </SliderTrack>
            </SliderControl>
          </Slider>
          <span className="shrink-0 text-body-2xs tabular-nums text-muted-foreground">
            {duration.toFixed(1)} s
          </span>
        </div>
      ) : null}

      {/* Live Engineering Readouts */}
      {readouts && readouts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-2">
          {readouts.map((item) => (
            <div key={item.label} className="inline-flex items-baseline gap-1.5 text-body-xs">
              <span className="text-muted-foreground">
                <MathText>{item.label}</MathText>:
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  item.tone === "primary"
                    ? "text-brand-primary"
                    : item.tone === "secondary"
                      ? "text-brand-secondary"
                      : item.tone === "success"
                        ? "text-status-success"
                        : item.tone === "warning"
                          ? "text-status-warning"
                          : "text-foreground",
                )}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Parameter Sliders */}
      {parameters && parameters.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-border/50 pt-2.5 sm:grid-cols-2">
          {parameters.map((param) => (
            <div key={param.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-body-xs">
                <span className="font-medium text-foreground">
                  <MathText>{param.label}</MathText>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {Number(param.value.toPrecision(4))}
                  {param.unit ? ` ${param.unit}` : ""}
                </span>
              </div>
              <Slider
                value={param.value}
                min={param.min}
                max={param.max}
                step={param.step}
                onValueChange={(next) => {
                  const val = Array.isArray(next) ? next[0] : next;
                  if (typeof val === "number" && Number.isFinite(val)) {
                    param.onChange(val);
                  }
                }}
                aria-label={param.label}
                className="flex items-center"
              >
                <SliderControl className="flex h-5 w-full cursor-pointer items-center">
                  <SliderTrack className="relative h-1.5 w-full rounded-full bg-muted">
                    <SliderIndicator className="h-full rounded-full bg-brand-primary" />
                    <SliderThumb
                      aria-label={param.label}
                      className="top-1/2 size-3.5 -translate-y-1/2 rounded-full border border-brand-primary bg-background shadow-sm transition-transform hover:scale-110 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    />
                  </SliderTrack>
                </SliderControl>
              </Slider>
            </div>
          ))}
        </div>
      ) : null}

      {summary ? (
        <MathText as="p" className="text-body-xs text-muted-foreground">
          {summary}
        </MathText>
      ) : null}
    </div>
  );
}
