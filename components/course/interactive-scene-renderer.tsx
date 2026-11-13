"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathText } from "@/components/course/math-text";
import { SceneSvg } from "@/components/course/interactive-scene-svg";
import { initialSceneState, sceneValue, setSceneParameter, type InteractiveSceneSpec, type SceneShape } from "@/lib/materials/interactive-scene";

export function stopSceneKey(event: React.KeyboardEvent) {
  if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") event.preventDefault();
  event.stopPropagation();
}

export function InteractiveSceneRenderer({ spec }: { spec: InteractiveSceneSpec }) {
  const [state, setState] = useState(() => initialSceneState(spec));
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setState(initialSceneState(spec)); setPlaying(false); }, [spec]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    update(); media.addEventListener("change", update);
    const hidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", hidden);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { if (!entry?.isIntersecting) setPlaying(false); });
    if (root.current) observer?.observe(root.current);
    return () => { media.removeEventListener("change", update); document.removeEventListener("visibilitychange", hidden); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing || !spec.time) return;
    const time = spec.time, p = spec.parameters.find(item => item.id === time.parameter)!;
    let frame = 0, last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const elapsed = (now - last) / 1000 * time.rate;
        setState(current => ({ ...current, [p.id]: Math.min(p.max, current[p.id] + elapsed) }));
      }
      last = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, spec]);
  useEffect(() => {
    if (spec.time && state[spec.time.parameter] >= spec.parameters.find(p => p.id === spec.time!.parameter)!.max) setPlaying(false);
  }, [state, spec]);
  const change = (id: string, value: number) => setState(current => setSceneParameter(spec, current, id, value));
  const action = (shape: SceneShape, direction?: string) => {
    const a = shape.action;
    if (!a) return;
    if (a.type === "set") change(a.parameter, a.value);
    else if (a.type === "cycle") {
      const options = spec.parameters.find(p => p.id === a.parameter)!.options!;
      setState(current => setSceneParameter(spec, current, a.parameter, options[(options.findIndex(o => o.value === current[a.parameter]) + 1) % options.length].value));
    } else if (direction) {
      const axis = direction === "ArrowLeft" || direction === "ArrowRight" ? a.xParameter : a.yParameter;
      const step = spec.parameters.find(p => p.id === axis)!.step;
      setState(current => setSceneParameter(spec, current, axis, current[axis] + (direction === "ArrowLeft" || direction === "ArrowUp" ? -step : step)));
    }
  };
  const drag = (shape: SceneShape, event: React.PointerEvent<SVGGElement>) => {
    if (shape.action?.type !== "drag") return;
    const svg = event.currentTarget.ownerSVGElement, transform = svg?.getScreenCTM();
    if (!svg || !transform) return;
    try {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      const { xParameter, yParameter } = shape.action;
      setState(current => setSceneParameter(spec, setSceneParameter(spec, current, xParameter, point.x), yParameter, point.y));
    } catch { /* A detached or singular SVG cannot map pointer coordinates. */ }
  };
  return <div ref={root} data-interactive-scene className="space-y-3" onClick={event => event.stopPropagation()} onKeyDown={stopSceneKey}>
    <Button type="button" size="sm" variant="outline" aria-pressed={showFallback} onClick={() => { setPlaying(false); setShowFallback(value => !value); }}>{showFallback ? "Tampilkan visual" : "Tampilkan alternatif"}</Button>
    {showFallback ? <div data-visual-fallback className="space-y-1 text-body-sm"><MathText as="p">{spec.staticFallback.summary}</MathText><MathText as="p">{spec.staticFallback.content}</MathText></div> : <>
    <SceneSvg spec={spec} state={state} onAction={action} onDrag={drag} />
    <div className="flex flex-wrap items-center gap-3">
      {spec.time ? <Button type="button" size="sm" variant="outline" disabled={reduced} onClick={() => { const p = spec.parameters.find(item => item.id === spec.time!.parameter)!; if (state[p.id] >= p.max) setState(current => ({ ...current, [p.id]: p.min })); setPlaying(value => !value); }}>{playing ? "Jeda" : "Putar"}</Button> : null}
      <Button type="button" size="sm" variant="outline" onClick={() => { setPlaying(false); setState(initialSceneState(spec)); }}>Reset</Button>
      {spec.outputs.map((output, index) => { let result: string; try { result = String(Number(sceneValue(output.value, state).toPrecision(6))); } catch { result = "tidak tersedia"; } return <span key={index} className="text-body-sm"><MathText>{output.label}</MathText>: {result}{output.unit ? ` ${output.unit}` : ""}</span>; })}
    </div>
    {reduced && spec.time ? <p className="text-body-xs text-muted-foreground">Animasi dijeda sesuai pengaturan gerakan. Waktu tetap dapat diubah.</p> : null}
    <div className="flex flex-wrap items-end gap-3">
      {spec.parameters.map(p => <div key={p.id} className="min-w-[140px] max-w-full flex-1 space-y-1">
        <span id={`${prefix}-${p.id}`} className="block text-body-sm font-semibold"><MathText>{p.label}</MathText>{p.control === "range" ? `: ${Number(state[p.id].toPrecision(6))}${p.unit ? ` ${p.unit}` : ""}` : ""}</span>
        {p.control === "range" ? <Slider aria-labelledby={`${prefix}-${p.id}`} min={p.min} max={p.max} step={p.step} value={[state[p.id]]} onValueChange={([value]) => { if (spec.time?.parameter === p.id) setPlaying(false); change(p.id, value); }} className="h-10" /> : p.control === "toggle" ? <Button data-scene-control type="button" variant="outline" aria-labelledby={`${prefix}-${p.id}`} aria-pressed={state[p.id] === p.options![1].value} onClick={() => change(p.id, state[p.id] === p.options![0].value ? p.options![1].value : p.options![0].value)}>{p.options!.find(o => o.value === state[p.id])?.label}</Button> : <Select value={String(state[p.id])} onValueChange={value => change(p.id, Number(value))}><SelectTrigger data-scene-control aria-labelledby={`${prefix}-${p.id}`}><SelectValue /></SelectTrigger><SelectContent>{p.options!.map(option => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent></Select>}
      </div>)}
    </div>
    </>}
  </div>;
}
