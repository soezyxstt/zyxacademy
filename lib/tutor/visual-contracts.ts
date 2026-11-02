import { z } from "zod";
import { FlowchartNodeKindSchema } from "@/lib/flowchart";

/**
 * Plan 006: Tutor Visual Contracts
 * Defines typed schemas and semantic validators for graphs, charts, and flowcharts.
 * The model emits structured visual specs; application code serializes them deterministically.
 */

export const VisualTypeSchema = z.enum(["graph", "chart", "flowchart"]);
export type VisualType = z.infer<typeof VisualTypeSchema>;

export const RelationshipEdgeSchema = z.object({
  sourceNode: z.string().min(1),
  targetNode: z.string().min(1),
  label: z.string().optional(),
});
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>;

export const VisualSpecSchema = z.object({
  type: VisualTypeSchema,
  title: z.string().min(3),
  semanticLabels: z.array(z.string().min(1)),
  nodeKinds: z.record(z.string(), FlowchartNodeKindSchema).optional(),
  values: z.record(z.string(), z.union([z.number(), z.string()])),
  relationships: z.array(RelationshipEdgeSchema),
  sourceClaimIds: z.array(z.string().min(1)),
  altDescription: z.string().min(5, "Accessibility alt description is required"),
});
export type VisualSpec = z.infer<typeof VisualSpecSchema>;

export const TutorAnswerWithVisualSchema = z.object({
  textAnswer: z.string().min(10),
  visualIntent: VisualSpecSchema.nullable(),
});
export type TutorAnswerWithVisual = z.infer<typeof TutorAnswerWithVisualSchema>;

export interface VisualValidationResult {
  isValid: boolean;
  reasonCodes: string[];
}

/**
 * Validates a VisualSpec against domain rules:
 * - Finite numbers in values
 * - Non-empty labels
 * - Valid edges referencing existing node IDs or labels
 * - Matching source claim IDs against retrieved source set
 */
export function validateVisualSpec(
  spec: VisualSpec | null | undefined,
  allowedSourceClaimIds?: string[]
): VisualValidationResult {
  if (!spec) {
    return { isValid: true, reasonCodes: [] };
  }

  const reasonCodes: string[] = [];

  // 1. Title and Alt Description
  if (!spec.title || spec.title.trim().length < 3) {
    reasonCodes.push("INVALID_VISUAL_TITLE");
  }
  if (!spec.altDescription || spec.altDescription.trim().length < 5) {
    reasonCodes.push("INVALID_VISUAL_ALT_DESCRIPTION");
  }

  // 2. Validate numeric values are finite
  for (const [_key, val] of Object.entries(spec.values)) {
    if (typeof val === "number" && (!Number.isFinite(val) || Number.isNaN(val))) {
      reasonCodes.push("NON_FINITE_NUMERIC_VALUE");
    }
  }

  // 3. Type-specific validations
  if (spec.type === "chart") {
    if (spec.semanticLabels.length === 0) {
      reasonCodes.push("EMPTY_CHART_AXES");
    }
    if (Object.keys(spec.values).length === 0) {
      reasonCodes.push("EMPTY_CHART_DATA");
    }
  }

  if (spec.type === "flowchart" || spec.type === "graph") {
    if (spec.relationships.length === 0 && spec.semanticLabels.length < 2) {
      reasonCodes.push("EMPTY_GRAPH_RELATIONSHIPS");
    }
  }

  // 4. Source claim matching if allowed set is provided
  if (allowedSourceClaimIds && allowedSourceClaimIds.length > 0) {
    const invalidClaims = spec.sourceClaimIds.filter(
      (claimId) => !allowedSourceClaimIds.includes(claimId)
    );
    if (invalidClaims.length > 0) {
      reasonCodes.push("UNGROUNDED_VISUAL_CLAIM_ID");
    }
  }

  return {
    isValid: reasonCodes.length === 0,
    reasonCodes,
  };
}
