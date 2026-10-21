import { DiktatStructure, FormulaHandbookEntry } from "./diktat-generator";
import katex from "@/lib/math/katex";

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

type SourceKO = {
  id: string;
  metadata: any;
  parameters?: any[];
};

function testLaTeXString(latex: string): string | null {
  if (!latex) return null;
  try {
    katex.renderToString(latex, { displayMode: true, throwOnError: true });
    return null;
  } catch (err: any) {
    return err?.message || err;
  }
}

function detectFractionInversion(compiled: string, source: string): boolean {
  const extract = (latex: string): [string, string][] => {
    const pairs: [string, string][] = [];
    let m: RegExpExecArray | null;
    const re = /\\frac\{([^}]+)\}\{([^}]+)\}/g;
    while ((m = re.exec(latex)) !== null) pairs.push([m[1].trim(), m[2].trim()]);
    return pairs;
  };
  const compiledF = extract(compiled);
  const sourceF = extract(source);
  for (const [sN, sD] of sourceF) {
    if (compiledF.some(([cN, cD]) => cN === sD && cD === sN)) return true;
  }
  // Delta notation
  const extractDeltas = (latex: string): [string, string][] => {
    const pairs: [string, string][] = [];
    let m: RegExpExecArray | null;
    const re = /Delta\s*([a-zA-Z]+)\s*\/\s*Delta\s*([a-zA-Z]+)/g;
    const clean = latex.replace(/\\/g, "");
    while ((m = re.exec(clean)) !== null) pairs.push([m[1], m[2]]);
    return pairs;
  };
  const compiledD = extractDeltas(compiled);
  const sourceD = extractDeltas(source);
  for (const [sN, sD] of sourceD) {
    if (compiledD.some(([cN, cD]) => cN === sD && cD === sN)) return true;
  }
  return false;
}

function validateSemanticFormulas(
  formulas: FormulaHandbookEntry[],
  sourceKOs: SourceKO[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const koMap = new Map(sourceKOs.map(k => [k.id, k]));

  for (const entry of formulas) {
    const sourceKO = koMap.get(entry.koId);
    if (!sourceKO) continue;

    const sourceMeta = (sourceKO.metadata as any) || {};
    const sourceLatex: string = sourceMeta.latex || "";

    if (!sourceLatex || !entry.latex) continue;

    if (detectFractionInversion(entry.latex, sourceLatex)) {
      errors.push(
        `[Formula Integrity - ${entry.title}]: numerator/denominator inverted vs source KO. Source: "${sourceLatex}" | Compiled: "${entry.latex}"`
      );
    }

    if (sourceLatex.includes("\\sqrt") && !entry.latex.includes("\\sqrt")) {
      errors.push(
        `[Formula Integrity - ${entry.title}]: \\sqrt present in source KO but missing in compiled formula.`
      );
    }

    const sourceParams: any[] = sourceMeta.parameters || [];
    if (sourceParams.length > 0 && entry.parameters.length === 0) {
      warnings.push(
        `[Formula Integrity - ${entry.title}]: source KO has ${sourceParams.length} parameters but compiled entry has none.`
      );
    }
  }

  return { errors, warnings };
}

export async function validateDiktat(
  diktat: DiktatStructure,
  options?: { sourceKOs?: SourceKO[] }
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const formulaIds = new Set<string>();
  const glossaryTerms = new Set<string>(
    diktat.sections.glossary.map(g => g.term.toLowerCase().trim())
  );

  // 1. Validate Formulas
  diktat.sections.formulaHandbook.forEach((entry: FormulaHandbookEntry) => {
    formulaIds.add(entry.koId);
    const pathPrefix = `[Formula Handbook - ${entry.title}]`;

    // KaTeX rendering verification (Warning level to prevent blocking PDF generation on minor LaTeX formatting issues)
    if (!entry.latex) {
      warnings.push(`${pathPrefix}: LaTeX display formula is missing or blank.`);
    } else {
      const katexErr = testLaTeXString(entry.latex);
      if (katexErr) {
        warnings.push(`${pathPrefix}: KaTeX compile error in "${entry.latex}": ${katexErr}`);
      }
    }

    // Symbol parameter lookup (Warning level to prevent blocking PDF generation on minor metadata mismatches)
    entry.parameters.forEach((param, idx) => {
      if (!param.symbol) {
        warnings.push(`${pathPrefix}: Parameter at index ${idx} is missing a variable symbol.`);
        return;
      }
      
      const symbolClean = param.symbol.replace(/\\/g, "").trim();
      const latexClean = entry.latex.replace(/\\/g, "");
      
      if (!latexClean.includes(symbolClean)) {
        warnings.push(
          `${pathPrefix}: Symbol '${param.symbol}' declared in parameters table but not found in LaTeX expression: '${entry.latex}'`
        );
      }

      if (!param.name) {
        warnings.push(`${pathPrefix}: Parameter '${param.symbol}' is missing a definition name.`);
      }
      if (!param.unit) {
        warnings.push(`${pathPrefix}: Parameter '${param.symbol}' is missing an SI unit representation.`);
      }
    });

    if (entry.parameters.length === 0) {
      warnings.push(`${pathPrefix}: No parameters declared for formula. Highly recommended for engineering references.`);
    }
  });

  // 1b. Semantic formula integrity (runs only when sourceKOs provided)
  if (options?.sourceKOs && options.sourceKOs.length > 0) {
    const semantic = validateSemanticFormulas(diktat.sections.formulaHandbook, options.sourceKOs);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);
  }

  // 2. Validate Glossary references
  const searchTexts: string[] = [];
  diktat.sections.conceptSummaries.forEach(s => searchTexts.push(s.definition));
  diktat.sections.engineeringNotes.forEach(n => searchTexts.push(n.insightMarkdown));
  diktat.sections.commonMistakes.forEach(m => {
    searchTexts.push(m.myth);
    searchTexts.push(m.correction);
    searchTexts.push(m.rationale);
  });

  searchTexts.forEach(text => {
    const matches = text.match(/\[\[(.*?)\]\]/g) || [];
    matches.forEach(match => {
      const term = match.slice(2, -2).toLowerCase().trim();
      if (!glossaryTerms.has(term)) {
        warnings.push(`Mentions glossary term '[[${match.slice(2, -2)}]]' but no corresponding glossary term is defined in this Diktat.`);
      }
    });
  });

  // 3. Warning: Check for missing formula reference links in engineering sheets
  diktat.sections.engineeringNotes.forEach(note => {
    // If engineering sheets references a specific formula block via attributes, verify existence
    const matches = note.insightMarkdown.match(/linkedFormulaBlockId="([^"]+)"/g) || [];
    matches.forEach(match => {
      const formulaId = match.split("=")[1].replace(/"/g, "").trim();
      if (!formulaIds.has(formulaId)) {
        // Downgraded to warning as requested
        warnings.push(`[Engineering Notes]: Linked formula reference ID "${formulaId}" does not exist in the handbook.`);
      }
    });
  });

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}
