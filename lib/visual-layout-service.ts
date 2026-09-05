import type { Node, Edge } from "reactflow";

let elkInstance: any = null;

async function getElkInstance() {
  if (!elkInstance) {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    elkInstance = new ELK({
      workerFactory: () => null as any,
    });
  }
  return elkInstance;
}

export interface LayoutDiagnostics {
  layoutTimeMs: number;
  cacheHit: boolean;
  nodeCount: number;
  edgeCount: number;
}

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  diagnostics: LayoutDiagnostics;
}

const layoutCache = new Map<string, Node[]>();

function stableHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function getLayoutedGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "RIGHT" | "DOWN" = "RIGHT"
): Promise<LayoutResult> {
  const startTime = Date.now();
  const graphStr = JSON.stringify({
    nodes: nodes.map(n => ({ id: n.id, label: n.data?.label })),
    edges: edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
    direction
  });
  const hash = stableHash(graphStr);

  if (layoutCache.has(hash)) {
    const cachedNodes = layoutCache.get(hash)!;
    return {
      nodes: cachedNodes,
      edges,
      diagnostics: {
        layoutTimeMs: Date.now() - startTime,
        cacheHit: true,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      }
    };
  }

  const elkNodes = nodes.map(n => ({
    id: n.id,
    width: 150,
    height: 50,
  }));

  const elkEdges = edges.map((e, idx) => ({
    id: `e-${idx}`,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    },
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const elk = await getElkInstance();
    const layout = await elk.layout(graph);
    const positionedNodes = nodes.map(n => {
      const nodeLayout = layout.children?.find((c: any) => c.id === n.id);
      return {
        ...n,
        position: {
          x: nodeLayout?.x || 0,
          y: nodeLayout?.y || 0,
        },
      };
    });

    layoutCache.set(hash, positionedNodes);

    return {
      nodes: positionedNodes,
      edges,
      diagnostics: {
        layoutTimeMs: Date.now() - startTime,
        cacheHit: false,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      }
    };
  } catch (err) {
    console.error("ELK layout failed, falling back to grid positions:", err);
    const positionedNodes = nodes.map((n, idx) => ({
      ...n,
      position: { x: idx * 200, y: 100 },
    }));

    return {
      nodes: positionedNodes,
      edges,
      diagnostics: {
        layoutTimeMs: Date.now() - startTime,
        cacheHit: false,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      }
    };
  }
}
