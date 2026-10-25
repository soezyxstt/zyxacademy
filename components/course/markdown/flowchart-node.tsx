"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { MathText } from "@/components/course/math-text";
import { flowchartNodeSize, type FlowchartNodeKind } from "@/lib/flowchart";

/** The outline and label share bounds so text stays inside its semantic symbol. */
export function FlowchartNode({ data, sourcePosition = Position.Bottom, targetPosition = Position.Top }: NodeProps<{ label: string; kind: FlowchartNodeKind }>) {
  const { kind, label } = data;
  const { width, height } = flowchartNodeSize(kind, label);
  return <div data-flowchart-kind={kind} aria-label={`${kind}: ${label}`} className="relative text-body-sm text-foreground" style={{ width, height }}>
    <Handle type="target" position={targetPosition} className="opacity-0" />
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="absolute inset-0 fill-card stroke-primary" strokeWidth={1.5}>
      {kind === "decision" ? <polygon points={`${width / 2},1 ${width - 1},${height / 2} ${width / 2},${height - 1} 1,${height / 2}`} />
        : kind === "input" || kind === "output" ? <polygon points={`21,1 ${width - 1},1 ${width - 21},${height - 1} 1,${height - 1}`} />
          : kind === "start" || kind === "end" ? <ellipse cx={width / 2} cy={height / 2} rx={width / 2 - 1} ry={height / 2 - 1} />
            : <rect x={1} y={1} width={width - 2} height={height - 2} />}
    </svg>
    <div className="relative flex h-full items-center justify-center text-center" style={{ padding: kind === "decision" ? `${height / 4}px 43px` : "8px 27px" }}>
      <MathText className="min-w-0 break-words leading-tight">{label}</MathText>
    </div>
    <Handle type="source" position={sourcePosition} className="opacity-0" />
  </div>;
}
