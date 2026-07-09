import { DiktatStructure } from "./diktat-generator";
import { generateContentWithFallback } from "./gemini";
import { USE_CASES } from "@/lib/ai-router";

function safeParseJson<T>(text: string): T | null {
  const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const raw = jsonMatch[0];
  try {
    return JSON.parse(raw) as T;
  } catch {
    let sanitized = "";
    let i = 0;
    const valid = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
    while (i < raw.length) {
      if (raw[i] === '\\') {
        const next = raw[i + 1] ?? '';
        if (valid.has(next)) { sanitized += raw[i]; sanitized += next; i += 2; }
        else { sanitized += '\\\\'; i++; }
      } else {
        sanitized += raw[i]; i++;
      }
    }
    try { return JSON.parse(sanitized) as T; } catch { return null; }
  }
}

export interface AuditIssue {
  severity: "ERROR" | "WARN";
  type: "FORMULA_INVERSION" | "MISSING_SYMBOL" | "CONCEPT_GAP" | "LOW_EXAM_VALUE" | "WORDING";
  description: string;
  conceptName?: string;
  koId?: string;
  proposedFix?: string;
}

export interface ProposedRevision {
  type: "SIMPLIFY" | "ADD_CONTEXT" | "IMPROVE_WORDING" | "REPRIORITIZE";
  target: { conceptName?: string; koId?: string };
  newContent: string;
  citedKoIds: string[];
}

export interface AuditResult {
  status: "PASS" | "WARN" | "FAIL";
  issues: AuditIssue[];
  proposedRevisions: ProposedRevision[];
}

type KO = {
  id: string;
  conceptName: string;
  type: string | null;
  title: string;
  content: string;
  metadata: any;
};

function detectFractionInversion(compiledLatex: string, sourceLatex: string): boolean {
  const extract = (latex: string): [string, string][] => {
    const pairs: [string, string][] = [];
    let m: RegExpExecArray | null;
    const re = /\\frac\{([^}]+)\}\{([^}]+)\}/g;
    while ((m = re.exec(latex)) !== null) {
      pairs.push([m[1].trim(), m[2].trim()]);
    }
    return pairs;
  };

  const compiledFractions = extract(compiledLatex);
  const sourceFractions = extract(sourceLatex);

  for (const [sNum, sDen] of sourceFractions) {
    if (compiledFractions.some(([cNum, cDen]) => cNum === sDen && cDen === sNum)) {
      return true;
    }
  }

  // Delta notation: Δy/Δx vs Δx/Δy (outside \frac)
  const extractDeltas = (latex: string): [string, string][] => {
    const pairs: [string, string][] = [];
    let m: RegExpExecArray | null;
    const re = /Delta\s*([a-zA-Z]+)\s*\/\s*Delta\s*([a-zA-Z]+)/g;
    const clean = latex.replace(/\\/g, "");
    while ((m = re.exec(clean)) !== null) {
      pairs.push([m[1], m[2]]);
    }
    return pairs;
  };

  const compiledDeltas = extractDeltas(compiledLatex);
  const sourceDeltas = extractDeltas(sourceLatex);

  for (const [sNum, sDen] of sourceDeltas) {
    if (compiledDeltas.some(([cNum, cDen]) => cNum === sDen && cDen === sNum)) {
      return true;
    }
  }

  return false;
}

function deterministicFormulaCheck(
  structure: DiktatStructure,
  sourceKOs: KO[]
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const koMap = new Map(sourceKOs.map(k => [k.id, k]));

  for (const entry of structure.sections.formulaHandbook) {
    const sourceKO = koMap.get(entry.koId);
    if (!sourceKO) continue;

    const sourceMeta = (sourceKO.metadata as any) || {};
    const sourceLatex: string = sourceMeta.latex || "";

    if (!sourceLatex || !entry.latex) continue;

    if (detectFractionInversion(entry.latex, sourceLatex)) {
      issues.push({
        severity: "ERROR",
        type: "FORMULA_INVERSION",
        description: `Formula "${entry.title}": numerator/denominator inverted. Source: ${sourceLatex} | Compiled: ${entry.latex}`,
        koId: entry.koId,
        proposedFix: sourceLatex,
      });
    }

    const sourceHasSqrt = sourceLatex.includes("\\sqrt");
    const compiledHasSqrt = entry.latex.includes("\\sqrt");
    if (sourceHasSqrt && !compiledHasSqrt) {
      issues.push({
        severity: "ERROR",
        type: "MISSING_SYMBOL",
        description: `Formula "${entry.title}": source has \\sqrt but compiled does not. Source: ${sourceLatex} | Compiled: ${entry.latex}`,
        koId: entry.koId,
        proposedFix: sourceLatex,
      });
    }
  }

  return issues;
}

async function aiAudit(
  structure: DiktatStructure,
  sourceKOs: KO[]
): Promise<{ issues: AuditIssue[]; proposedRevisions: ProposedRevision[] }> {
  const issues: AuditIssue[] = [];
  const proposedRevisions: ProposedRevision[] = [];

  // Sample first 3 chapters, first 3 concepts each for manageability
  const sampleChapters = structure.chapters.slice(0, 3);
  const sampleSummary = sampleChapters.map(ch => {
    const conceptStr = ch.concepts.slice(0, 3).map(c => {
      const conceptKOs = sourceKOs.filter(k => k.conceptName === c.conceptName);
      const highCount = conceptKOs.filter(k => (k as any).importance === "high").length;
      return `  Konsep: ${c.conceptName} (high_importance_kos=${highCount}, formulas=${c.formulas.length}, examples=${c.examples.length}, misconceptions=${c.misconceptions.length})`;
    }).join("\n");
    return `BAB: ${ch.title}\n${conceptStr}`;
  }).join("\n\n");

  const prompt = `Kamu adalah academic reviewer untuk diktat persiapan ujian mahasiswa.

Review struktur diktat berikut:
${sampleSummary}

Evaluasi:
1. Konsep penting yang kurang mendapat perhatian?
2. Konsep dengan nilai ujian rendah tapi ruang berlebihan?
3. Celah coverage materi?

Format output sebagai JSON:
{
  "overallStatus": "PASS",
  "issues": [
    { "type": "CONCEPT_GAP", "description": "...", "conceptName": "...", "proposedFix": "..." }
  ],
  "revisions": [
    { "type": "ADD_CONTEXT", "conceptName": "...", "newContent": "...", "citedKoIds": [] }
  ]
}

Berikan hanya JSON.`;

  try {
    const { response } = await generateContentWithFallback({ useCase: USE_CASES.DIKTAT_AUDIT, contents: prompt });
    const text: string = typeof response.text === "function" ? response.text() : response.text;
    const parsed = safeParseJson<any>(text);
    if (!parsed) return { issues, proposedRevisions };

    for (const issue of (parsed.issues || [])) {
      issues.push({
        severity: "WARN",
        type: issue.type || "CONCEPT_GAP",
        description: issue.description || "",
        conceptName: issue.conceptName,
        proposedFix: issue.proposedFix,
      });
    }

    for (const rev of (parsed.revisions || [])) {
      proposedRevisions.push({
        type: rev.type || "ADD_CONTEXT",
        target: { conceptName: rev.conceptName },
        newContent: rev.newContent || "",
        citedKoIds: rev.citedKoIds || [],
      });
    }
  } catch (err) {
    console.warn("[diktat-auditor] AI audit call failed:", err);
  }

  return { issues, proposedRevisions };
}

export async function auditDiktatStructure(
  structure: DiktatStructure,
  sourceKOs: KO[]
): Promise<AuditResult> {
  console.log("[diktat-auditor] auditDiktatStructure");

  const allIssues: AuditIssue[] = [];
  const allRevisions: ProposedRevision[] = [];

  // Deterministic checks (always run)
  allIssues.push(...deterministicFormulaCheck(structure, sourceKOs));

  // AI checks (gated)
  if (process.env.FEATURE_DIKTAT_AI === "1") {
    const { issues, proposedRevisions } = await aiAudit(structure, sourceKOs);
    allIssues.push(...issues);
    allRevisions.push(...proposedRevisions);
  }

  const hasErrors = allIssues.some(i => i.severity === "ERROR");
  const hasWarnings = allIssues.some(i => i.severity === "WARN");
  const status: AuditResult["status"] = hasErrors ? "FAIL" : hasWarnings ? "WARN" : "PASS";

  return { status, issues: allIssues, proposedRevisions: allRevisions };
}

export async function applyDiktatRevisions(
  structure: DiktatStructure,
  revisions: ProposedRevision[],
  sourceKOs: KO[]
): Promise<DiktatStructure> {
  const safeTypes = new Set<ProposedRevision["type"]>(["SIMPLIFY", "ADD_CONTEXT", "IMPROVE_WORDING"]);
  const safeRevisions = revisions.filter(r => safeTypes.has(r.type));

  if (safeRevisions.length === 0) return structure;

  const koMap = new Map(sourceKOs.map(k => [k.id, k]));
  let updated = { ...structure };

  for (const revision of safeRevisions) {
    if (!revision.target.conceptName || !revision.newContent) continue;

    // Require valid KO citation (safety: no uncited rewrites)
    if (revision.citedKoIds.length > 0 && !revision.citedKoIds.some(id => koMap.has(id))) {
      console.warn(`[diktat-auditor] Revision for "${revision.target.conceptName}" has no valid KO citations, skipping`);
      continue;
    }

    updated = {
      ...updated,
      chapters: updated.chapters.map(ch => ({
        ...ch,
        concepts: ch.concepts.map(concept => {
          if (concept.conceptName !== revision.target.conceptName) return concept;

          if (revision.type === "ADD_CONTEXT" && concept.definitions.length > 0) {
            return {
              ...concept,
              definitions: concept.definitions.map((d, i) =>
                i === 0 ? { ...d, content: d.content + "\n\n" + revision.newContent } : d
              ),
            };
          }

          if (revision.type === "IMPROVE_WORDING" && concept.definitions.length > 0) {
            return {
              ...concept,
              definitions: concept.definitions.map((d, i) =>
                i === 0 ? { ...d, content: revision.newContent } : d
              ),
            };
          }

          return concept;
        }),
      })),
    };
  }

  return updated;
}
