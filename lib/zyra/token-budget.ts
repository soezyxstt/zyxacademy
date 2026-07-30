/**
 * Zyra Token Budget Allocator
 * Defines layer-based token allocation and priority rules for multi-layer Zyra context building.
 */
export const DEFAULT_MAX_TOKENS = 12000;

export const LAYER_PRIORITY: Array<{
  layer: string;
  priority: number;
  maxTokens: number;
}> = [
  { layer: "currentQuestion", priority: 1, maxTokens: 500 },
  { layer: "retrievalMemory", priority: 2, maxTokens: 3000 },
  { layer: "conversationMemory", priority: 3, maxTokens: 2500 },
  { layer: "courseMemory", priority: 4, maxTokens: 1000 },
  { layer: "masteryMemory", priority: 5, maxTokens: 2000 },
  { layer: "learningMemory", priority: 6, maxTokens: 1500 },
];

export interface TokenBudget {
  maxTokens: number;
  allocated: Record<string, number>;
  remaining: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function calculateTokenBudget(
  question: string,
  retrievalSources: number,
  conversationMessages: number,
  overrideMaxTokens?: number
): TokenBudget {
  const maxTokens = overrideMaxTokens ?? DEFAULT_MAX_TOKENS;
  const questionTokens = estimateTokens(question);

  const allocated: Record<string, number> = {};
  let total = questionTokens;

  allocated.currentQuestion = Math.min(questionTokens, 500);
  allocated.retrievalMemory = Math.min(retrievalSources * 500, 3000);
  allocated.conversationMemory = Math.min(conversationMessages * 125, 2500);
  allocated.courseMemory = 1000;
  allocated.masteryMemory = 2000;
  allocated.learningMemory = 1500;

  for (const entry of LAYER_PRIORITY) {
    total += allocated[entry.layer] ?? 0;
    if (total > maxTokens) {
      allocated[entry.layer] = Math.max(0, allocated[entry.layer] - (total - maxTokens));
      total = maxTokens;
    }
  }

  const used = Object.values(allocated).reduce((a, b) => a + b, 0);

  return {
    maxTokens,
    allocated,
    remaining: Math.max(0, maxTokens - used),
  };
}

export function formatBudgetSummary(budget: TokenBudget): string {
  const lines = Object.entries(budget.allocated)
    .sort(([, a], [, b]) => b - a)
    .map(([layer, tokens]) => `  ${layer}: ${tokens} tokens`);

  return [
    `Budget: ${budget.remaining}/${budget.maxTokens} tokens remaining`,
    ...lines,
  ].join("\n");
}