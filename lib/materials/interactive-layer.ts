import { ASTBlock } from "../ast-validator";

/**
 * Plan 009: Material Interactive Layer
 * Attaches KO interactive metadata and highlights without mutating source text content.
 */

export interface InteractiveKoAnnotation {
  koId: string;
  conceptTitle: string;
  blockId: string;
  startOffset?: number;
  endOffset?: number;
}

export function attachKoInteractiveAnnotations(
  blocks: ASTBlock[],
  koMap: Map<string, { title: string }>
): InteractiveKoAnnotation[] {
  const annotations: InteractiveKoAnnotation[] = [];

  for (const block of blocks) {
    if ("content" in block && typeof block.content === "string") {
      for (const [koId, ko] of koMap.entries()) {
        if (block.content.toLowerCase().includes(ko.title.toLowerCase())) {
          annotations.push({
            koId,
            conceptTitle: ko.title,
            blockId: block.id,
          });
        }
      }
    }
  }

  return annotations;
}
