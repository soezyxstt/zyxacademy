"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Board } from "jsxgraph";
import { Slider } from "@/components/ui/slider";
import type { PublicEpsilonDeltaGraphSpec } from "@/lib/articles/structured-read-model";
import { evaluateVisualFunction } from "@/lib/materials/visual-contract";
import { MathText } from "@/components/course/math-text";
import katex from "@/lib/math/katex";
import { scientificNumberToLatex } from "@/lib/math/scientific-format";
import { visualFunctionToLatex } from "@/lib/math/visual-function-latex";

interface EpsilonDeltaBoardProps {
  spec: PublicEpsilonDeltaGraphSpec;
  epsilon: number;
  delta: number | null;
}

export function EpsilonDeltaBoard({ spec, epsilon, delta }: EpsilonDeltaBoardProps) {
  const container = useRef<HTMLDivElement>(null);
  const board = useRef<Board | null>(null);
  const [probeX, setProbeX] = useState(spec.limitPoint);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const probeLabelId = useId();
  const descriptionId = useId();
  const current = useRef({ epsilon, delta, probeX });

  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    setStatus("loading");
    setProbeX(spec.limitPoint);
    void import("jsxgraph").then(({ default: JXG }) => {
      if (disposed || !container.current) return;
      const { xMin, xMax, yMin, yMax } = spec.bounds;
      if (![xMax - xMin, yMax - yMin].every(value => Number.isFinite(value) && value > 0)) {
        setStatus("error");
        return;
      }
      const c = spec.limitPoint;
      const limit = spec.limitValue;
      const styles = getComputedStyle(container.current);
      const foreground = styles.color;
      // JSXGraph's color parser needs RGB, while the design tokens use OKLCH.
      const colorContext = document.createElement("canvas").getContext("2d");
      const tokenColor = (token: string) => {
        if (!colorContext) return foreground;
        colorContext.fillStyle = styles.getPropertyValue(token).trim() || foreground;
        colorContext.fillRect(0, 0, 1, 1);
        return `rgb(${Array.from(colorContext.getImageData(0, 0, 1, 1).data).slice(0, 3).join(",")})`;
      };
      const primary = tokenColor("--primary");
      const warning = tokenColor("--color-status-warning");
      const mathLabel = (latex: string) => katex.renderToString(latex, { trust: false, throwOnError: true });
      const ticks = (axis: 1 | 2) => ({
        drawZero: false,
        label: { parse: false, display: "html" as const, fontSize: 13 },
        generateLabelText: (position: { usrCoords: number[] }) => mathLabel(scientificNumberToLatex(position.usrCoords[axis])),
      });
      const instance = JXG.JSXGraph.initBoard(container.current, {
        boundingbox: [xMin, yMax, xMax, yMin],
        axis: true,
        // @ts-expect-error JSXGraph 1.14 types omit documented HTML tick labels: https://jsxgraph.org/docs/Ticks.html
        defaultAxes: { x: { ticks: ticks(1) }, y: { ticks: ticks(2) } },
        keepaspectratio: false,
        showCopyright: false,
        showNavigation: false,
        showInfobox: false,
        pan: { enabled: false },
        zoom: false,
        title: "Grafik epsilon delta",
      });
      board.current = instance;
      release = () => {
        JXG.JSXGraph.freeBoard(instance);
        if (board.current === instance) board.current = null;
      };
      const fixed = { fixed: true, highlight: false };
      const horizontal = (y: () => number, color: string, name: string) => {
        instance.create("segment", [[xMin, y], [xMax, y]], { ...fixed, strokeColor: color, dash: 2 });
        instance.create("text", [xMin + (xMax - xMin) * 0.03, y, mathLabel(name)], {
          ...fixed, parse: false, display: "html", strokeColor: color, anchorY: "bottom", fontSize: 13,
          visible: () => name === "L" || current.current.epsilon * instance.unitY > 24,
        });
      };
      const vertical = (x: () => number, name: string) => {
        instance.create("segment", [[x, yMin], [x, yMax]], { ...fixed, strokeColor: warning, dash: 2 });
        instance.create("text", [x, yMin + (yMax - yMin) * 0.08, mathLabel(name)], {
          ...fixed, parse: false, display: "html", strokeColor: foreground, anchorX: "middle", fontSize: 13,
          visible: () => name === "c" || (current.current.delta ?? 0) * instance.unitX > 44,
        });
      };
      instance.create("polygon", [
        [xMin, () => limit - current.current.epsilon],
        [xMax, () => limit - current.current.epsilon],
        [xMax, () => limit + current.current.epsilon],
        [xMin, () => limit + current.current.epsilon],
      ], { ...fixed, vertices: { visible: false }, borders: { visible: false }, fillColor: primary, fillOpacity: 0.1 });
      instance.create("polygon", [
        [() => c - (current.current.delta ?? 0), yMin],
        [() => c + (current.current.delta ?? 0), yMin],
        [() => c + (current.current.delta ?? 0), yMax],
        [() => c - (current.current.delta ?? 0), yMax],
      ], { ...fixed, vertices: { visible: false }, borders: { visible: false }, fillColor: warning, fillOpacity: 0.1 });
      horizontal(() => limit, foreground, "L");
      horizontal(() => limit + current.current.epsilon, primary, "L+\\varepsilon");
      horizontal(() => limit - current.current.epsilon, primary, "L-\\varepsilon");
      vertical(() => c, "c");
      vertical(() => c - (current.current.delta ?? 0), "c-\\delta");
      vertical(() => c + (current.current.delta ?? 0), "c+\\delta");
      instance.create("functiongraph", [(x: number) => evaluateVisualFunction(spec.functionModel, x), xMin, xMax], {
        ...fixed, strokeColor: foreground, strokeWidth: 2,
      });
      instance.create("point", [c, evaluateVisualFunction(spec.functionModel, c)], {
        ...fixed, name: "", fillColor: foreground, strokeColor: foreground, size: 3,
      });
      instance.create("point", [() => current.current.probeX, () => evaluateVisualFunction(spec.functionModel, current.current.probeX)], {
        ...fixed, name: "", fillColor: primary, strokeColor: primary, size: 4,
      });
      setStatus("ready");
    }).catch(() => {
      release?.();
      release = undefined;
      if (!disposed) setStatus("error");
    });
    return () => {
      disposed = true;
      release?.();
    };
  }, [spec]);

  useEffect(() => {
    current.current = { epsilon, delta, probeX };
    board.current?.update();
  }, [epsilon, delta, probeX]);

  const distanceX = Math.abs(probeX - spec.limitPoint);
  const probeY = evaluateVisualFunction(spec.functionModel, probeX);
  const distanceY = Math.abs(probeY - spec.limitValue);
  const inside = delta !== null && distanceX > 0 && distanceX < delta;
  return (
    <div className="space-y-3">
      <MathText as="div" className="text-body-base">{`$${visualFunctionToLatex(spec.functionModel)}$, $c=${scientificNumberToLatex(spec.limitPoint)}$, $L=${scientificNumberToLatex(spec.limitValue)}$`}</MathText>
      <div
        ref={container}
        role="img"
        aria-label={spec.label}
        aria-describedby={descriptionId}
        className="relative h-80 w-full overflow-hidden rounded-lg border border-border bg-background text-foreground"
        data-testid="epsilon-delta-board"
      />
      <p id={descriptionId} className="sr-only">{spec.description}</p>
      {status !== "ready" ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          {status === "error" ? "Grafik belum dapat dimuat. Gunakan tabel nilai." : "Memuat grafik interaktif..."}
        </p>
      ) : null}
      <div className="space-y-3">
        <p id={probeLabelId} className="text-body-sm">Posisi <MathText>{`$x=${scientificNumberToLatex(probeX)}$`}</MathText></p>
        <Slider
          aria-labelledby={probeLabelId}
          min={spec.bounds.xMin}
          max={spec.bounds.xMax}
          step={(spec.bounds.xMax - spec.bounds.xMin) / 200}
          value={[probeX]}
          onValueChange={([value]) => setProbeX(value)}
          disabled={status !== "ready"}
        />
        <div role="status" aria-live="polite" data-testid="epsilon-probe-readout" data-probe-y={probeY} className="space-y-2 text-body-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <MathText>{`$f(x)\\approx ${scientificNumberToLatex(probeY)}$`}</MathText>
            <MathText>{`$|x-c|\\approx ${scientificNumberToLatex(distanceX)}$`}</MathText>
            <MathText>{`$|f(x)-L|\\approx ${scientificNumberToLatex(distanceY)}$`}</MathText>
          </div>
          <MathText className="text-muted-foreground">{distanceX === 0 ? "$x=c$ dikecualikan dari syarat limit." : inside ? "$0<|x-c|<\\delta$: input berada di dalam lingkungan delta." : "$|x-c|\\ge\\delta$: input berada di luar lingkungan delta."}</MathText>
        </div>
      </div>
    </div>
  );
}
