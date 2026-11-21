import { expect, test } from "bun:test";
import { eligibleSelectorModel, modelDisplayName, officialRelease, recentlyReleased } from "../../lib/ai/provider/recent-models";

test("uses six UTC calendar months and rejects unknown, invalid and future dates", () => {
  const now = new Date("2026-11-20T14:00:00Z");
  expect(recentlyReleased("2026-05-20", now)).toBe(true);
  for (const date of ["2026-05-19", "2026-11-21", "2026-06-31", undefined])
    expect(recentlyReleased(date, now)).toBe(false);
  expect(recentlyReleased("2026-02-28", new Date("2026-08-31T00:00:00Z"))).toBe(true);
});

test("matches the publisher and displays the verified model name", () => {
  expect(modelDisplayName("gpt-6.2-sol")).toBe("GPT 6.2 Sol");
  expect(officialRelease("gpt-6.2-sol", "openai")?.released).toBe("2026-11-17");
  expect(officialRelease("gpt-6.2-sol", "meta")).toBeUndefined();
  expect(officialRelease("gpt-undocumented", "openai")).toBeUndefined();
  expect(officialRelease("toString")).toBeUndefined();
  expect(officialRelease("deepseek-flash")?.released).toBe("2026-09-10");
});

test("includes documented variants and limits the age exception to routable Gemma", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  for (const id of ["gemini-4-argon", "gemini-4-carbon", "gemini-4-hydrogen", "gemma-4-31b-it",
    "muse-spark-1.2", "muse-spark-1.2-contributor", "muse-spark-1.3-contributor", "gpt-6.1-terra", "gpt-6-luna"]) {
    expect(eligibleSelectorModel(id, now)).toBe(true);
  }
  expect(eligibleSelectorModel("gemma-4-26b-a4b-it", now)).toBe(false);
  expect(eligibleSelectorModel("gemini-3.5-flash", now)).toBe(false);
});
