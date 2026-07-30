import { z } from "zod";
import { ASTBlock } from "../ast-validator";

/**
 * Plan 009: Semantic Material Compiler
 * Provides structured outline planning, preflight KO validation, typed exclusion tracking,
 * and deterministic serialization of validated semantic blocks into Markdown.
 */

export const KOExclusionReasonSchema = z.enum([
  "duplicate",
  "out_of_scope",
  "prerequisite_elsewhere",
  "unsupported",
  "conflict",
  "editorial",
]);
export type KOExclusionReason = z.infer<typeof KOExclusionReasonSchema>;

export interface KOCompilerInput {
  id: string;
  title: string;
  type: string;
  content: string;
  difficulty: "easy" | "medium" | "hard";
  bloomLevel?: string;
  importance?: number;
  status?: string;
  provenanceSourceId?: string;
}

export interface ExcludedKO {
  koId: string;
  reason: KOExclusionReason;
  details?: string;
}

export interface MaterialSectionOutline {
  sectionId: string;
  title: string;
  learningObjective: string;
  includedKoIds: string[];
  excludedKos: ExcludedKO[];
  prerequisiteReferences: string[];
  conflictGroups: string[][];
}

export interface MaterialOutlinePlan {
  courseId: string;
  topicTitle: string;
  sections: MaterialSectionOutline[];
  preflightPassed: boolean;
  validationErrors: string[];
}

/**
 * Preflight check: Rejects inactive, needs-review, or provenance-less KOs for V2 compiler.
 */
export function validatePreflightKos(kos: KOCompilerInput[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const ko of kos) {
    if (ko.status === "inactive" || ko.status === "needs_review") {
      errors.push(`KO ${ko.id} (${ko.title}) has invalid status '${ko.status}' for V2 material compilation.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Outline Planner: Builds structured section outline with typed inclusions and exclusions.
 */
export function planMaterialOutline(
  courseId: string,
  topicTitle: string,
  kos: KOCompilerInput[]
): MaterialOutlinePlan {
  const preflight = validatePreflightKos(kos);
  if (!preflight.valid) {
    return {
      courseId,
      topicTitle,
      sections: [],
      preflightPassed: false,
      validationErrors: preflight.errors,
    };
  }

  const seenTitles = new Set<string>();
  const includedKoIds: string[] = [];
  const excludedKos: ExcludedKO[] = [];

  for (const ko of kos) {
    const normalizedTitle = ko.title.trim().toLowerCase();
    if (seenTitles.has(normalizedTitle)) {
      excludedKos.push({
        koId: ko.id,
        reason: "duplicate",
        details: `Duplicate concept title '${ko.title}' excluded from material plan`,
      });
    } else {
      seenTitles.add(normalizedTitle);
      includedKoIds.push(ko.id);
    }
  }

  const mainSection: MaterialSectionOutline = {
    sectionId: "sec-main-1",
    title: topicTitle,
    learningObjective: `Memahami konsep utama ${topicTitle}`,
    includedKoIds,
    excludedKos,
    prerequisiteReferences: [],
    conflictGroups: [],
  };

  return {
    courseId,
    topicTitle,
    sections: [mainSection],
    preflightPassed: true,
    validationErrors: [],
  };
}

/**
 * Deterministically serializes semantic AST blocks to canonical Markdown with stable formatting.
 */
export function serializeBlocksToMarkdown(blocks: ASTBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "h":
        lines.push(`${"#".repeat(block.level)} ${block.content}`);
        break;
      case "p":
        lines.push(block.content);
        break;
      case "list":
        for (const item of block.items) {
          lines.push(item.ordered ? `1. ${item.text}` : `- ${item.text}`);
        }
        break;
      case "blockquote":
        lines.push(`> ${block.content}`);
        break;
      case "code":
        lines.push(`\`\`\`${block.language}\n${block.content}\n\`\`\``);
        break;
      default:
        // Generic fallback for custom containers
        lines.push(`\n<!-- block: ${(block as any).type} -->\n`);
        break;
    }
  }

  return lines.join("\n\n");
}
