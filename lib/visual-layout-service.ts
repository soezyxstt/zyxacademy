import type { Node, Edge } from "reactflow";

let elkInstance: any = null;

async function getElkInstance() {
  if (!elkInstance) {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    elkInstance = new ELK();
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

const layoutCache = new Map<string, { nodes: Node[]; edges: Edge[] }>();

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
    nodes: nodes.map(n => ({ id: n.id, data: n.data, type: n.type, width: n.width, height: n.height })),
    edges,
    direction
  });
  const hash = stableHash(graphStr);

  if (layoutCache.has(hash)) {
    const cached = layoutCache.get(hash)!;
    return {
      nodes: cached.nodes,
      edges: cached.edges,
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
    width: n.width ?? 150,
    height: n.height ?? 50,
    ...(n.type === "flowchartSymbol" ? {
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: [
        { id: `${n.id}:north`, x: (n.width ?? 150) / 2, y: 0, width: 0, height: 0, layoutOptions: { "elk.port.side": "NORTH" } },
        { id: `${n.id}:east`, x: n.width ?? 150, y: (n.height ?? 50) / 2, width: 0, height: 0, layoutOptions: { "elk.port.side": "EAST" } },
        { id: `${n.id}:south`, x: (n.width ?? 150) / 2, y: n.height ?? 50, width: 0, height: 0, layoutOptions: { "elk.port.side": "SOUTH" } },
        { id: `${n.id}:west`, x: 0, y: (n.height ?? 50) / 2, width: 0, height: 0, layoutOptions: { "elk.port.side": "WEST" } },
      ],
    } : {}),
  }));

  const elkEdges = edges.map((e, idx) => {
    const source = nodes.find(node => node.id === e.source);
    const target = nodes.find(node => node.id === e.target);
    const outgoing = edges.filter(edge => edge.source === e.source);
    const isBranch = source?.data.kind === "decision" && outgoing.length > 1 && outgoing[0] === e;
    const sourceSide = direction === "DOWN" ? (isBranch ? "east" : "south") : (isBranch ? "south" : "east");
    return {
      id: `e-${idx}`,
      sources: [source?.type === "flowchartSymbol" ? `${e.source}:${sourceSide}` : e.source],
      targets: [target?.type === "flowchartSymbol" ? `${e.target}:${direction === "DOWN" ? "north" : "west"}` : e.target],
    };
  });

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
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

    const routedEdges = edges.map((edge, index) => ({ ...edge, data: { ...edge.data, layoutSections: layout.edges?.find((item: any) => item.id === `e-${index}`)?.sections } }));
    if (layoutCache.size >= 100) layoutCache.clear();
    layoutCache.set(hash, { nodes: positionedNodes, edges: routedEdges });

    return {
      nodes: positionedNodes,
      edges: routedEdges,
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
