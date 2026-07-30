import { VisualSpec, validateVisualSpec } from "./visual-contracts";

/**
 * Plan 006: Tutor Visual Serializer
 * Deterministically serializes typed VisualSpec objects into application-owned visual codeblocks.
 * The model emits structured JSON; this code converts it safely to Markdown syntax.
 */

function escapeLabel(label: string): string {
  return label.replace(/[:"\n]/g, " ").trim();
}

/**
 * Serializes a VisualSpec into Markdown visual syntax (`:::chart`, `:::graph`, `:::flowchart`).
 * Returns null if spec is null/invalid.
 */
export function serializeVisualSpec(
  spec: VisualSpec | null | undefined,
  allowedSourceClaimIds?: string[]
): string | null {
  if (!spec) return null;

  const validation = validateVisualSpec(spec, allowedSourceClaimIds);
  if (!validation.isValid) {
    return null;
  }

  const titleStr = escapeLabel(spec.title);
  const altStr = escapeLabel(spec.altDescription);

  if (spec.type === "chart") {
    const dataLines: string[] = [];
    for (const [key, val] of Object.entries(spec.values)) {
      dataLines.push(`  "${escapeLabel(key)}": ${JSON.stringify(val)}`);
    }
    const labelsStr = spec.semanticLabels.map(escapeLabel).join(", ");
    return [
      `:::chart title="${titleStr}" alt="${altStr}" labels="${labelsStr}"`,
      `{`,
      dataLines.join(",\n"),
      `}`,
      `:::`,
    ].join("\n");
  }

  if (spec.type === "flowchart" || spec.type === "graph") {
    const edgeLines = spec.relationships.map((rel) => {
      const src = escapeLabel(rel.sourceNode);
      const tgt = escapeLabel(rel.targetNode);
      const lbl = rel.label ? ` : "${escapeLabel(rel.label)}"` : "";
      return `  "${src}" --> "${tgt}"${lbl}`;
    });

    const blockType = spec.type === "flowchart" ? "flowchart" : "graph";
    return [
      `:::${blockType} title="${titleStr}" alt="${altStr}"`,
      edgeLines.join("\n"),
      `:::`,
    ].join("\n");
  }

  return null;
}
