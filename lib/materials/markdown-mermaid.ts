export function parseMermaidToDiagramData(content: string) {
  const lines = content.split("\n");
  const edges: Array<{ source: string; target: string; label?: string }> = [];
  const nodeMap = new Map<string, { id: string; label: string; stepNumber?: number }>();
  let direction = "RIGHT";

  const registerNode = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    const nodeMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\["([\s\S]*?)"\]|\[([\s\S]*?)\]|\("([\s\S]*?)"\)|\(([\s\S]*?)\)|\{"([\s\S]*?)"\}|\{([\s\S]*?)\})?/);
    if (nodeMatch) {
      const id = nodeMatch[1];
      const label = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeMatch[6] || nodeMatch[7] || id;

      const cleanId = id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

      const stepMatch = label.match(/^(?:Langkah|Step|Phase|Stage)\s*(\d+)\s*[:.-]\s*(.+)$/i);
      const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : undefined;
      const cleanLabelText = stepMatch ? stepMatch[2].trim() : label.trim();

      if (!nodeMap.has(cleanId)) {
        nodeMap.set(cleanId, { id: cleanId, label: cleanLabelText, stepNumber });
      }
      return cleanId;
    }

    const cleanId = trimmed.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!nodeMap.has(cleanId)) {
      nodeMap.set(cleanId, { id: cleanId, label: trimmed });
    }
    return cleanId;
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) return;

    if (trimmed.startsWith("graph") || trimmed.startsWith("flowchart")) {
      const dirMatch = trimmed.match(/\b(TD|TB|LR|BT|RL)\b/i);
      if (dirMatch) {
        const d = dirMatch[1].toUpperCase();
        if (d === "TD" || d === "TB") {
          direction = "DOWN";
        } else {
          direction = "RIGHT";
        }
      }
      return;
    }

    const edgeRegex = /^([\s\S]+?)\s*(?:-->\s*\|([\s\S]*?)\||--\s+([\s\S]*?)\s*-->|-->)\s*([\s\S]+)$/;
    const match = trimmed.match(edgeRegex);
    if (match) {
      const rawSource = match[1].trim();
      const edgeLabel = (match[2] || match[3] || "").trim();
      const rawTarget = match[4].trim();

      const sourceId = registerNode(rawSource);
      const targetId = registerNode(rawTarget);

      if (sourceId && targetId) {
        edges.push({
          source: sourceId,
          target: targetId,
          label: edgeLabel || undefined,
        });
      }
    } else {
      registerNode(trimmed);
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    direction,
    diagramType: direction === "DOWN" ? "TD" : "LR"
  };
}
