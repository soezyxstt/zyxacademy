"use client";

import React, { useState, useEffect } from "react";
import ReactFlow, { Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLayoutedGraph } from "@/lib/visual-layout-service";
import type { MarkdownDensity } from "@/components/course/markdown-renderer";
import { renderRichText } from "@/components/course/markdown-renderer";
import { useTranslations } from "@/lib/i18n/client";

export function FlowchartDiagramRenderer({
  data,
  title,
  caption,
  density,
}: {
  data: any;
  title?: string;
  caption?: string;
  density?: MarkdownDensity;
}) {
  const t = useTranslations("studentCourse");
  const isCompact = density === "compact";
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const astNodes = data.nodes || [];
  const astEdges = data.edges || [];

  useEffect(() => {
    if (astNodes.length === 0) {
      console.error("Flowchart has no nodes to render.");
      setError("unavailable");
      setLoading(false);
      return;
    }
    if (astEdges.length === 0) {
      console.error("Flowchart has no edges to render.");
      setError("unavailable");
      setLoading(false);
      return;
    }

    const computeLayout = async () => {
      try {
        setError(null);
        setLoading(true);

        const reactFlowNodes = astNodes.map((n: any) => ({
          id: n.id,
          data: { label: n.label },
          position: { x: 0, y: 0 },
          style: {
            background: "var(--color-card)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: "600",
            textAlign: "center",
            boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05)",
          },
        }));

        const reactFlowEdges = astEdges.map((e: any, idx: number) => ({
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          style: { stroke: "var(--color-border)" },
        }));

        const dir = (data.direction === "DOWN" || data.diagramType === "TD" || data.diagramType === "TB" || data.diagramType === "vertical") ? "DOWN" : "RIGHT";
        const layoutResult = await getLayoutedGraph(reactFlowNodes, reactFlowEdges, dir);

        setNodes(layoutResult.nodes);
        setEdges(layoutResult.edges);
        console.debug("Flowchart layout diagnostics:", layoutResult.diagnostics);
      } catch (err: any) {
        console.error("ReactFlow layout parsing failed:", err);
        setError("unavailable");
      } finally {
        setLoading(false);
      }
    };

    computeLayout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className={cn("border border-border bg-card shadow-xs text-center", isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl")}>
      {title && <h4 className={cn("font-heading text-body-base font-bold text-foreground", isCompact ? "mb-2" : "mb-4")}>{renderRichText(title)}</h4>}
      <div className="w-full h-[350px] border border-border/60 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden relative">
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
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            fitView
          />
        )}
      </div>
      {caption && <p className={cn("text-body-sm text-muted-foreground italic", isCompact ? "mt-2" : "mt-3")}>{renderRichText(caption)}</p>}
    </div>
  );
}
