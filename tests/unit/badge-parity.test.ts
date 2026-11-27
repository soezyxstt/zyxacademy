import { expect, test } from "bun:test";

import { badgeCases, betaBadgeCases, quizInsightsBadgeTabs } from "../../packages/ui-parity/badge-cases";
import { componentNames, galleryCases } from "../../packages/ui-parity/gallery";

test("both galleries register all three Badge variants as separate cases", () => {
  expect(componentNames).toContain("badge");
  expect(galleryCases.filter(item => item.component === "badge").map(item => item.id)).toEqual(badgeCases.map(item => item.id));
  expect(badgeCases.map(({ variant, label }) => [variant, label])).toEqual([
    ["default", "Rekomendasi"],
    ["secondary", "Ujian ITB"],
    ["outline", "Belum disimpan"],
  ]);
});

test("both galleries register three Quiz Insights BetaBadge contexts", () => {
  expect(componentNames).toContain("beta-badge");
  expect(galleryCases.filter(item => item.component === "beta-badge").map(item => item.id)).toEqual(betaBadgeCases.map(item => item.id));
  expect(betaBadgeCases.map(({ theme, selected }) => [theme, selected])).toEqual([
    ["light", "ai-insights"],
    ["light", "questions"],
    ["dark", "ai-insights"],
  ]);
  expect(quizInsightsBadgeTabs.find(item => item.value === "ai-insights")?.label).toBe("Evaluasi AI");
});
