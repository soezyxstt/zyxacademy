"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactFlow, { BaseEdge, Controls, EdgeLabelRenderer, MarkerType, Position, useNodesInitialized, useReactFlow, type EdgeProps, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLayoutedGraph } from "@/lib/visual-layout-service";
import type { MarkdownDensity } from "@/components/course/markdown-renderer";
import { renderRichText } from "@/components/course/markdown-renderer";
import { useTranslations } from "@/lib/i18n/client";
import { flowchartNodeSize, resolveFlowchartKind } from "@/lib/flowchart";
import { FlowchartNode } from "./flowchart-node";

function RoutedEdge({ id, data, label, markerEnd, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const sections = data?.layoutSections as Array<{ startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }> }> | undefined;
  const points = sections?.flatMap(section => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) ?? [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const a = points[0], b = points[1] ?? points[0];
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "var(--color-muted-foreground)", strokeWidth: 1.5 }} />
    {label ? <EdgeLabelRenderer><div className="nodrag nopan absolute rounded-md bg-card px-1 text-body-sm text-foreground" style={{ transform: `translate(-50%, -50%) translate(${(a.x + b.x) / 2 + (a.x === b.x ? 22 : 0)}px, ${(a.y + b.y) / 2 - (a.y === b.y ? 14 : 0)}px)` }}>{label}</div></EdgeLabelRenderer> : null}
  </>;
}
const nodeTypes = { flowchartSymbol: FlowchartNode };
const edgeTypes = { flowchartRoute: RoutedEdge };

function FitDiagram({ width, height, layout }: { width: number; height: number; layout: Node[] }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!initialized) return;
    const frame = requestAnimationFrame(() => { void fitView({ padding: 0.06, maxZoom: 1 }); });
    return () => cancelAnimationFrame(frame);
  }, [initialized, width, height, layout, fitView]);
  return null;
}

export function FlowchartDiagramRenderer({
  data,
  title,
  caption,
  density,
  embedded = false,
}: {
  data: any;
  title?: string;
  caption?: string;
  density?: MarkdownDensity;
  embedded?: boolean;
}) {
  const t = useTranslations("studentCourse");
  const isCompact = density === "compact";
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(320);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const astNodes = data.nodes || [];
  const astEdges = data.edges || [];
  const graphWidth = Math.max(1, ...nodes.map(node => node.position.x + (node.width ?? 184))) + 40;
  const graphHeight = Math.max(1, ...nodes.map(node => node.position.y + (node.height ?? 80)));
  const height = nodes.length ? Math.max(300, Math.min(1000, graphHeight * Math.min(1, Math.max(1, availableWidth - 32) / graphWidth) + 40)) : 350;

  useEffect(() => {
    if (astNodes.length === 0) {
      setError("Langkah diagram belum tersedia. Minta Zyra membuat ulang flowchart.");
      setLoading(false);
      return;
    }
    if (astEdges.length === 0) {
      setError("Hubungan antar langkah belum tersedia. Minta Zyra membuat ulang flowchart.");
      setLoading(false);
      return;
    }

    let active = true;
    const computeLayout = async () => {
      try {
        setError(null);
        setLoading(true);

        const dir = (data.direction === "RIGHT" || data.direction === "right" || data.diagramType === "LR") ? "RIGHT" : "DOWN";
        const reactFlowNodes = astNodes.map((n: any) => ({
          id: n.id,
          type: "flowchartSymbol",
          data: { label: n.label, kind: resolveFlowchartKind(n) },
          ...flowchartNodeSize(resolveFlowchartKind(n), n.label),
          sourcePosition: dir === "DOWN" ? Position.Bottom : Position.Right,
          targetPosition: dir === "DOWN" ? Position.Top : Position.Left,
          position: { x: 0, y: 0 },
        }));

        const reactFlowEdges = astEdges.map((e: any, idx: number) => ({
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
          label: e.label,
          type: "flowchartRoute",
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-muted-foreground)" },
        }));

        const layoutResult = await getLayoutedGraph(reactFlowNodes, reactFlowEdges, dir);

        if (active) {
          setNodes(layoutResult.nodes);
          setEdges(layoutResult.edges);
        }
      } catch (err: any) {
        console.error("ReactFlow layout parsing failed:", err);
        if (active) setError("Minta Zyra membuat ulang flowchart atau lihat ringkasan langkahnya.");
      } finally {
        if (active) setLoading(false);
      }
    };

    computeLayout();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className={cn("text-center", !embedded && ["border border-border bg-card shadow-xs", isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl"])}>
      {title && <h4 className={cn("font-heading text-body-base font-bold text-foreground", isCompact ? "mb-2" : "mb-4")}>{renderRichText(title)}</h4>}
      <div ref={containerRef} style={{ height }} className="w-full border border-border/60 rounded-lg bg-background overflow-hidden relative" role="group" aria-label={data.altText ?? "Flowchart"} aria-busy={loading}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-destructive/5 text-destructive border border-destructive/20 rounded-lg">
            <AlertTriangle className="size-8 mb-2 text-destructive" />
            <span className="font-semibold text-body-sm">{t("learningCanvas.diagramUnavailableTitle")}</span>
            <span className="text-body-xs text-muted-foreground mt-1 text-center max-w-[80%]">
              {t("learningCanvas.diagramUnavailable")}
            </span>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-body-sm font-sans">
            {t("learningCanvas.diagramLoading")}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            minZoom={0.1}
            zoomOnScroll={false}
            attributionPosition="bottom-left"
          ><FitDiagram width={availableWidth} height={height} layout={nodes} /><Controls position="top-right" showInteractive={false} /></ReactFlow>
        )}
      </div>
      {caption && <p className={cn("text-body-sm text-muted-foreground italic", isCompact ? "mt-2" : "mt-3")}>{renderRichText(caption)}</p>}
    </div>
  );
}
