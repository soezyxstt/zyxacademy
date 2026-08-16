import type { ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { finishQualityReport, qualityIssue, type AuthoringQualityReport } from "./types";

export type IdeaBundleQualityReport = AuthoringQualityReport<{
  sourceCount: number;
  sourceChunkCount: number;
  ideaCount: number;
  provenanceCount: number;
  relationCount: number;
  meaningfulSourceChunkCoveragePercent: number;
  provenanceCoveragePercent: number;
  sourceGroundedIdeaPercent: number;
  duplicateCandidateCount: number;
  formulaTraceWarningCount: number;
}>;

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 2));
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export function evaluateIdeaBundleQuality(bundle: ValidatedIdeaBundle): IdeaBundleQualityReport {
  const issues = [];
  const chunksById = new Map(bundle.entities.sourceChunks.map((chunk) => [chunk.id, chunk]));
  const provenanceByIdea = new Map<string, number>();
  const referencedChunkIds = new Set<string>();
  for (const provenance of bundle.entities.provenance) {
    provenanceByIdea.set(provenance.ideaId, (provenanceByIdea.get(provenance.ideaId) ?? 0) + 1);
    referencedChunkIds.add(provenance.sourceChunkId);
  }
  const meaningfulChunks = bundle.entities.sourceChunks.filter((chunk) => chunk.content.trim().length >= 20);
  const meaningfulReferenced = meaningfulChunks.filter((chunk) => referencedChunkIds.has(chunk.id)).length;
  const meaningfulCoveragePercent = meaningfulChunks.length === 0 ? 100 : (meaningfulReferenced / meaningfulChunks.length) * 100;
  if (meaningfulCoveragePercent < 100) {
    const missing = meaningfulChunks.filter((chunk) => !referencedChunkIds.has(chunk.id)).map((chunk) => chunk.id);
    issues.push(qualityIssue("IDEA_SOURCE_COVERAGE_INCOMPLETE", "Every meaningful source chunk must be represented by Idea provenance.", "blocking", { expected: meaningfulChunks.length, observed: meaningfulReferenced, path: missing.slice(0, 20).join(",") }));
  }

  const seenStatements = new Map<string, string>();
  let duplicateCandidateCount = 0;
  for (const idea of bundle.entities.ideas) {
    const normalized = normalizeText(idea.canonicalStatement);
    const previous = seenStatements.get(normalized);
    if (previous) {
      duplicateCandidateCount += 1;
      issues.push(qualityIssue("IDEA_SEMANTIC_DUPLICATE_CANDIDATE", `Idea ${idea.id} duplicates canonical statement ${previous}.`, "blocking", { entity: idea.id }));
    } else {
      seenStatements.set(normalized, idea.id);
    }
  }
  for (let index = 0; index < bundle.entities.ideas.length; index += 1) {
    for (let next = index + 1; next < bundle.entities.ideas.length; next += 1) {
      const left = bundle.entities.ideas[index];
      const right = bundle.entities.ideas[next];
      if (left.id !== right.id && tokenSimilarity(left.canonicalStatement, right.canonicalStatement) >= 0.92 && normalizeText(left.canonicalStatement) !== normalizeText(right.canonicalStatement)) {
        duplicateCandidateCount += 1;
        issues.push(qualityIssue("IDEA_SEMANTIC_NEAR_DUPLICATE_CANDIDATE", `Ideas ${left.id} and ${right.id} are near-duplicates and require consolidation.`, "blocking", { entity: `${left.id},${right.id}` }));
      }
    }
  }

  let formulaTraceWarningCount = 0;
  for (const idea of bundle.entities.ideas) {
    const provenance = bundle.entities.provenance.filter((item) => item.ideaId === idea.id);
    const sourceText = provenance.map((item) => chunksById.get(item.sourceChunkId)?.content ?? "").join("\n");
    if (idea.latex && !/[=$\\]|\d/.test(sourceText)) {
      formulaTraceWarningCount += 1;
      issues.push(qualityIssue("IDEA_FORMULA_TRACE_REQUIRES_REVIEW", `Idea ${idea.id} contains LaTeX but its source excerpts contain no detectable mathematical notation.`, "warning", { entity: idea.id }));
    }
    if ((provenanceByIdea.get(idea.id) ?? 0) === 0) {
      issues.push(qualityIssue("IDEA_PROVENANCE_MISSING", `Idea ${idea.id} has no provenance record.`, "blocking", { entity: idea.id }));
    }
  }

  const sourceGroundedCount = bundle.entities.ideas.filter((idea) => idea.sourcePolicy === "source_grounded").length;
  const provenanceCoveragePercent = bundle.entities.ideas.length === 0 ? 100 : (bundle.entities.ideas.filter((idea) => (provenanceByIdea.get(idea.id) ?? 0) > 0).length / bundle.entities.ideas.length) * 100;
  return finishQualityReport(issues, {
    sourceCount: bundle.entities.sourceMaterials.length,
    sourceChunkCount: bundle.entities.sourceChunks.length,
    ideaCount: bundle.entities.ideas.length,
    provenanceCount: bundle.entities.provenance.length,
    relationCount: bundle.entities.relations.length,
    meaningfulSourceChunkCoveragePercent: meaningfulCoveragePercent,
    provenanceCoveragePercent,
    sourceGroundedIdeaPercent: bundle.entities.ideas.length === 0 ? 100 : (sourceGroundedCount / bundle.entities.ideas.length) * 100,
    duplicateCandidateCount,
    formulaTraceWarningCount,
  });
}
