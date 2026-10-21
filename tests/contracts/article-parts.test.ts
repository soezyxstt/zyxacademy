import { describe, expect, test } from "bun:test";
import { articlePartsSchema, materializeArticleParts } from "@/lib/materials/article-parts";
describe("ordered Article parts", () => {
 test("projects explanation and conditions beside each formula in author order", () => {
  const parts = articlePartsSchema.parse([{ id: "intro", kind: "markdown", markdown: "Opening" }, { id: "formula", kind: "math_unit", latex: "x=1", meaningMarkdown: "Meaning", conditionsMarkdown: "Condition" }, { id: "graph", kind: "visual_ref", visualId: "v1" }]);
  expect(materializeArticleParts(parts)).toBe("Opening\n\n$$\nx=1\n$$\n\nMeaning\n\nCondition\n\n<!-- visual:v1 -->");
 });
 test("rejects duplicate anchors, unknown kinds, missing meanings and unsafe payloads", () => {
  expect(articlePartsSchema.safeParse([{ id: "a", kind: "markdown", markdown: "a" }, { id: "a", kind: "markdown", markdown: "b" }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ id: "a", kind: "math_unit", latex: "x" }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ id: "a", kind: "code", markdown: "a" }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ id: "a", kind: "markdown", markdown: "<script>alert(1)</script>" }]).success).toBe(false);
 });
});

import { articleCaseLatex, collectArticlePartIds, collectArticleVisualIds, validateArticlePartReferences } from "@/lib/materials/article-parts";
import { semanticArticleParts } from "@/tests/fixtures/product-learning/article-semantics";

describe("V4 semantic math and trace", () => {
 test("retains all local meanings, symbols, conditions and step reasons in search projection", () => {
  const text = materializeArticleParts(semanticArticleParts);
  expect(validateArticlePartReferences(semanticArticleParts)).toEqual([]);
  expect(collectArticlePartIds(semanticArticleParts)).toContain("cancel-step");
  expect(text).toContain("Titik domain yang sedang diuji.");
  expect(text).toContain("Pembagian oleh nol tetap dilarang.");
  expect(text.indexOf("Faktorkan pembilang")).toBeLessThan(text.indexOf("Sederhanakan faktor"));
  expect(text).not.toContain("undefined");
 });
 test("rejects unresolved symbols, ambiguous formula sources, unknown fields, missing local meanings and duplicate relation anchors", () => {
  const base = { id: "m", kind: "math_unit", latex: "x", meaningMarkdown: "Input" };
  expect(articlePartsSchema.safeParse([{ ...base, symbolRefs: ["x"] }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ ...base, script: "alert(1)" }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ ...base, relations: [{ id: "r", latex: "x", meaningMarkdown: "Input" }] }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ ...base, latex: undefined, relations: [{ id: "r", latex: "x" }] }]).success).toBe(false);
  expect(articlePartsSchema.safeParse([{ ...base, latex: undefined, relations: [{ id: "r", latex: "x", meaningMarkdown: "Input" }, { id: "r", latex: "y", meaningMarkdown: "Output" }] }]).success).toBe(false);
 });
 test("cases preserve mathematical conditions and reject absent branches", () => {
  const part = semanticArticleParts.find((part) => part.id === "piecewise");
  if (part?.kind !== "math_unit") throw Error("fixture missing");
  expect(articleCaseLatex(part)).toBe("\\begin{cases}-x & x<0 \\\\ x & x\\ge0\\end{cases}");
  expect(articlePartsSchema.safeParse([{ ...part, relations: part.relations?.map((relation) => ({ ...relation, conditionLatex: undefined })) }]).success).toBe(false);
 });
 test("resolves focus and step references across blocks, but rejects cycles, missing visuals and duplicate IDs", () => {
  const visual = { id: "graph", kind: "visual_ref", visualId: "v", focusRefs: ["cancel-step"] } as const;
  const parts = articlePartsSchema.parse([...semanticArticleParts, visual]);
  expect(validateArticlePartReferences(parts, ["v"])).toEqual([]);
  expect(collectArticleVisualIds(parts)).toEqual(["v"]);
  expect(validateArticlePartReferences(parts, [])).toContain("ARTICLE_PART_VISUAL_MISSING");
  const example = parts.find((part) => part.kind === "worked_example");
  if (example?.kind !== "worked_example") throw Error("fixture missing");
  const cyclic = { ...example, steps: example.steps.map((step, index) => index === 0 ? { ...step, sourceElementRefs: ["cancel-step"] } : step) };
  expect(validateArticlePartReferences([...parts.filter((part) => part.kind !== "worked_example"), cyclic])).toContain("ARTICLE_STEP_SOURCE_REF_MISSING");
  expect(validateArticlePartReferences([...parts, ...parts])).toContain("ARTICLE_PART_ID_DUPLICATE");
 });
 test("preserves authored currency and code text instead of guessing formulas", () => {
  const markdown = "Biaya $10, kode `x^2`, dan simbol $\\delta$.";
  expect(materializeArticleParts(articlePartsSchema.parse([{ id: "text", kind: "markdown", markdown }]))).toBe(markdown);
 });
});
