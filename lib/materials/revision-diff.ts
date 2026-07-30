import { ASTBlock } from "../ast-validator";

/**
 * Plan 009: Material Revision Diff
 * Computes block-level structural diffs between two versions of compiled materials.
 */

export interface BlockDiffResult {
  addedBlocks: ASTBlock[];
  removedBlocks: ASTBlock[];
  unchangedCount: number;
}

export function computeMaterialRevisionDiff(
  v1Blocks: ASTBlock[],
  v2Blocks: ASTBlock[]
): BlockDiffResult {
  const v1Map = new Map<string, ASTBlock>(v1Blocks.map((b) => [b.id, b]));
  const v2Map = new Map<string, ASTBlock>(v2Blocks.map((b) => [b.id, b]));

  const addedBlocks: ASTBlock[] = [];
  const removedBlocks: ASTBlock[] = [];
  let unchangedCount = 0;

  for (const [id, block] of v2Map.entries()) {
    if (!v1Map.has(id)) {
      addedBlocks.push(block);
    } else {
      unchangedCount++;
    }
  }

  for (const [id, block] of v1Map.entries()) {
    if (!v2Map.has(id)) {
      removedBlocks.push(block);
    }
  }

  return {
    addedBlocks,
    removedBlocks,
    unchangedCount,
  };
}
