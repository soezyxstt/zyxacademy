import { db } from "@/db";
import { knowledgeObjects } from "@/db/schema";
import { eq } from "drizzle-orm";
import katex from "@/lib/math/katex";
import { z } from "zod";
import { validateDistractorMap } from "@/lib/distractor-mapper";

export { validateDistractorMap };

export const QuizQuestionInputSchema = z.object({
  knowledgeObjectId: z.string().min(1),
  prompt: z.string().min(1, "Question prompt cannot be empty"),
  options: z.array(z.string().min(1, "Option choice cannot be empty")),
  correctIndices: z.array(z.number().int().nonnegative()),
  explanation: z.string().min(1, "Explanation cannot be empty"),
});

export type QuizQuestionInput = z.infer<typeof QuizQuestionInputSchema>;

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parses a string and compiles any LaTeX math blocks with KaTeX to verify syntax validity.
 */
export function validateKaTeXInString(text: string): string[] {
  const errors: string[] = [];
  
  // Match $$ block equations
  const blockMatches = text.match(/\$\$([\s\S]*?)\$\$/g) || [];
  for (const match of blockMatches) {
    const equation = match.slice(2, -2).trim();
    try {
      katex.renderToString(equation, { displayMode: true, throwOnError: true });
    } catch (err: any) {
      errors.push(`KaTeX block compile failure for "${equation}": ${err?.message || err}`);
    }
  }
  
  // Replace $$ block equations with placeholders before doing inline searches to avoid nested matches
  let inlineSearchText = text;
  for (const match of blockMatches) {
    inlineSearchText = inlineSearchText.replace(match, "BLOCK_PLACEHOLDER");
  }
  
  // Match inline $ equations
  const inlineMatches = inlineSearchText.match(/\$(.*?)\$/g) || [];
  for (const match of inlineMatches) {
    const equation = match.slice(1, -1).trim();
    
    // Ignore single dollar symbols (e.g. money values) or empty expressions
    if (!equation || equation.match(/^\d+$/) || equation.match(/^[a-zA-Z]$/) || equation === "") {
      continue;
    }
    
    try {
      katex.renderToString(equation, { displayMode: false, throwOnError: true });
    } catch (err: any) {
      errors.push(`KaTeX inline compile failure for "${equation}": ${err?.message || err}`);
    }
  }
  
  return errors;
}

/**
 * Validates a generated question against structural, relational, KaTeX, position leakage, and blueprint gates.
 */
export async function validateQuestion(
  question: any,
  tx: any = db
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Zod structural check
  const structValidation = QuizQuestionInputSchema.safeParse(question);
  if (!structValidation.success) {
    structValidation.error.issues.forEach(issue => {
      errors.push(`[${issue.path.join(".")}]: ${issue.message}`);
    });
    return { success: false, errors, warnings };
  }

  const q = structValidation.data;

  // 2. Strict bounds & cardinality check
  if (q.options.length !== 4) {
    errors.push(`Options list must contain exactly 4 choices (received ${q.options.length}).`);
  }

  if (q.correctIndices.length === 0) {
    errors.push("At least one correct option index must be specified.");
  }

  for (const index of q.correctIndices) {
    if (index < 0 || index >= q.options.length) {
      errors.push(`Correct index ${index} is out of bounds for options of size ${q.options.length}.`);
    }
  }

  // Single choice format cardinality enforcement
  if (question.itemFormat === "multiple_choice" && q.correctIndices.length > 1) {
    errors.push("Single-choice format requires exactly 1 correct index.");
  }

  // 3. Strict duplicate options check (normalized lowercase & trimmed)
  const uniqueOptions = new Set(q.options.map(opt => opt.trim().toLowerCase()));
  if (uniqueOptions.size !== q.options.length) {
    errors.push("Options list contains duplicate choices.");
  }

  // 3b. Position leakage check (e.g. "All of the above", "Option A", "Semua jawaban benar")
  const leakageRegex = /(all|none) of the above|semua (jawaban|pilihan) benar|tidak ada (jawaban|pilihan) yang benar|pilihan [A-D]|option [A-D]/i;
  q.options.forEach((opt, idx) => {
    if (leakageRegex.test(opt)) {
      errors.push(`Option ${idx} contains position-dependent phrase ("${opt.slice(0, 50)}") which breaks after shuffle.`);
    }
  });

  // 3c. Distractor map validation when present
  if (question.distractorMap !== undefined) {
    const dmErrors = validateDistractorMap(question.distractorMap, q.options.length, q.correctIndices);
    errors.push(...dmErrors.map((e) => `[distractorMap]: ${e}`));
  }

  // 4. Strict KaTeX compile checking
  const promptKatexErrors = validateKaTeXInString(q.prompt);
  errors.push(...promptKatexErrors.map(err => `[Prompt]: ${err}`));

  q.options.forEach((opt, oIdx) => {
    const optionKatexErrors = validateKaTeXInString(opt);
    errors.push(...optionKatexErrors.map(err => `[Option ${oIdx}]: ${err}`));
  });

  const expKatexErrors = validateKaTeXInString(q.explanation);
  errors.push(...expKatexErrors.map(err => `[Explanation]: ${err}`));

  // 5. Strict Traceability & Active check
  let parentKO: any = null;
  try {
    const [ko] = await tx
      .select()
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.id, q.knowledgeObjectId));
    
    if (!ko) {
      errors.push(`Knowledge Object with ID "${q.knowledgeObjectId}" does not exist in the database.`);
    } else if (ko.status !== "active") {
      errors.push(`Parent Knowledge Object ID "${q.knowledgeObjectId}" is retired/inactive.`);
    } else {
      parentKO = ko;
    }
  } catch (err: any) {
    errors.push(`Relational lookup error for KO ID "${q.knowledgeObjectId}": ${err?.message || err}`);
  }

  // 6. Warning checks
  const wordCount = q.explanation.split(/\s+/).filter(Boolean).length;
  if (wordCount < 25) {
    warnings.push("Explanation details are short (under 25 words). Consider adding more conceptual details.");
  }

  if (parentKO && parentKO.type === "formula") {
    const isPurelyNumeric = q.options.every(opt => /^\d+(\.\d+)?$/.test(opt.trim()));
    if (isPurelyNumeric) {
      warnings.push("Options are purely numeric without unit declarations. Standard SI units should be appended.");
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}
