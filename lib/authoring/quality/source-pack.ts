import { createHash } from "node:crypto";
import type { ValidatedSourcePack } from "@/lib/authoring/source-pack";
import { finishQualityReport, qualityIssue, type AuthoringQualityIssue, type AuthoringQualityReport } from "./types";

const structuredVisualKinds = new Set(["3d-plot", "chart", "diagram", "geometry", "graph", "number-line", "plot"]);
const visualBaseFields = ["id", "source-unit", "kind", "title", "purpose", "elements", "instructional-meaning", "uncertainty"];
const visualStructuredFields = ["relationships", "labels", "reading-order"];
const uncertaintyTerms = /\b(approx(?:imate)?|buram|cropped|illegible|perkiraan|terpotong|tidak terbaca|uncertain|unknown)\b/i;
const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type SourcePackDocumentQuality = {
  id: string;
  title: string;
  original: { bytes: number; sha256: string; verified: boolean };
  markdown: { bytes: number; sha256: string };
  counts: {
    headings: number;
    formulas: number;
    tables: number;
    examples: number;
    applications: number;
    visualExplanations: number;
    questions: number;
    solutions: number;
  };
  formulas: { display: number; inline: number };
  visualKinds: Record<string, number>;
};

export type SourcePackQualityReport = AuthoringQualityReport<{
  documentCount: number;
  unitCount: number;
  sectionCount: number;
  originalVerification: "verified" | "not_provided";
  documents: SourcePackDocumentQuality[];
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decode(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replaceAll("\r\n", "\n");
  } catch {
    throw new Error(`SOURCE_PACK_INVALID_UTF8:${path}`);
  }
}

function parseJson(bytes: Uint8Array, path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(decode(bytes, path));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`SOURCE_PACK_INVALID_JSON:${path}`);
  }
}

function countFormulas(markdown: string): { display: number; inline: number; total: number } {
  let display = 0;
  let inline = 0;
  let cursor = 0;
  while (cursor < markdown.length) {
    if (markdown[cursor] !== "$" || markdown[cursor - 1] === "\\") {
      cursor += 1;
      continue;
    }
    const isDisplay = markdown[cursor + 1] === "$";
    const delimiter = isDisplay ? "$$" : "$";
    const start = cursor;
    cursor += delimiter.length;
    let end = -1;
    while (cursor < markdown.length) {
      if (!isDisplay && markdown[cursor] === "\n") break;
      if (markdown.startsWith(delimiter, cursor) && markdown[cursor - 1] !== "\\") {
        end = cursor;
        break;
      }
      cursor += 1;
    }
    if (end < 0) throw new Error(`SOURCE_PACK_FORMULA_DELIMITER_UNBALANCED:offset=${start}`);
    if (!markdown.slice(start + delimiter.length, end).trim()) throw new Error(`SOURCE_PACK_FORMULA_EMPTY:offset=${start}`);
    if (isDisplay) display += 1;
    else inline += 1;
    cursor = end + delimiter.length;
  }
  return { display, inline, total: display + inline };
}

function countTables(markdown: string): number {
  return [...markdown.matchAll(/^\|(?:\s*:?-+:?\s*\|)+\s*$/gm)].length + [...markdown.matchAll(/<table\b/gi)].length;
}

function countMarkers(markdown: string, kind: string): number {
  const expression = new RegExp(`^<!-- source-${kind}: [a-z0-9][a-z0-9._:-]* -->$`, "gm");
  const markers = [...markdown.matchAll(expression)].map((match) => match[0]);
  if (new Set(markers).size !== markers.length) throw new Error(`SOURCE_PACK_${kind.toUpperCase()}_MARKER_DUPLICATE`);
  return markers.length;
}

function parseVisualBlocks(markdown: string, documentId: string, expectedUnits: number): Array<{ id: string; kind: string }> {
  const lines = markdown.split("\n");
  const blocks: Array<{ id: string; kind: string }> = [];
  let activeUnit: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const unitMatch = lines[index].match(/^<!-- source-unit: (\d+) -->$/);
    if (unitMatch) activeUnit = Number(unitMatch[1]);
    if (lines[index] !== ":::visual-explanation") continue;
    const startLine = index + 1;
    const body: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== ":::") {
      if (lines[index] === ":::visual-explanation") throw new Error(`SOURCE_PACK_VISUAL_BLOCK_NESTED:${documentId}:line=${index + 1}`);
      body.push(lines[index]);
      index += 1;
    }
    if (index >= lines.length) throw new Error(`SOURCE_PACK_VISUAL_BLOCK_UNTERMINATED:${documentId}:line=${startLine}`);
    const fields = new Map<string, { scalar: string; items: string[] }>();
    for (let bodyIndex = 0; bodyIndex < body.length; bodyIndex += 1) {
      const fieldMatch = body[bodyIndex].match(/^([a-z][a-z-]*):(?:\s*(.*))?$/);
      if (!fieldMatch) continue;
      const [, key, scalar = ""] = fieldMatch;
      if (fields.has(key)) throw new Error(`SOURCE_PACK_VISUAL_FIELD_DUPLICATE:${documentId}:line=${startLine}:${key}`);
      const items: string[] = [];
      let itemIndex = bodyIndex + 1;
      while (itemIndex < body.length) {
        const itemMatch = body[itemIndex].match(/^\s{2}-\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1].trim());
        itemIndex += 1;
      }
      fields.set(key, { scalar: scalar.trim(), items });
    }
    for (const field of visualBaseFields) {
      const value = fields.get(field);
      if (!value || (!value.scalar && value.items.length === 0)) throw new Error(`SOURCE_PACK_VISUAL_FIELD_MISSING:${documentId}:line=${startLine}:${field}`);
    }
    const kind = fields.get("kind")!.scalar;
    if (structuredVisualKinds.has(kind)) {
      for (const field of visualStructuredFields) {
        if ((fields.get(field)?.items.length ?? 0) === 0) throw new Error(`SOURCE_PACK_VISUAL_FIELD_MISSING:${documentId}:line=${startLine}:${field}`);
      }
    }
    const declaredUnit = Number(fields.get("source-unit")!.scalar);
    if (!Number.isInteger(declaredUnit) || declaredUnit < 1 || declaredUnit > expectedUnits || declaredUnit !== activeUnit) {
      throw new Error(`SOURCE_PACK_VISUAL_UNIT_INVALID:${documentId}:line=${startLine}:declared=${fields.get("source-unit")!.scalar}:active=${activeUnit ?? "none"}`);
    }
    if (fields.get("uncertainty")!.scalar.toLowerCase() === "none" && uncertaintyTerms.test(body.join("\n"))) {
      throw new Error(`SOURCE_PACK_VISUAL_UNCERTAINTY_CONTRADICTION:${documentId}:line=${startLine}`);
    }
    blocks.push({ id: fields.get("id")!.scalar, kind });
  }
  const ids = blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) throw new Error(`SOURCE_PACK_VISUAL_ID_DUPLICATE:${documentId}`);
  return blocks;
}

function outputCount(coverage: Record<string, unknown>, key: string): number | undefined {
  const outputCounts = coverage.outputCounts;
  if (!outputCounts || typeof outputCounts !== "object" || Array.isArray(outputCounts)) return undefined;
  const value = (outputCounts as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

export function evaluateSourcePackQuality(
  sourcePack: ValidatedSourcePack,
  originals?: ReadonlyMap<string, Uint8Array>,
): SourcePackQualityReport {
  const issues: AuthoringQualityIssue[] = [];
  const documents: SourcePackDocumentQuality[] = [];
  const originalChecksums = new Map<string, string>();
  if (!originals) {
    issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_VERIFICATION_REQUIRED", "MCP requires the original binary for every Source Pack document so originalSha256 can be verified."));
  }

  for (const document of sourcePack.manifest.documents) {
    if (document.originalSha256 === emptySha256) issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_CHECKSUM_INVALID", `Document ${document.id} uses the SHA-256 of an empty file.`, "blocking", { entity: document.id }));
    const previous = originalChecksums.get(document.originalSha256);
    if (previous) issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_CHECKSUM_DUPLICATE", `Documents ${previous} and ${document.id} declare the same original checksum.`, "blocking", { entity: document.id }));
    originalChecksums.set(document.originalSha256, document.id);
    const original = originals?.get(document.id);
    if (originals && !original) issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_FILE_REQUIRED", `Original binary is missing for ${document.id}.`, "blocking", { entity: document.id }));
    if (original && sha256(original) !== document.originalSha256) {
      issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_CHECKSUM_MISMATCH", `Original binary checksum does not match ${document.id}.`, "blocking", { entity: document.id, expected: document.originalSha256, observed: sha256(original) }));
    }

    const markdownBytes = sourcePack.archive.files.get(document.markdownPath);
    const coverageBytes = sourcePack.archive.files.get(document.coveragePath);
    if (!markdownBytes || !coverageBytes) continue;
    const markdown = decode(markdownBytes, document.markdownPath);
    const coverage = parseJson(coverageBytes, document.coveragePath);
    const formulas = countFormulas(markdown);
    const visuals = parseVisualBlocks(markdown, document.id, document.expectedUnits);
    const actual = {
      headings: [...markdown.matchAll(/^#{1,6}\s+\S.*$/gm)].length,
      formulas: formulas.total,
      tables: countTables(markdown),
      examples: countMarkers(markdown, "example"),
      applications: countMarkers(markdown, "application"),
      visualExplanations: visuals.length,
      questions: countMarkers(markdown, "question"),
      solutions: countMarkers(markdown, "solution"),
    };
    for (const [key, value] of Object.entries(actual)) {
      const declared = outputCount(coverage, key);
      if (declared !== value) issues.push(qualityIssue("SOURCE_PACK_OUTPUT_COUNT_MISMATCH", `${document.id} ${key} count does not match the Markdown content.`, "blocking", { entity: document.id, path: document.coveragePath, expected: declared, observed: value }));
    }
    const originalChecksum = original ? sha256(original) : document.originalSha256;
    documents.push({
      id: document.id,
      title: document.title,
      original: { bytes: original?.byteLength ?? 0, sha256: originalChecksum, verified: Boolean(original) && originalChecksum === document.originalSha256 },
      markdown: { bytes: markdownBytes.byteLength, sha256: sha256(markdownBytes) },
      counts: actual,
      formulas: { display: formulas.display, inline: formulas.inline },
      visualKinds: Object.fromEntries([...new Set(visuals.map((block) => block.kind))].sort().map((kind) => [kind, visuals.filter((block) => block.kind === kind).length])),
    });
  }
  if (originals) {
    for (const suppliedId of originals.keys()) {
      if (!sourcePack.manifest.documents.some((document) => document.id === suppliedId)) issues.push(qualityIssue("SOURCE_PACK_ORIGINAL_DOCUMENT_UNKNOWN", `Original binary ${suppliedId} is not declared in the Source Pack.`, "blocking", { entity: suppliedId }));
    }
  }
  return finishQualityReport(issues, {
    documentCount: documents.length,
    unitCount: sourcePack.documents.reduce((total, document) => total + document.expectedUnits, 0),
    sectionCount: sourcePack.documents.reduce((total, document) => total + document.sections.length, 0),
    originalVerification: originals ? "verified" : "not_provided",
    documents,
  });
}
