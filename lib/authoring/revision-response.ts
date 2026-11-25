import type { ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import type { RevisionPatchOperation, ValidRevisionProductBundle } from "./revision-artifact";

export type RevisionResponseMode = "full" | "compact";
export type RevisionReadTarget = RevisionPatchOperation["target"];
export type RevisionContextOptions = { responseMode?: RevisionResponseMode; target?: RevisionReadTarget };

const forbiddenIds = new Set(["__proto__", "constructor", "prototype"]);
const ideaCollections = {
  idea: "ideas", ideas: "ideas", provenance: "provenance", relation: "relations", relations: "relations",
  learning_section: "learningSections", learning_sections: "learningSections",
  source_material: "sourceMaterials", source_chunk: "sourceChunks",
} as const;

function unique<T extends { id: string }>(items: readonly T[], id: string): T {
  const matches = items.filter(item => item.id === id);
  if (matches.length !== 1) throw new Error("REVISION_TARGET_NOT_FOUND");
  return matches[0];
}

/** Select only within the admitted artifact and the exact supplied parent IDs. */
export function selectRevisionContent(bundle: ValidatedIdeaBundle | ValidRevisionProductBundle, target: RevisionReadTarget) {
  if (Object.keys(target).some(key => !["entityType", "entityId", "sectionId", "blockId", "itemId", "unitId"].includes(key))) throw new Error("REVISION_TARGET_INVALID");
  for (const value of [target.entityType, target.entityId, ...[target.sectionId, target.blockId, target.itemId, target.unitId].filter(value => value !== undefined)]) {
    if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value) || forbiddenIds.has(value)) throw new Error("REVISION_TARGET_INVALID");
  }
  const nested = Boolean(target.sectionId || target.blockId || target.itemId || target.unitId);
  let content: unknown;
  if ("entities" in bundle) {
    if (nested || !Object.prototype.hasOwnProperty.call(ideaCollections, target.entityType)) throw new Error("REVISION_TARGET_INVALID");
    const key = ideaCollections[target.entityType as keyof typeof ideaCollections];
    content = unique(bundle.entities[key] as ReadonlyArray<{ id: string }>, target.entityId);
  } else if (target.entityType === "dependency") {
    if (nested) throw new Error("REVISION_TARGET_INVALID");
    content = unique(bundle.dependencies, target.entityId);
  } else {
    const product = unique(bundle.products, target.entityId);
    if (target.entityType !== "product" && target.entityType !== product.productType) throw new Error("REVISION_TARGET_INVALID");
    if (target.unitId) {
      if (target.sectionId || target.blockId || target.itemId || product.productType !== "diktat" || !product.units) throw new Error("REVISION_TARGET_INVALID");
      content = unique(product.units, target.unitId);
    } else if (target.itemId) {
      if (target.sectionId || target.blockId || product.productType !== "solution_collection") throw new Error("REVISION_TARGET_INVALID");
      content = unique(product.collection.items, target.itemId);
    } else if (target.sectionId || target.blockId) {
      if (product.productType !== "article" || !target.sectionId) throw new Error("REVISION_TARGET_INVALID");
      const section = unique(product.sections, target.sectionId);
      content = target.blockId ? unique(section.blocks, target.blockId) : section;
    } else content = product;
  }
  return { target: { ...target }, content };
}

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const boundedId = (value: unknown) => typeof value === "string" ? value.slice(0, 256) : undefined;

/** Bounded metadata only. The full impact remains available in the full context. */
export function summarizeRevisionImpact(value: unknown) {
  const impact = object(value);
  if (!impact) return null;
  const changedEntities: Array<Record<string, unknown>> = [["changedEntities", "changed"], ["addedEntities", "added"], ["removedEntities", "removed"]].flatMap(([key, change]) => Array.isArray(impact[key]) ? (impact[key] as unknown[]).map(entry => ({ ...object(entry), change })) : []);
  const changedUnits = Array.isArray(impact.changedUnits) ? impact.changedUnits : [];
  const blockers = Array.isArray(impact.blockers) ? impact.blockers : [];
  const limit = 50;
  return {
    changed: impact.changed === true,
    structureChanged: impact.structureChanged === true,
    provenanceChanged: impact.provenanceChanged === true,
    counts: {
      changedEntities: changedEntities.length, changedUnits: changedUnits.length, blockers: blockers.length,
      reviewInvalidations: Array.isArray(impact.reviewInvalidations) ? impact.reviewInvalidations.length : 0,
      evidenceInvalidations: Array.isArray(impact.evidenceInvalidations) ? impact.evidenceInvalidations.length : 0,
      dependents: Array.isArray(impact.dependentEntityIds) ? impact.dependentEntityIds.length : 0,
    },
    changedEntities: changedEntities.slice(0, limit).map(entry => ({ entityType: boundedId(entry.entityType), entityId: boundedId(entry.entityId), change: entry.change })),
    changedUnits: changedUnits.slice(0, limit).map(entry => { const item = object(entry); return { entityId: boundedId(item?.entityId), unitType: boundedId(item?.unitType), unitId: boundedId(item?.unitId), change: boundedId(item?.change) }; }),
    blockers: blockers.slice(0, limit).map(entry => { const item = object(entry); return { code: boundedId(item?.code), entityId: boundedId(item?.entityId) }; }),
    truncated: changedEntities.length > limit || changedUnits.length > limit || blockers.length > limit,
  };
}

/** Project at the MCP boundary; full responses retain their original shape by default. */
export function projectRevisionResponse(value: unknown, options: RevisionContextOptions = {}): unknown {
  if (options.responseMode !== "compact" && !options.target) return value;
  const context = object(value);
  if (!context) throw new Error("REVISION_CONTEXT_INVALID");
  if (context.ok === false) return value;
  const identity = Object.fromEntries(["kind", "importId", "revision", "version", "schemaVersion", "status", "scope", "stagingRunId", "execution", "nextActions"].filter(key => Object.prototype.hasOwnProperty.call(context, key)).map(key => [key, context[key]]));
  const lineage = object(context.draftLineage);
  const selection = object(context.selection);
  if (options.target) {
    const selectedTarget = object(selection?.target);
    if (!selectedTarget || !selection || !Object.prototype.hasOwnProperty.call(selection, "content") || ["entityType", "entityId", "sectionId", "blockId", "itemId", "unitId"].some(key => selectedTarget[key] !== options.target![key as keyof RevisionReadTarget])) throw new Error("REVISION_TARGET_NOT_FOUND");
  }
  return {
    ...identity,
    responseMode: options.responseMode ?? "full",
    contentScope: options.target ? "selected" : "none",
    evaluation: { review: "not_requested", readiness: "not_requested" },
    lineage: lineage ? Object.fromEntries(["rootImportId", "baseImportId", "baseRevision", "previousImportId", "previousRevision"].map(key => [key, lineage[key]])) : null,
    impact: summarizeRevisionImpact(lineage?.impact),
    ...(options.target ? { selection } : {}),
  };
}
