import { z } from "zod";

// ==========================================
// ZOD SCHEMAS FOR INDIVIDUAL AST BLOCKS
// ==========================================

export const BloomLevelSchema = z.enum([
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const ParagraphBlockSchema = z.object({
  id: z.string(),
  type: z.literal("p"),
  globalOrderIndex: z.number(),
  content: z.string(),
});

export const HeadingBlockSchema = z.object({
  id: z.string(),
  type: z.literal("h"),
  globalOrderIndex: z.number(),
  level: z.number().int().min(1).max(6),
  content: z.string(),
});

export const ListBlockSchema = z.object({
  id: z.string(),
  type: z.literal("list"),
  globalOrderIndex: z.number(),
  items: z.array(z.object({ text: z.string(), ordered: z.boolean() })),
});

export const BlockquoteBlockSchema = z.object({
  id: z.string(),
  type: z.literal("blockquote"),
  globalOrderIndex: z.number(),
  content: z.string(),
});

export const TableBlockSchema = z.object({
  id: z.string(),
  type: z.literal("table"),
  globalOrderIndex: z.number(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  alignments: z.array(z.enum(["left", "center", "right"])).optional(),
});

export const CodeBlockSchema = z.object({
  id: z.string(),
  type: z.literal("code"),
  globalOrderIndex: z.number(),
  content: z.string(),
  language: z.string().optional(),
});

export const HrBlockSchema = z.object({
  id: z.string(),
  type: z.literal("hr"),
  globalOrderIndex: z.number(),
});

export const LearningObjectiveBlockSchema = z.object({
  id: z.string(),
  type: z.literal("learning_objective"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    bloomLevel: BloomLevelSchema,
  }),
  content: z.object({
    objectives: z.array(z.string()),
  }),
});

export const ConceptBlockSchema = z.object({
  id: z.string(),
  type: z.literal("concept"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    koId: z.string(),
  }),
  content: z.object({
    title: z.string(),
    bodyMarkdown: z.string(),
  }),
});

export const FormulaParameterSchema = z.object({
  symbol: z.string(),
  definition: z.string(),
  unit: z.string().optional(),
});

export const FormulaBlockSchema = z.object({
  id: z.string(),
  type: z.literal("formula"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    koId: z.string().optional(),
  }),
  content: z.object({
    title: z.string().optional(),
    latex: z.string(),
    interpretation: z.string().optional(),
    derivationMarkdown: z.string().optional(), // compatibility
    symbols: z.array(FormulaParameterSchema).optional().default([]),
    parameters: z.array(z.any()).optional(), // compatibility
    assumptions: z.array(z.string()).optional().default([]),
    usage: z.array(z.string()).optional().default([]),
  }),
});

export const FormulaReferenceBlockSchema = z.object({
  id: z.string(),
  type: z.literal("formula_reference"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    linkedFormulaBlockId: z.string(),
  }),
  content: z.object({
    latex: z.string(),
    label: z.string(),
  }),
});

export const EngineeringInsightBlockSchema = z.object({
  id: z.string(),
  type: z.literal("engineering_insight"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    discipline: z.enum(["physics", "mechanical", "control", "thermal", "general"]),
  }),
  content: z.object({
    title: z.string(),
    applicationMarkdown: z.string(),
  }),
});

export const ExampleBlockSchema = z.object({
  id: z.string(),
  type: z.literal("example"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    difficulty: DifficultySchema,
    koId: z.string().optional(),
  }),
  content: z.object({
    problemStatement: z.string(),
    setupCheck: z
      .object({
        prompt: z.string(),
        type: z.enum(["mcq", "numeric"]),
        options: z.array(z.string()).optional(),
        correctAnswer: z.string(),
        explanation: z.string().optional(),
      })
      .optional(),
    solutionSteps: z.array(
      z.object({
        stepIndex: z.number(),
        label: z.string(),
        explanationMarkdown: z.string(),
        mathProof: z.string().optional(),
      })
    ),
  }),
});

export const MisconceptionBlockSchema = z.object({
  id: z.string(),
  type: z.literal("misconception"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    koId: z.string(),
  }),
  content: z.object({
    myth: z.string(),
    correctionMarkdown: z.string(),
    physicalRationaleMarkdown: z.string(),
  }),
});

export const ExerciseBlockSchema = z.object({
  id: z.string(),
  type: z.literal("exercise"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    questionId: z.string(),
  }),
  content: z.object({
    questionMarkdown: z.string(),
    questionType: z.enum(["multiple_choice", "numeric_input", "short_essay"]),
    options: z.array(z.string()).optional(),
    evaluationParameters: z
      .object({
        tolerance: z.number().optional(),
        expectedUnit: z.string().optional(),
      })
      .optional(),
  }),
});

export const SummaryBlockSchema = z.object({
  id: z.string(),
  type: z.literal("summary"),
  globalOrderIndex: z.number(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
  content: z.object({
    bullets: z.array(z.string()),
  }),
});

export const GlossaryTermBlockSchema = z.object({
  id: z.string(),
  type: z.literal("glossary_term"),
  globalOrderIndex: z.number(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
  content: z.object({
    term: z.string(),
    definition: z.string(),
    linkedFormulaIds: z.array(z.string()).optional(),
  }),
});

export const ImageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("image"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    aspectRatio: z.string().regex(/^[0-9]+:[0-9]+$/),
    zoomEnabled: z.boolean().optional().default(true),
    fullscreenEnabled: z.boolean().optional().default(true),
  }),
  content: z.object({
    url: z.string(),
    caption: z.string().optional(),
    alt: z.string(),
  }),
});

export const WarningNoteBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["warning", "note"]),
  globalOrderIndex: z.number(),
  metadata: z.object({
    collapsible: z.boolean().optional().default(false),
  }),
  content: z.object({
    title: z.string().optional(),
    messageMarkdown: z.string(),
  }),
});

export const VISUAL_TYPES = {
  chart: "chart",
  graph: "graph",
  flowchart: "flowchart",
  diagram: "diagram",
} as const;

export const ChartVisualDataSchema = z.object({
  chartType: z.enum(["line", "bar", "scatter", "histogram", "pie"]),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  data: z.array(z.array(z.union([z.number(), z.string()]))),
});

export const GraphVisualDataSchema = z.object({
  functions: z.array(z.string()),
  domain: z.object({
    min: z.number(),
    max: z.number(),
  }).optional().default({ min: -10, max: 10 }),
  samples: z.number().int().positive().optional().default(200),
});

export const FlowchartDiagramVisualDataSchema = z.object({
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      label: z.string().optional(),
    })
  ),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      stepNumber: z.number().optional(),
    })
  ).optional().default([]),
  diagramType: z.string().optional(),
});

export const VisualBlockSchema = z.object({
  id: z.string(),
  type: z.literal("visual"),
  globalOrderIndex: z.number(),
  visualType: z.enum(["chart", "graph", "flowchart", "diagram"]),
  version: z.literal(1),
  title: z.string().optional(),
  caption: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
  data: z.any(),
}).superRefine((val, ctx) => {
  let result;
  if (val.visualType === "chart") {
    result = ChartVisualDataSchema.safeParse(val.data);
    if (result.success && (!result.data.data || result.data.data.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "data"],
        message: "Chart must contain at least 1 data point.",
      });
    }
  } else if (val.visualType === "graph") {
    result = GraphVisualDataSchema.safeParse(val.data);
    if (result.success && (!result.data.functions || result.data.functions.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "functions"],
        message: "Graph must contain at least 1 function plotting expression.",
      });
    }
  } else if (val.visualType === "flowchart" || val.visualType === "diagram") {
    result = FlowchartDiagramVisualDataSchema.safeParse(val.data);
    if (result.success) {
      const nodeCount = result.data.nodes?.length || 0;
      const edgeCount = result.data.edges?.length || 0;
      
      if (val.visualType === "diagram") {
        if (nodeCount < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "nodes"],
            message: "Diagram must contain at least 1 node.",
          });
        }
        if (edgeCount < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "edges"],
            message: "Diagram must contain at least 1 edge relation (e.g. A --> B).",
          });
        }
      } else if (val.visualType === "flowchart") {
        if (nodeCount < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "nodes"],
            message: "Flowchart must contain at least 2 nodes.",
          });
        }
      }
    }
  }
  if (result && !result.success) {
    result.error.issues.forEach(issue => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", ...issue.path],
        message: issue.message,
      });
    });
  }
});

export const MediaBlockSchema = z.object({
  id: z.string(),
  type: z.literal("media"),
  globalOrderIndex: z.number(),
  metadata: z.object({
    src: z.string(),
    caption: z.string().optional(),
    sourceLabel: z.string().optional(),
    sourceUrl: z.string().optional(),
  }).optional(),
  content: z.any().optional(),
});

// Union of all possible block schemas
export const ASTBlockSchema = z.discriminatedUnion("type", [
  MediaBlockSchema,
  ParagraphBlockSchema,
  HeadingBlockSchema,
  ListBlockSchema,
  BlockquoteBlockSchema,
  TableBlockSchema,
  CodeBlockSchema,
  HrBlockSchema,
  LearningObjectiveBlockSchema,
  ConceptBlockSchema,
  FormulaBlockSchema,
  FormulaReferenceBlockSchema,
  EngineeringInsightBlockSchema,
  ExampleBlockSchema,
  MisconceptionBlockSchema,
  ExerciseBlockSchema,
  SummaryBlockSchema,
  GlossaryTermBlockSchema,
  ImageBlockSchema,
  WarningNoteBlockSchema,
  VisualBlockSchema,
]);

export type ASTBlock = z.infer<typeof ASTBlockSchema>;

// Helpers to extract Canonical vs Markdown blocks
export type CanonicalBlock = Extract<
  ASTBlock,
  {
    type:
      | "learning_objective"
      | "concept"
      | "formula"
      | "formula_reference"
      | "engineering_insight"
      | "example"
      | "misconception"
      | "exercise"
      | "summary"
      | "glossary_term"
      | "image"
      | "warning"
      | "note"
      | "visual";
  }
>;

export type MarkdownBlock = Extract<
  ASTBlock,
  {
    type: "p" | "h" | "list" | "blockquote" | "table" | "code" | "hr";
  }
>;

// Complete Document Schema
export const WebsiteMaterialASTSchema = z.object({
  schemaVersion: z.string(),
  compilerVersion: z.string().optional().default("2.1.0"),
  chapterId: z.string(),
  courseId: z.string(),
  documentMetadata: z.object({
    title: z.string(),
    author: z.string().optional(),
    lastModified: z.string(),
    estimatedReadingTimeMin: z.number().int().nonnegative(),
  }),
  blocks: z.array(ASTBlockSchema),
});

export type WebsiteMaterialAST = z.infer<typeof WebsiteMaterialASTSchema>;

export interface CompilerDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  blockId?: string;
  recommendation?: string;
}

export interface CompilerStats {
  conceptCount: number;
  formulaCount: number;
  glossaryCount: number;
  visualCount: number;
  graphCount: number;
  diagramCount: number;
  flowchartCount: number;
  readingTime: number;
  averageConceptLength: number;
  averageFormulaLength: number;
  averageVisualDistance: number;
  averageGlossaryReferenceCount: number;
  quality: {
    score: number;
    breakdown: {
      glossaryCoverage: number;
      visualCoverage: number;
      formulaAtomization: number;
      visualReferenceCoverage: number;
    };
  };
}

export interface CompilerResult {
  ast: WebsiteMaterialAST;
  diagnostics: CompilerDiagnostic[];
  stats: CompilerStats;
}

export interface CompiledMaterial {
  markdown: string;
  compilerResult: CompilerResult;
  compiledAt: string;
  compilerVersion: string;
  schemaVersion: string;
}


// ==========================================
// CUSTOM SEMANTIC VALIDATION RULES
// ==========================================

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Performs strict semantic validation checks on the compiled AST document.
 */
export function validateAST(ast: WebsiteMaterialAST): { success: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Parse using Zod schema first for structural check
  const zodResult = WebsiteMaterialASTSchema.safeParse(ast);
  if (!zodResult.success) {
    zodResult.error.issues.forEach(issue => {
      errors.push({
        path: issue.path.join("."),
        message: issue.message,
      });
    });
    return { success: false, errors };
  }

  const glossaryTerms = new Set<string>();
  const linkedFormulaBlockIds = new Set<string>();
  const formulaBlockIds = new Set<string>();
  const visualBlockIds = new Set<string>();

  // Gather glossary terms, formula IDs, and visual block IDs
  ast.blocks.forEach((block, _index) => {
    if (block.type === "glossary_term") {
      glossaryTerms.add(block.content.term.toLowerCase().trim());
    }
    if (block.type === "formula") {
      formulaBlockIds.add(block.id);
    }
    if (block.type === "visual") {
      visualBlockIds.add(block.id);
    }
  });

  // Check each block individually for semantic constraints
  ast.blocks.forEach((block, blockIndex) => {
    const blockPath = `blocks[${blockIndex}] (${block.type})`;

    // 1. Formula Parameter Bounds Check
    if (block.type === "formula") {
      const latex = block.content.latex;
      // Build a full search corpus: the primary extracted latex + all $$...$$ patterns in interpretation/derivation
      const corpusTexts: string[] = [latex];
      if (block.content.derivationMarkdown) corpusTexts.push(block.content.derivationMarkdown);
      if (block.content.interpretation) corpusTexts.push(block.content.interpretation);
      const fullCorpus = corpusTexts.join(" ");

      const paramsList = (block.content.symbols || block.content.parameters || []) as any[];
      // Known header/label pseudo-symbols that come from Markdown table column headers
      const HEADER_SYMBOLS = new Set(["variabel", "simbol", "symbol", "parameter", "keterangan", "unit", "satuan"]);
      paramsList.forEach((param, pIdx) => {
        const rawSymbol: string = param.symbol || "";
        // Strip outer $...$ wrappers to get the bare LaTeX token
        const stripped = rawSymbol.replace(/^\$+(.+?)\$+$/, "$1").trim();
        // Skip obvious table-header placeholder symbols
        if (HEADER_SYMBOLS.has(stripped.toLowerCase())) return;
        // Split on commas/semicolons but NOT inside {} brackets (e.g. x_{1,2} should not be split)
        const splitParts: string[] = [];
        let depth = 0;
        let current = "";
        for (const ch of stripped) {
          if (ch === "{") { depth++; current += ch; }
          else if (ch === "}") { depth--; current += ch; }
          else if ((ch === "," || ch === ";") && depth === 0) {
            const t = current.trim();
            if (t) splitParts.push(t);
            current = "";
          } else {
            current += ch;
          }
        }
        if (current.trim()) splitParts.push(current.trim());
        const parts = splitParts.filter(Boolean);
        // Skip if no primary latex (formula block not yet populated)
        if (!latex) return;
        const allFound = parts.every(part => {
          const partEscaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return fullCorpus.includes(part) || new RegExp(partEscaped).test(fullCorpus);
        });
        if (!allFound) {
          errors.push({
            path: `${blockPath}.content.symbols[${pIdx}]`,
            message: `Symbol '${rawSymbol}' declared in symbols list but not found in LaTeX expression: '${latex}'`,
          });
        }
      });
    }

    // 2. MCQ Setup Check Alignment
    if (block.type === "example") {
      const setupCheck = block.content.setupCheck;
      if (setupCheck) {
        if (setupCheck.type === "mcq") {
          const options = setupCheck.options || [];
          if (options.length < 2) {
            errors.push({
              path: `${blockPath}.content.setupCheck`,
              message: `MCQ setup checks must contain at least 2 options.`,
            });
          }
          if (!options.includes(setupCheck.correctAnswer)) {
            errors.push({
              path: `${blockPath}.content.setupCheck`,
              message: `Correct answer '${setupCheck.correctAnswer}' is not present in options array.`,
            });
          }
        }
      }
    }

    // 3. Formula Reference ID Existence
    if (block.type === "formula_reference") {
      linkedFormulaBlockIds.add(block.metadata.linkedFormulaBlockId);
      // Wait: can be checked later at document level or immediately if referenced formula block comes earlier/later.
    }

    // 4. Glossary Term & Visual Reference Key Integrity
    const bodyTextsToSearch: string[] = [];
    if (block.type === "concept") {
      bodyTextsToSearch.push(block.content.bodyMarkdown);
    } else if (block.type === "formula") {
      if (block.content.derivationMarkdown) bodyTextsToSearch.push(block.content.derivationMarkdown);
    } else if (block.type === "engineering_insight") {
      bodyTextsToSearch.push(block.content.applicationMarkdown);
    } else if (block.type === "example") {
      bodyTextsToSearch.push(block.content.problemStatement);
      block.content.solutionSteps.forEach(step => {
        bodyTextsToSearch.push(step.explanationMarkdown);
      });
    } else if (block.type === "misconception") {
      bodyTextsToSearch.push(block.content.myth);
      bodyTextsToSearch.push(block.content.correctionMarkdown);
      bodyTextsToSearch.push(block.content.physicalRationaleMarkdown);
    } else if (block.type === "exercise") {
      bodyTextsToSearch.push(block.content.questionMarkdown);
    } else if (block.type === "warning" || block.type === "note") {
      bodyTextsToSearch.push(block.content.messageMarkdown);
    }

    bodyTextsToSearch.forEach(text => {
      // Find all matches of [[term]] or [[visual:refId]]
      const matches = text.match(/\[\[(.*?)\]\]/g);
      if (matches) {
        matches.forEach(match => {
          const content = match.slice(2, -2).trim();
          if (content.toLowerCase().startsWith("visual:")) {
            const visualId = content.slice(7).trim();
            if (!visualBlockIds.has(visualId)) {
              errors.push({
                path: `${blockPath}`,
                message: `Mentions visual block '[[${content}]]' but no matching visual block with ID '${visualId}' is defined.`,
              });
            }
          } else {
            const term = content.toLowerCase();
            if (!glossaryTerms.has(term)) {
              errors.push({
                path: `${blockPath}`,
                message: `Mentions glossary term '[[${content}]]' but no matching 'glossary_term' block is defined.`,
              });
            }
          }
        });
      }
    });
  });

  // Verify all linked formula references refer to existing formulas
  linkedFormulaBlockIds.forEach(linkedId => {
    if (!formulaBlockIds.has(linkedId)) {
      errors.push({
        path: `documentMetadata`,
        message: `Formula reference links to non-existent formula block ID: '${linkedId}'`,
      });
    }
  });

  return {
    success: errors.length === 0,
    errors,
  };
}
