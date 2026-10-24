import { FlowchartNodeKindSchema, type FlowchartNodeKind } from "./flowchart";
import { 
  WebsiteMaterialAST, 
  ASTBlock, 
  validateAST, 
  CompilerDiagnostic, 
  CompilerStats, 
  CompilerResult 
} from "./ast-validator";

// ==========================================
// STRING ATTRIBUTE PARSER UTILITY
// ==========================================

function startsMarkdownTable(lines: string[], index: number): boolean {
  const headers = splitMarkdownTableRow(lines[index]);
  const separator = splitMarkdownTableRow(lines[index + 1] ?? "");
  return separator.length > 0 && separator.length === headers.length &&
    separator.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isEndingWithUnescapedPipe(str: string): boolean {
  if (!str.endsWith("|")) return false;
  let backslashCount = 0;
  for (let idx = str.length - 2; idx >= 0; idx--) {
    if (str[idx] === "\\") {
      backslashCount++;
    } else {
      break;
    }
  }
  return backslashCount % 2 === 0;
}

/**
 * Splits a markdown table row into trimmed cell strings while preserving
 * pipes inside inline math ($...$), display math ($$...$$, \(...\), \[...\]),
 * inline code backticks (`...`), and escaped pipes (\|).
 *
 * Maintains existing outer-pipe trimming behavior.
 */
export function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const rawCells: string[] = [];
  let current = "";
  let i = 0;
  const len = line.length;

  while (i < len) {
    const ch = line[i];

    // 1. Escaped character at top level (e.g. \|, \$, \`, \\, etc.)
    // Note: \( and \[ start LaTeX math modes, handled below
    if (ch === "\\") {
      if (i + 1 < len) {
        const next = line[i + 1];
        if (next === "(") {
          // Enter \( ... \) math mode
          current += "\\(";
          i += 2;
          while (i < len) {
            if (line[i] === "\\" && i + 1 < len) {
              if (line[i + 1] === ")") {
                current += "\\)";
                i += 2;
                break;
              } else {
                current += line[i] + line[i + 1];
                i += 2;
                continue;
              }
            } else {
              current += line[i];
              i++;
            }
          }
          continue;
        } else if (next === "[") {
          // Enter \[ ... \] math mode
          current += "\\[";
          i += 2;
          while (i < len) {
            if (line[i] === "\\" && i + 1 < len) {
              if (line[i + 1] === "]") {
                current += "\\]";
                i += 2;
                break;
              } else {
                current += line[i] + line[i + 1];
                i += 2;
                continue;
              }
            } else {
              current += line[i];
              i++;
            }
          }
          continue;
        } else {
          // Escaped character like \|, \\, \$, etc.
          current += line[i] + line[i + 1];
          i += 2;
          continue;
        }
      } else {
        // Trailing backslash
        current += ch;
        i++;
        continue;
      }
    }

    // 2. Backtick code span `...` or ``...``
    if (ch === "`") {
      let tickCount = 0;
      while (i + tickCount < len && line[i + tickCount] === "`") {
        tickCount++;
      }
      const tickStr = "`".repeat(tickCount);
      current += tickStr;
      i += tickCount;

      // Find matching tickStr
      while (i < len) {
        if (line[i] === "`") {
          let closeCount = 0;
          while (i + closeCount < len && line[i + closeCount] === "`") {
            closeCount++;
          }
          if (closeCount === tickCount) {
            current += tickStr;
            i += closeCount;
            break;
          } else {
            current += "`".repeat(closeCount);
            i += closeCount;
          }
        } else {
          current += line[i];
          i++;
        }
      }
      continue;
    }

    // 3. Math delimiters $$ ... $$ or $ ... $
    if (ch === "$") {
      if (i + 1 < len && line[i + 1] === "$") {
        // $$ display math
        current += "$$";
        i += 2;
        while (i < len) {
          if (line[i] === "\\") {
            if (i + 1 < len) {
              current += line[i] + line[i + 1];
              i += 2;
            } else {
              current += line[i];
              i++;
            }
          } else if (line[i] === "$" && i + 1 < len && line[i + 1] === "$") {
            current += "$$";
            i += 2;
            break;
          } else {
            current += line[i];
            i++;
          }
        }
        continue;
      } else {
        // $ inline math
        current += "$";
        i++;
        while (i < len) {
          if (line[i] === "\\") {
            if (i + 1 < len) {
              current += line[i] + line[i + 1];
              i += 2;
            } else {
              current += line[i];
              i++;
            }
          } else if (line[i] === "$") {
            current += "$";
            i++;
            break;
          } else {
            current += line[i];
            i++;
          }
        }
        continue;
      }
    }

    // 4. Pipe delimiter |
    if (ch === "|") {
      rawCells.push(current);
      current = "";
      i++;
      continue;
    }

    // Normal character
    current += ch;
    i++;
  }

  rawCells.push(current);

  const cells = rawCells.map(c => c.trim());
  const trimmedLine = line.trim();
  if (trimmedLine.startsWith("|") && cells.length > 0) {
    cells.shift();
  }
  if (cells.length > 0 && isEndingWithUnescapedPipe(trimmedLine)) {
    cells.pop();
  }

  return cells;
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!attrStr) return attrs;

  // Matches key="value" or key='value' or key=value
  const regex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  while ((match = regex.exec(attrStr)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    attrs[key] = value;
  }
  return attrs;
}

function parseYamlScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;

  const number = Number(trimmed);
  if (!Number.isNaN(number)) return number;

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) => parseYamlScalar(item));
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return Object.fromEntries(
        trimmed
          .slice(1, -1)
          .split(",")
          .map((item) => item.split(/:(.*)/s).slice(0, 2))
          .filter(([key, entry]) => key?.trim() && entry?.trim())
          .map(([key, entry]) => [key.trim().replace(/^['"]|['"]$/g, ""), parseYamlScalar(entry)]),
      );
    }
  }

  return trimmed.replace(/^(['"])(.*)\1$/, "$2");
}

function parseYamlLike(lines: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    if (indent >= 2 && currentKey) {
      if (trimmed.startsWith("-")) {
        const val = trimmed.slice(1).trim();
        const parsedVal = parseYamlScalar(val);

        if (!result[currentKey] || !Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(parsedVal);
      } else {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const val = trimmed.slice(colonIdx + 1).trim();
          const parsedVal = parseYamlScalar(val);

          if (typeof result[currentKey] !== "object" || Array.isArray(result[currentKey])) {
            result[currentKey] = {};
          }
          result[currentKey][key] = parsedVal;
        }
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      currentKey = key;

      if (val === "") {
        result[key] = {};
      } else {
        result[key] = parseYamlScalar(val);
      }
    }
  }

  return result;
}

// ==========================================
// BLOCK PARSER ROUTINE
// ==========================================

function parseBlockNode(
  type: string,
  attrStr: string,
  lines: string[],
  id: string
): ASTBlock | null {
  const attrs = parseAttributes(attrStr);
  const blockId = id;

  switch (type) {
    case "media": {
      return {
        id: blockId,
        type: "media",
        globalOrderIndex: 0,
        metadata: {
          src: attrs.src || "",
          caption: attrs.caption || "",
          sourceLabel: attrs.sourceLabel || "",
          sourceUrl: attrs.sourceUrl || "",
        },
        content: {},
      };
    }

    case "learning_objective": {
      const objectives: string[] = [];
      lines.forEach(l => {
        const m = l.trim().match(/^[-*+]\s+(.*)/);
        if (m) {
          objectives.push(m[1].trim());
        }
      });
      return {
        id: blockId,
        type: "learning_objective",
        globalOrderIndex: 0,
        metadata: {
          bloomLevel: (attrs.bloomLevel as any) || "remember",
        },
        content: { objectives },
      };
    }

    case "definition":
    case "concept": {
      return {
        id: blockId,
        type: "concept",
        globalOrderIndex: 0,
        metadata: {
          koId: attrs.ref || attrs.koId || "",
        },
        content: {
          title: attrs.title || (type === "definition" ? "Definition" : "Concept Overview"),
          bodyMarkdown: lines.join("\n").trim(),
        },
      };
    }

    case "formula": {
      const yamlLines: string[] = [];
      const contentLines: string[] = [];
      let inYaml = true;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (inYaml && (trimmed.includes(":") || trimmed.startsWith("-") || !trimmed)) {
          yamlLines.push(line);
        } else {
          inYaml = false;
          contentLines.push(line);
        }
      }
      
      const parsedYaml = parseYamlLike(yamlLines);
      const blockText = lines.join("\n");
      // Collect ALL $$...$$ equations in the block (formula blocks may contain multiple equations)
      const allLatexMatches = [...blockText.matchAll(/\$\$\s*([\s\S]*?)\s*\$\$/g)];
      const latex = allLatexMatches.length > 0
        ? allLatexMatches.map(m => m[1].trim()).join(" ")
        : "";

      const symbols: any[] = [];

      // Helper: wrap a bare LaTeX token in $...$ if it isn't already.
      // Triggers on: backslash commands (\delta), superscript (^), subscript (_).
      const wrapLatex = (raw: string): string => {
        const t = raw.trim();
        if (!t) return t;
        // Already $-wrapped → keep as-is
        if (t.startsWith("$") && t.endsWith("$")) return t;
        // Needs wrapping if it contains LaTeX-specific characters
        if (t.includes("\\") || t.includes("^") || t.includes("_")) return `$${t}$`;
        return t;
      };

      const tableLines = lines.filter(l => l.includes("|"));
      tableLines.forEach(l => {
        const parts = splitMarkdownTableRow(l);
        if (parts.length >= 2) {
          const symbolRaw = parts[0];
          const unit = parts.length > 2 ? parts[1] : undefined;
          const definition = parts.length > 2 ? parts[2] : parts[1];

          // Skip header row (contains "Simbol", "Symbol", "Parameter", "Variabel", etc.) or separator row (:--- / ---)
          const symLower = symbolRaw.toLowerCase();
          if (
            symLower === "simbol" ||
            symLower === "symbol" ||
            symLower === "parameter" ||
            symLower === "variabel" ||
            symLower === "variable" ||
            symLower === "keterangan" ||
            /^:?-+$/.test(symbolRaw)
          ) {
            return;
          }
          // Skip separator rows in any column (e.g. ":---")
          if (/^:?-+$/.test(definition || "")) {
            return;
          }

          symbols.push({
            symbol: wrapLatex(symbolRaw),
            definition: wrapLatex(definition),
            unit: unit ? wrapLatex(unit) : undefined,
          });
        }
      });

      // Only extract interpretation when explicitly marked in the source.
      // The old else-branch fallback incorrectly captured LaTeX formula body lines.
      let interpretation = "";
      const interpIdx = blockText.indexOf("Interpretasi:");
      const explIdx = blockText.indexOf("Explanation:");
      const startIdx = interpIdx !== -1 ? interpIdx + "Interpretasi:".length : (explIdx !== -1 ? explIdx + "Explanation:".length : -1);

      if (startIdx !== -1) {
        const remainingText = blockText.slice(startIdx);
        const interpLines = remainingText.split(/\r?\n/).filter(l => !l.includes("|") && !l.includes("$$"));
        interpretation = interpLines.join("\n").trim();
      }

      return {
        id: blockId,
        type: "formula",
        globalOrderIndex: 0,
        metadata: {
          koId: attrs.ref || attrs.koId || undefined,
        },
        content: {
          title: attrs.title || parsedYaml.title || undefined,
          latex,
          interpretation: interpretation || undefined,
          derivationMarkdown: interpretation || undefined,
          symbols,
          parameters: symbols,
          assumptions: parsedYaml.assumptions || [],
          usage: parsedYaml.usage || [],
        },
      };
    }

    case "formula_reference": {
      const blockText = lines.join("\n");
      const latexMatch = blockText.match(/\$\$\s*([\s\S]*?)\s*\$\$/);
      const latex = latexMatch ? latexMatch[1].trim() : "";

      return {
        id: blockId,
        type: "formula_reference",
        globalOrderIndex: 0,
        metadata: {
          linkedFormulaBlockId: attrs.linkedFormulaBlockId || "",
        },
        content: {
          latex,
          label: attrs.label || "Formula Reference",
        },
      };
    }

    case "engineering_insight": {
      return {
        id: blockId,
        type: "engineering_insight",
        globalOrderIndex: 0,
        metadata: {
          discipline: (attrs.discipline as any) || "general",
        },
        content: {
          title: attrs.title || "Engineering Insight",
          applicationMarkdown: lines.join("\n").trim(),
        },
      };
    }

    case "example": {
      const blockText = lines.join("\n");
      let problemStatement = "";
      const solutionSteps: any[] = [];

      let probIndex = -1;
      let probLength = 0;
      const probMatch = blockText.match(/^(?:#{1,6}\s*Problem\s*(?:\r?\n|$)|(?:\*\*Problem\*\*|Problem):?\s*)/im);
      if (probMatch && probMatch.index !== undefined) {
        probIndex = probMatch.index;
        probLength = probMatch[0].length;
      }

      let solIndex = -1;
      let solLength = 0;
      const solMatch = blockText.match(/^(?:#{1,6}\s*Solution\s*(?:\r?\n|$)|(?:\*\*Solution\*\*|Solution):?\s*)/im);
      if (solMatch && solMatch.index !== undefined) {
        solIndex = solMatch.index;
        solLength = solMatch[0].length;
      }

      if (probIndex !== -1) {
        const endProb = solIndex !== -1 ? solIndex : blockText.length;
        problemStatement = blockText.slice(probIndex + probLength, endProb).trim();
      } else {
        if (solIndex !== -1) {
          problemStatement = blockText.slice(0, solIndex).trim();
        } else {
          problemStatement = blockText.trim();
        }
      }

      const solText = solIndex !== -1 ? blockText.slice(solIndex + solLength) : "";

      if (solIndex !== -1) {
        const solLines = solText.split(/\r?\n/);
        
        let stepIdx = 1;
        solLines.forEach(l => {
          const match = l.trim().match(/^(\d+)\.\s+(.*)/);
          if (match) {
            const stepText = match[2].trim();
            let label = `Step ${stepIdx}`;
            let explanationMarkdown = stepText;
            const labelMatch = stepText.match(/^\*\*(.*?)\*\*:\s*(.*)/);
            if (labelMatch) {
              label = labelMatch[1].trim();
              explanationMarkdown = labelMatch[2].trim();
            }

            const latexMatch = explanationMarkdown.match(/\$\$(.*?)\$\$/) || explanationMarkdown.match(/\$(.*?)\$/);
            const mathProof = latexMatch ? latexMatch[1].trim() : undefined;

            solutionSteps.push({
              stepIndex: stepIdx++,
              label,
              explanationMarkdown,
              mathProof,
            });
          }
        });
      }

      // Backward compatibility fallback for narrative solution texts (no numbered steps)
      if (solIndex !== -1 && solutionSteps.length === 0 && solText.trim() !== "") {
        solutionSteps.push({
          stepIndex: 1,
          label: "Solusi",
          explanationMarkdown: solText.trim(),
        });
      }

      return {
        id: blockId,
        type: "example",
        globalOrderIndex: 0,
        metadata: {
          difficulty: (attrs.difficulty as any) || "medium",
          koId: attrs.ref || attrs.koId,
        },
        content: {
          problemStatement,
          solutionSteps,
        },
      };
    }

    case "misconception": {
      const blockText = lines.join("\n");
      let myth = "";
      let correctionMarkdown = "";
      let physicalRationaleMarkdown = "";

      let miscIndex = -1;
      let miscLength = 0;
      const miscMatch = blockText.match(/^(?:#{1,6}\s*Misconception\s*(?:\r?\n|$)|(?:\*\*Misconception\*\*|Misconception):?\s*)/im);
      if (miscMatch && miscMatch.index !== undefined) {
        miscIndex = miscMatch.index;
        miscLength = miscMatch[0].length;
      }

      let corrIndex = -1;
      let corrLength = 0;
      const corrMatch = blockText.match(/^(?:#{1,6}\s*Correction\s*(?:\r?\n|$)|(?:\*\*Correction\*\*|Correction):?\s*)/im);
      if (corrMatch && corrMatch.index !== undefined) {
        corrIndex = corrMatch.index;
        corrLength = corrMatch[0].length;
      }

      if (miscIndex !== -1) {
        const endMisc = corrIndex !== -1 ? corrIndex : blockText.length;
        myth = blockText.slice(miscIndex + miscLength, endMisc).trim();
      } else {
        if (corrIndex !== -1) {
          myth = blockText.slice(0, corrIndex).trim();
        } else {
          myth = blockText.trim();
        }
      }

      if (corrIndex !== -1) {
        const corrText = blockText.slice(corrIndex + corrLength).trim();
        const paragraphs = corrText.split(/\n\s*\n/);
        correctionMarkdown = paragraphs[0].trim();
        if (paragraphs.length > 1) {
          physicalRationaleMarkdown = paragraphs.slice(1).join("\n\n").trim();
        } else {
          physicalRationaleMarkdown = correctionMarkdown;
        }
      }

      return {
        id: blockId,
        type: "misconception",
        globalOrderIndex: 0,
        metadata: {
          koId: attrs.ref || attrs.koId || "",
        },
        content: {
          myth,
          correctionMarkdown,
          physicalRationaleMarkdown,
        },
      };
    }

    case "exercise": {
      const questionMarkdown = lines.join("\n").trim();
      return {
        id: blockId,
        type: "exercise",
        globalOrderIndex: 0,
        metadata: {
          questionId: attrs.questionId || "",
        },
        content: {
          questionMarkdown,
          questionType: "short_essay",
        },
      };
    }

    case "summary": {
      const bullets: string[] = [];
      lines.forEach(l => {
        const m = l.trim().match(/^[-*+]\s+(.*)/);
        if (m) {
          bullets.push(m[1].trim());
        }
      });
      return {
        id: blockId,
        type: "summary",
        globalOrderIndex: 0,
        metadata: {},
        content: { bullets },
      };
    }

    case "warning":
    case "note": {
      return {
        id: blockId,
        type: type as "warning" | "note",
        globalOrderIndex: 0,
        metadata: {
          collapsible: attrs.collapsible === "true",
        },
        content: {
          title: attrs.title || undefined,
          messageMarkdown: lines.join("\n").trim(),
        },
      };
    }

    case "glossary_term": {
      return {
        id: blockId,
        type: "glossary_term",
        globalOrderIndex: 0,
        metadata: {},
        content: {
          term: attrs.term || "",
          definition: lines.join("\n").trim(),
        },
      };
    }

    case "chart": {
      const parsed = parseYamlLike(lines);
      return {
        id: blockId,
        type: "visual",
        globalOrderIndex: 0,
        visualType: "chart",
        version: 1,
        metadata: {} as Record<string, unknown>,
        title: attrs.title || parsed.title || undefined,
        caption: attrs.caption || parsed.caption || undefined,
        data: {
          chartType: parsed.chartType || "line",
          xLabel: parsed.xLabel || undefined,
          yLabel: parsed.yLabel || undefined,
          data: parsed.data || [],
        },
      };
    }

    case "graph": {
      const parsed = parseYamlLike(lines);
      const unparsedLines = lines.filter(l => {
        const trimmed = l.trim();
        return trimmed && trimmed.indexOf(":") === -1 && !trimmed.startsWith("-");
      });
      
      let domain = { min: -10, max: 10 };
      if (parsed.domain && typeof parsed.domain === "object") {
        domain = {
          min: typeof parsed.domain.min === "number" ? parsed.domain.min : -10,
          max: typeof parsed.domain.max === "number" ? parsed.domain.max : 10,
        };
      } else if (parsed.domain && Array.isArray(parsed.domain)) {
        domain = {
          min: typeof parsed.domain[0] === "number" ? parsed.domain[0] : -10,
          max: typeof parsed.domain[1] === "number" ? parsed.domain[1] : 10,
        };
      }
      
      let functions = parsed.functions
        || parsed.function
        || parsed.equations
        || parsed.formula
        || (parsed.equation ? [parsed.equation] : []);
      if (typeof functions === "string") functions = [functions];
      if ((!functions || functions.length === 0) && unparsedLines.length > 0) {
        functions = unparsedLines.map(l => l.trim());
      }

      return {
        id: blockId,
        type: "visual",
        globalOrderIndex: 0,
        visualType: "graph",
        version: 1,
        metadata: {} as Record<string, unknown>,
        title: attrs.title || parsed.title || undefined,
        caption: attrs.caption || parsed.caption || undefined,
        data: {
          functions,
          domain,
          samples: typeof parsed.samples === "number" ? parsed.samples : 200,
        },
      };
    }

    case "flowchart":
    case "diagram": {
      const yamlLines: string[] = [];
      const edgeLines: string[] = [];
      lines.forEach(l => {
        const trimmed = l.trim();
        if (trimmed.includes("-->")) {
          edgeLines.push(trimmed);
        } else if (trimmed) {
          yamlLines.push(l);
        }
      });

      const parsed = parseYamlLike(yamlLines);
      const edges: any[] = [];
      const nodeNames = new Set<string>();
      const nodeKinds = new Map<string, FlowchartNodeKind>();
      const readNode = (raw: string) => {
        const suffix = raw.match(/\s+\[(start|end|input|output|process|decision)\]$/);
        const name = (suffix ? raw.slice(0, suffix.index) : raw).trim().replace(/^"(.*)"$/, "$1");
        if (suffix) nodeKinds.set(name, FlowchartNodeKindSchema.parse(suffix[1]));
        return name;
      };

      const cleanNodeName = (name: string): { label: string; stepNumber?: number } => {
        const match = name.match(/^(?:Langkah|Step|Phase|Stage)\s*(\d+)\s*[:.-]\s*(.+)$/i);
        if (match) {
          return {
            label: match[2].trim(),
            stepNumber: parseInt(match[1], 10),
          };
        }
        return { label: name };
      };

      const edgeRegex = /^(.+?)\s*(?:-->|--\s*(.*?)\s*-->|-->\s*\|(.*?)\|)\s*(.+)$/;
      edgeLines.forEach(line => {
        const match = line.match(edgeRegex);
        if (match) {
          const rawSource = readNode(match[1].trim());
          const targetWithLabel = match[4].trim();
          const trailingLabel = targetWithLabel.match(/\s+:\s+"([^"]*)"$/);
          const label = (match[2] || match[3] || trailingLabel?.[1] || "").trim();
          const rawTarget = readNode(trailingLabel ? targetWithLabel.slice(0, trailingLabel.index).trim() : targetWithLabel);

          const sourceId = rawSource.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
          const targetId = rawTarget.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

          nodeNames.add(rawSource);
          nodeNames.add(rawTarget);

          edges.push({
            source: sourceId,
            target: targetId,
            label: label || undefined,
          });
        }
      });

      const nodes = Array.from(nodeNames).map(rawName => {
        const id = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        const { label, stepNumber } = cleanNodeName(rawName);
        return {
          id,
          label,
          stepNumber,
          ...(nodeKinds.has(rawName) ? { kind: nodeKinds.get(rawName) } : {}),
        };
      });

      return {
        id: blockId,
        type: "visual",
        globalOrderIndex: 0,
        visualType: type === "flowchart" ? "flowchart" : "diagram",
        version: 1,
        metadata: {} as Record<string, unknown>,
        title: attrs.title || parsed.title || undefined,
        caption: attrs.caption || parsed.caption || undefined,
        data: {
          edges,
          nodes,
          diagramType: parsed.type || undefined,
        },
      };
    }

    default:
      console.warn(`Unknown block type encountered: ${type}`);
      return null;
  }
}

// ==========================================
// CORE COMPILER SERVICE
// ==========================================

export function parseCanonicalMarkdown(markdown: string): ASTBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ASTBlock[] = [];
  let globalIndex = 0;

  let currentBlockType: string | null = null;
  let currentBlockAttrStr = "";
  let currentBlockLines: string[] = [];
  let currentBlockId: string | null = null;

  const flushPresenterBlock = (type: string, contentLines: string[]) => {
    const contentText = contentLines.join("\n").trim();
    if (!contentText) return;

    const id = `md-${globalIndex}-${type}`;
    let block: ASTBlock | null = null;

    if (type === "h") {
      const match = contentText.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        block = {
          id,
          type: "h",
          globalOrderIndex: globalIndex++,
          level: match[1].length,
          content: match[2].trim(),
        };
      }
    } else if (type === "blockquote") {
      const cleanContent = contentLines.map(l => l.replace(/^>\s?/, "")).join("\n").trim();
      block = {
        id,
        type: "blockquote",
        globalOrderIndex: globalIndex++,
        content: cleanContent,
      };
    } else if (type === "code") {
      const langMatch = contentLines[0].match(/^```(\w*)/);
      const language = langMatch ? langMatch[1] : undefined;
      const hasClosing = contentLines.length > 1 && contentLines[contentLines.length - 1].trim().startsWith("```");
      const codeLines = hasClosing ? contentLines.slice(1, -1) : contentLines.slice(1);
      block = {
        id,
        type: "code",
        globalOrderIndex: globalIndex++,
        content: codeLines.join("\n"),
        language,
      };
    } else if (type === "table") {
      const headers = splitMarkdownTableRow(contentLines[0]);
      
      const rows: string[][] = [];
      contentLines.slice(2).forEach(rowLine => {
        const cells = splitMarkdownTableRow(rowLine);
        if (cells.length > 0) {
          rows.push(cells);
        }
      });

      block = {
        id,
        type: "table",
        globalOrderIndex: globalIndex++,
        headers,
        rows,
      };
    } else if (type === "list") {
      const items = contentLines.map(l => {
        const orderedMatch = l.trim().match(/^\d+\.\s+(.+)$/);
        const unorderedMatch = l.trim().match(/^[-*+]\s+(.+)$/);
        return {
          text: orderedMatch ? orderedMatch[1].trim() : (unorderedMatch ? unorderedMatch[1].trim() : l.trim()),
          ordered: !!orderedMatch,
        };
      });
      block = {
        id,
        type: "list",
        globalOrderIndex: globalIndex++,
        items,
      };
    } else if (type === "hr") {
      block = {
        id,
        type: "hr",
        globalOrderIndex: globalIndex++,
      };
    } else if (type === "p") {
      block = {
        id,
        type: "p",
        globalOrderIndex: globalIndex++,
        content: contentText,
      };
    }

    if (block) {
      blocks.push(block);
    }
  };

  let presenterLines: string[] = [];
  let presenterType: "p" | "h" | "code" | "list" | "blockquote" | "table" | "hr" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith(":::")) {
      if (currentBlockType !== null) {
        // Closing a canonical block
        const block = parseBlockNode(
          currentBlockType,
          currentBlockAttrStr,
          currentBlockLines,
          currentBlockId || `block-${i}`
        );
        if (block) {
          block.globalOrderIndex = globalIndex++;
          blocks.push(block);
        }
        currentBlockType = null;
        currentBlockAttrStr = "";
        currentBlockLines = [];
        currentBlockId = null;
      } else {
        // Open a canonical block; flush any pending presenter lines first
        if (presenterType && presenterLines.length > 0) {
          flushPresenterBlock(presenterType, presenterLines);
          presenterLines = [];
          presenterType = null;
        }

        const isSingleLineBlock = trimmed.endsWith(":::") && trimmed.length > 3;
        const lineToParse = isSingleLineBlock ? trimmed.slice(0, -3).trim() : trimmed;

        const match = lineToParse.match(/^:::(\w+)/);
        if (match) {
          const blockType = match[1];
          const rest = lineToParse.slice(3 + blockType.length).trim();
          let blockAttrStr = "";
          if (rest.startsWith("{") && rest.endsWith("}")) {
            blockAttrStr = rest.slice(1, -1).trim();
          } else {
            blockAttrStr = rest;
          }

          const attrs = parseAttributes(blockAttrStr);
          const blockId = attrs.id || attrs.ref || attrs.koId || `block-${i}-${blockType}`;

          if (isSingleLineBlock) {
            const block = parseBlockNode(
              blockType,
              blockAttrStr,
              [],
              blockId
            );
            if (block) {
              block.globalOrderIndex = globalIndex++;
              blocks.push(block);
            }
          } else {
            currentBlockType = blockType;
            currentBlockAttrStr = blockAttrStr;
            currentBlockLines = [];
            currentBlockId = blockId;
          }
        }
      }
      continue;
    }

    if (currentBlockType !== null) {
      currentBlockLines.push(line);
      continue;
    }

    // Lists continuation parsing
    const listPattern = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
    if (listPattern.test(line)) {
      if (presenterType && presenterLines.length > 0) {
        flushPresenterBlock(presenterType, presenterLines);
        presenterLines = [];
        presenterType = null;
      }
      
      const items: { text: string; ordered: boolean }[] = [];
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentTrimmed = currentLine.trim();

        // Check if the current line starts a new list item
        const listMatch = currentLine.match(listPattern);
        if (listMatch) {
          const marker = listMatch[2];
          const isOrdered = /^\d/.test(marker);
          items.push({
            text: listMatch[3].trim(),
            ordered: isOrdered,
          });
          i++;
          continue;
        }

        // Check for list termination
        if (
          currentTrimmed.startsWith("```") ||
          currentTrimmed.startsWith(":::") ||
          currentTrimmed === "---" || currentTrimmed === "***" || currentTrimmed === "___" ||
          /^(#{1,6})\s+/.test(currentLine) ||
          currentTrimmed.startsWith(">") ||
          (currentTrimmed.startsWith("|") && startsMarkdownTable(lines, i))
        ) {
          i--; // back up so the outer loop parses this line
          break;
        }

        // Empty line handling
        if (currentTrimmed === "") {
          let nextIdx = i + 1;
          while (nextIdx < lines.length && lines[nextIdx].trim() === "") {
            nextIdx++;
          }
          if (nextIdx >= lines.length) {
            i = nextIdx; // consume trailing empty lines
            break;
          }
          const nextLine = lines[nextIdx];
          const nextIsListItem = listPattern.test(nextLine);
          const nextHasIndent = nextLine.startsWith(" ") || nextLine.startsWith("\t");
          
          if (!nextIsListItem && !nextHasIndent) {
            i--; // back up so outer loop processes empty line/paragraph
            break;
          }
        }

        // Append line to current list item
        if (items.length > 0) {
          items[items.length - 1].text += "\n" + currentLine;
        }
        i++;
      }

      blocks.push({
        id: `md-${globalIndex}-list`,
        type: "list",
        globalOrderIndex: globalIndex++,
        items,
      });
      continue;
    }

    if (trimmed.startsWith("$$")) {
      // Flush presenter block first
      if (presenterType && presenterType !== "code") {
        flushPresenterBlock(presenterType, presenterLines);
        presenterLines = [];
        presenterType = null;
      }

      const mathLines: string[] = [];
      if (trimmed.endsWith("$$") && trimmed.length > 2) {
        mathLines.push(trimmed.slice(2, -2).trim());
        blocks.push({
          id: `md-${globalIndex}-mathblk`,
          type: "p",
          globalOrderIndex: globalIndex++,
          content: `$$${mathLines[0]}$$`,
        });
      } else {
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("$$")) {
          mathLines.push(lines[i]);
          i++;
        }
        blocks.push({
          id: `md-${globalIndex}-mathblk`,
          type: "p",
          globalOrderIndex: globalIndex++,
          content: `$$\n${mathLines.join("\n")}\n$$`,
        });
      }
      continue;
    }

    // Normal markdown line parsing
    if (!trimmed) {
      if (presenterType && presenterType !== "code") {
        flushPresenterBlock(presenterType, presenterLines);
        presenterLines = [];
        presenterType = null;
      }
      continue;
    }

    // Identify line type
    let lineType: "p" | "h" | "code" | "list" | "blockquote" | "table" | "hr" | null = "p";
    if (trimmed.startsWith("```")) {
      lineType = "code";
    } else if (trimmed.startsWith("#")) {
      lineType = "h";
    } else if (trimmed.startsWith(">")) {
      lineType = "blockquote";
    } else if (trimmed.startsWith("|") && (presenterType === "table" || startsMarkdownTable(lines, i))) {
      lineType = "table";
    } else if (trimmed.match(/^[-*+]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      lineType = "list";
    } else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      lineType = "hr";
    }

    if (presenterType === "code") {
      presenterLines.push(line);
      if (trimmed.startsWith("```") && presenterLines.length > 1) {
        flushPresenterBlock("code", presenterLines);
        presenterLines = [];
        presenterType = null;
      }
      continue;
    }

    if (presenterType && presenterType !== lineType) {
      flushPresenterBlock(presenterType, presenterLines);
      presenterLines = [];
    }

    presenterType = lineType;
    presenterLines.push(line);

    if (lineType === "hr" || lineType === "h") {
      flushPresenterBlock(lineType, presenterLines);
      presenterLines = [];
      presenterType = null;
    }
  }

  // Flush any remaining presenter blocks
  if (presenterType && presenterLines.length > 0) {
    flushPresenterBlock(presenterType, presenterLines);
  }

  // Flush any unclosed canonical blocks (e.g. during streaming)
  if (currentBlockType !== null) {
    const block = parseBlockNode(
      currentBlockType,
      currentBlockAttrStr,
      currentBlockLines,
      currentBlockId || `block-final-${currentBlockType}`
    );
    if (block) {
      block.globalOrderIndex = globalIndex++;
      blocks.push(block);
    }
  }

  return blocks;
}

// ==========================================
// COMPILER PHASES HELPERS
// ==========================================

// Phase 2: Normalize
function normalizeBlocks(blocks: ASTBlock[]): ASTBlock[] {
  // Diagram and flowchart step normalization is already completed during parsing.
  // Additional block-level normalization can be performed here.
  return blocks;
}

// Phase 3: Validate
function validateBlocks(
  blocks: ASTBlock[],
  chapterId: string,
  courseId: string,
  chapterTitle: string,
  estimatedReadingTimeMin: number
): { ast: WebsiteMaterialAST; validationDiagnostics: CompilerDiagnostic[] } {
  const ast: WebsiteMaterialAST = {
    schemaVersion: "1.0.0",
    compilerVersion: "2.1.0",
    chapterId,
    courseId,
    documentMetadata: {
      title: chapterTitle,
      lastModified: new Date().toISOString(),
      estimatedReadingTimeMin,
    },
    blocks,
  };

  const validation = validateAST(ast);
  const validationDiagnostics: CompilerDiagnostic[] = [];

  if (!validation.success) {
    validation.errors.forEach(err => {
      validationDiagnostics.push({
        severity: "error",
        code: "AST_SCHEMA_VALIDATION_FAILED",
        message: `Schema violation at path [${err.path}]: ${err.message}`,
        recommendation: "Review the block structure and confirm all required fields are provided.",
      });
    });
  }

  return { ast, validationDiagnostics };
}

// Phase 4: Diagnostics
function runDiagnostics(
  ast: WebsiteMaterialAST,
  validationDiagnostics: CompilerDiagnostic[]
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [...validationDiagnostics];
  const blocks = ast.blocks;

  const glossaryTerms = new Set<string>();
  const definedVisualIds = new Set<string>();
  const referencedVisualIds = new Set<string>();
  const referencedGlossaryTerms = new Set<string>();
  const glossaryTermsBlocks: any[] = [];
  const conceptTitles = new Set<string>();

  blocks.forEach(block => {
    if (block.type === "glossary_term") {
      glossaryTerms.add(block.content.term.toLowerCase().trim());
      glossaryTermsBlocks.push(block);
    }
    if (block.type === "visual") {
      definedVisualIds.add(block.id);
    }
    if (block.type === "concept") {
      conceptTitles.add(block.content.title.toLowerCase().trim());
    }
  });

  blocks.forEach(block => {
    // Math Leakage Check in Concept blocks (Point 4 - Heuristic 3-level)
    if (block.type === "concept" && !block.id.includes("-definition") && block.content.title !== "Definition") {
      const body = block.content.bodyMarkdown;
      
      // Level 1: Strict latex keywords
      const hasStrictMath = /\\frac|\\sum|\\int|\\lim|\\sqrt/g.test(body);
      
      // Level 2 & 3: Candidates like variables assignment (P(x) = ax^2 + bx + c)
      const assignmentRegex = /[a-zA-Z]\s*=\s*[^=]/g;
      let hasMathLeakage = hasStrictMath;

      if (!hasMathLeakage) {
        let match;
        while ((match = assignmentRegex.exec(body)) !== null) {
          // Level 3: Evaluate surrounding context (30 characters before and after)
          const contextStart = Math.max(0, match.index - 30);
          const contextEnd = Math.min(body.length, match.index + match[0].length + 30);
          const surroundingContext = body.slice(contextStart, contextEnd);

          // Heuristic check: see if caret, subscript, plus/minus, sin/cos, etc. are nearby
          const hasMathContext = /[\^_\+\-\*\/]|\b(?:sin|cos|tan|log|ln|exp|lim|sqrt)\b|\b[a-zA-Z]_\d+|\b[a-zA-Z]\([a-zA-Z0-9]\)/i.test(surroundingContext);
          
          if (hasMathContext) {
            hasMathLeakage = true;
            break;
          }
        }
      }

      if (hasMathLeakage) {
        diagnostics.push({
          severity: "error",
          code: "FORMULA_IN_CONCEPT",
          message: `Concept block "${block.content.title}" contains direct math/formula declarations without separate block encapsulation.`,
          blockId: block.id,
          recommendation: "Move equation into a dedicated :::formula block.",
        });
      }
    }

    // Extract glossary reference tags [[term]] or visual references [[visual:id]]
    const textsToSearch: string[] = [];
    if (block.type === "concept") textsToSearch.push(block.content.bodyMarkdown);
    else if (block.type === "formula" && block.content.interpretation) textsToSearch.push(block.content.interpretation);
    else if (block.type === "p") textsToSearch.push(block.content);

    textsToSearch.forEach(text => {
      const matches = text.match(/\[\[(.*?)\]\]/g);
      if (matches) {
        matches.forEach(m => {
          const content = m.slice(2, -2).trim();
          if (content.toLowerCase().startsWith("visual:")) {
            const visualId = content.slice(7).trim();
            referencedVisualIds.add(visualId);
            if (!definedVisualIds.has(visualId)) {
              diagnostics.push({
                severity: "error",
                code: "VISUAL_REFERENCE_INVALID",
                message: `Block references visual ID "${visualId}" which does not exist in the document.`,
                blockId: block.id,
                recommendation: `Ensure a visual block with id="${visualId}" is declared.`,
              });
            }
          } else {
            referencedGlossaryTerms.add(content.toLowerCase().trim());
            if (!glossaryTerms.has(content.toLowerCase().trim())) {
              diagnostics.push({
                severity: "error",
                code: "MISSING_GLOSSARY_TERM",
                message: `Term "[[${content}]]" is referenced but has no corresponding glossary term definition.`,
                blockId: block.id,
                recommendation: `Create a glossary term for "${content}".`,
              });
            }
          }
        });
      }
    });

    // Check visual block parsing fallback
    if (block.type === "visual") {
      if (block.visualType === "graph" && (!block.data.functions || block.data.functions.length === 0)) {
        diagnostics.push({
          severity: "warning",
          code: "VISUAL_BLOCK_PARSE_FALLBACK",
          message: `Graph visual "${block.title || block.id}" contains no plottable mathematical functions.`,
          blockId: block.id,
          recommendation: "Graph block parsed as descriptive content. No structured function extracted.",
        });
      }
      if ((block.visualType === "diagram" || block.visualType === "flowchart") && (!block.data.nodes || block.data.nodes.length === 0)) {
        diagnostics.push({
          severity: "warning",
          code: "VISUAL_BLOCK_PARSE_FALLBACK",
          message: `Visual node mapping failed for "${block.title || block.id}": 0 nodes or edges were successfully generated.`,
          blockId: block.id,
          recommendation: "Confirm diagram edges use valid 'A --> B' syntax to allow automatic node extraction.",
        });
      }
    }
  });

  // CONCEPT_WITHOUT_GLOSSARY warning
  conceptTitles.forEach(title => {
    if (!glossaryTerms.has(title)) {
      diagnostics.push({
        severity: "warning",
        code: "CONCEPT_WITHOUT_GLOSSARY",
        message: `Concept title "${title}" has no corresponding glossary term definition.`,
        recommendation: `Create a glossary term for "${title}".`,
      });
    }
  });

  // GLOSSARY_NEVER_REFERENCED warning
  glossaryTermsBlocks.forEach(block => {
    const term = block.content.term.toLowerCase().trim();
    if (!referencedGlossaryTerms.has(term)) {
      diagnostics.push({
        severity: "warning",
        code: "GLOSSARY_NEVER_REFERENCED",
        message: `Glossary term "${block.content.term}" is defined but never referenced anywhere in the text.`,
        blockId: block.id,
        recommendation: `Use [[${block.content.term}]] inside concepts or paragraphs to link to this glossary term.`,
      });
    }
  });

  // UNUSED_VISUAL_BLOCK warning
  definedVisualIds.forEach(vid => {
    if (!referencedVisualIds.has(vid)) {
      diagnostics.push({
        severity: "warning",
        code: "UNUSED_VISUAL_BLOCK",
        message: `Visual block "${vid}" is parsed but never referenced via [[visual:${vid}]].`,
        recommendation: `Insert [[visual:${vid}]] in relevant paragraphs or concept blocks to reference this diagram.`,
      });
    }
  });

  // VISUAL_TOO_FAR warning
  blocks.forEach(block => {
    let text = "";
    if (block.type === "concept") text = block.content.bodyMarkdown;
    else if (block.type === "p") text = block.content;

    const matches = text.match(/\[\[visual:(.*?)\]\]/);
    if (matches) {
      const visualId = matches[1].trim();
      const visualBlockIdx = blocks.findIndex(b => b.id === visualId);
      if (visualBlockIdx !== -1) {
        const currentIdx = blocks.findIndex(b => b.id === block.id);
        const distance = Math.abs(currentIdx - visualBlockIdx);
        if (distance > 5) {
          diagnostics.push({
            severity: "warning",
            code: "VISUAL_TOO_FAR",
            message: `Visual reference "[[visual:${visualId}]]" is located ${distance} blocks away from the actual visual block.`,
            blockId: block.id,
            recommendation: "Move the visual block closer to the text or concept describing it.",
          });
        }
      }
    }
  });

  return diagnostics;
}

// Phase 5: Stats
function computeStats(
  ast: WebsiteMaterialAST,
  diagnostics: CompilerDiagnostic[],
  counts: {
    conceptCount: number;
    formulaCount: number;
    glossaryCount: number;
    visualCount: number;
    graphCount: number;
    diagramCount: number;
    flowchartCount: number;
    estimatedReadingTimeMin: number;
  }
): CompilerStats {
  const blocks = ast.blocks;

  const glossaryTerms = new Set<string>();
  const definedVisualIds = new Set<string>();
  const referencedVisualIds = new Set<string>();
  const referencedGlossaryTerms = new Set<string>();

  blocks.forEach(block => {
    if (block.type === "glossary_term") {
      glossaryTerms.add(block.content.term.toLowerCase().trim());
    }
    if (block.type === "visual") {
      definedVisualIds.add(block.id);
    }
  });

  blocks.forEach(block => {
    const textsToSearch: string[] = [];
    if (block.type === "concept") textsToSearch.push(block.content.bodyMarkdown);
    else if (block.type === "formula" && block.content.interpretation) textsToSearch.push(block.content.interpretation);
    else if (block.type === "p") textsToSearch.push(block.content);

    textsToSearch.forEach(text => {
      const matches = text.match(/\[\[(.*?)\]\]/g);
      if (matches) {
        matches.forEach(m => {
          const content = m.slice(2, -2).trim();
          if (content.toLowerCase().startsWith("visual:")) {
            const visualId = content.slice(7).trim();
            if (definedVisualIds.has(visualId)) {
              referencedVisualIds.add(visualId);
            }
          } else {
            const term = content.toLowerCase().trim();
            if (glossaryTerms.has(term)) {
              referencedGlossaryTerms.add(term);
            }
          }
        });
      }
    });
  });

  let conceptLengthSum = 0;
  let formulaLengthSum = 0;
  blocks.forEach(block => {
    if (block.type === "concept") conceptLengthSum += block.content.bodyMarkdown.length;
    else if (block.type === "formula") formulaLengthSum += (block.content.interpretation || "").length;
  });

  const averageConceptLength = counts.conceptCount > 0 ? Math.round(conceptLengthSum / counts.conceptCount) : 0;
  const averageFormulaLength = counts.formulaCount > 0 ? Math.round(formulaLengthSum / counts.formulaCount) : 0;
  
  // Calculate average glossary references per concept/paragraph
  const textBlocksCount = blocks.filter(b => b.type === "concept" || b.type === "p").length;
  const averageGlossaryReferenceCount = textBlocksCount > 0 ? Math.round((referencedGlossaryTerms.size / textBlocksCount) * 100) / 100 : 0;

  // Calculate average visual distance
  let totalDistance = 0;
  let referenceCount = 0;
  blocks.forEach((block, idx) => {
    let text = "";
    if (block.type === "concept") text = block.content.bodyMarkdown;
    else if (block.type === "p") text = block.content;

    const matches = text.match(/\[\[visual:(.*?)\]\]/g);
    if (matches) {
      matches.forEach(m => {
        const visualId = m.slice(9, -2).trim();
        const visualBlockIdx = blocks.findIndex(b => b.id === visualId);
        if (visualBlockIdx !== -1) {
          totalDistance += Math.abs(idx - visualBlockIdx);
          referenceCount++;
        }
      });
    }
  });
  const averageVisualDistance = referenceCount > 0 ? Math.round((totalDistance / referenceCount) * 10) / 10 : 0;

  // Glossary coverage calculation
  const glossaryCoverage = referencedGlossaryTerms.size > 0 ? Math.round((Array.from(referencedGlossaryTerms).filter(t => glossaryTerms.has(t)).length / referencedGlossaryTerms.size) * 100) : 100;
  // Visual reference coverage calculation
  const visualReferenceCoverage = definedVisualIds.size > 0 ? Math.round((Array.from(definedVisualIds).filter(id => referencedVisualIds.has(id)).length / definedVisualIds.size) * 100) : 100;
  // Formula atomization check
  const mathErrorCount = diagnostics.filter(d => d.code === "FORMULA_IN_CONCEPT").length;
  const formulaAtomization = Math.max(100 - mathErrorCount * 15, 0);
  // Visual coverage
  const visualCoverage = definedVisualIds.size > 0 ? 100 : 80;

  // Quality score formula
  const score = Math.round(glossaryCoverage * 0.3 + visualReferenceCoverage * 0.3 + formulaAtomization * 0.2 + visualCoverage * 0.2);

  return {
    conceptCount: counts.conceptCount,
    formulaCount: counts.formulaCount,
    glossaryCount: counts.glossaryCount,
    visualCount: counts.visualCount,
    graphCount: counts.graphCount,
    diagramCount: counts.diagramCount,
    flowchartCount: counts.flowchartCount,
    readingTime: counts.estimatedReadingTimeMin,
    averageConceptLength,
    averageFormulaLength,
    averageVisualDistance,
    averageGlossaryReferenceCount,
    quality: {
      score,
      breakdown: {
        glossaryCoverage,
        visualCoverage,
        formulaAtomization,
        visualReferenceCoverage,
      }
    }
  };
}

// ==========================================
// CORE COMPILER SERVICE
// ==========================================

export function compileMarkdown(
  markdown: string,
  chapterId: string = "chapter-id",
  courseId: string = "course-id"
): CompilerResult {
  // Phase 1: Parse
  const rawBlocks = parseCanonicalMarkdown(markdown);

  // Phase 2: Normalize
  const normalizedBlocks = normalizeBlocks(rawBlocks);

  let chapterTitle = "Untitled Chapter";
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().startsWith("# ")) {
      chapterTitle = line.trim().slice(2).trim();
      break;
    }
  }

  // Calculate counts for stats and reading time estimation
  let totalWords = 0;
  let formulaCount = 0;
  let visualCount = 0;
  let graphCount = 0;
  let diagramCount = 0;
  let flowchartCount = 0;
  let conceptCount = 0;
  let glossaryCount = 0;

  normalizedBlocks.forEach(block => {
    const texts: string[] = [];
    if (block.type === "p" || block.type === "h" || block.type === "blockquote") {
      texts.push(block.content);
    } else if (block.type === "concept") {
      conceptCount++;
      texts.push(block.content.title, block.content.bodyMarkdown);
    } else if (block.type === "formula") {
      formulaCount++;
      texts.push(block.content.title || "", block.content.latex, block.content.interpretation || "");
    } else if (block.type === "glossary_term") {
      glossaryCount++;
      texts.push(block.content.term, block.content.definition);
    } else if (block.type === "visual") {
      visualCount++;
      if (block.visualType === "graph") graphCount++;
      else if (block.visualType === "diagram") diagramCount++;
      else if (block.visualType === "flowchart") flowchartCount++;
      
      if (block.title) texts.push(block.title);
      if (block.caption) texts.push(block.caption);
    }
    
    texts.forEach(text => {
      totalWords += text.split(/\s+/).filter(Boolean).length;
    });
  });

  const estimatedReadingTimeMin = Math.ceil(totalWords / 200 + formulaCount * 2 + visualCount * 1.5) || 1;

  // Phase 3: Validate
  const { ast, validationDiagnostics } = validateBlocks(
    normalizedBlocks,
    chapterId,
    courseId,
    chapterTitle,
    estimatedReadingTimeMin
  );

  // Phase 4: Diagnostics
  const diagnostics = runDiagnostics(ast, validationDiagnostics);

  // Phase 5: Stats
  const stats = computeStats(ast, diagnostics, {
    conceptCount,
    formulaCount,
    glossaryCount,
    visualCount,
    graphCount,
    diagramCount,
    flowchartCount,
    estimatedReadingTimeMin,
  });

  return {
    ast,
    diagnostics,
    stats,
  };
}

export function migrateAst(ast: WebsiteMaterialAST, _fromVersion: string, _toVersion: string): WebsiteMaterialAST {
  // Version migration stub
  return ast;
}

export async function compileMarkdownToAST(
  markdown: string,
  chapterId: string,
  courseId: string
): Promise<WebsiteMaterialAST> {
  const result = compileMarkdown(markdown, chapterId, courseId);
  return result.ast;
}
