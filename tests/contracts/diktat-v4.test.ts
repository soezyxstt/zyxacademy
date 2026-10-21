import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, validateAuthoredDiktat } from "@/lib/materials/diktat-v4";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const hash = "a".repeat(64);
const article = { id: "article", version: 1, generationHash: hash, visuals: [{ ...LIMIT_EPSILON_DELTA_GRAPH, id: "limit-graph" }], ideaLinks: [{ id: "limit" }], sections: [{ blocks: [{ parts: [
  { id: "formula", kind: "math_unit" as const, latex: "x^2", meaningMarkdown: "Kuadrat x.", conditionsMarkdown: "x real." },
  { id: "graph", kind: "visual_ref" as const, visualId: "limit-graph" },
] }] }] };
const units = authoredDiktatUnitsSchema.parse([{ id: "summary", sourceElementRefs: ["formula", "graph"], ideaIds: ["limit"], parts: [
  { id: "summary-formula", kind: "math_unit", latex: "x^2", meaningMarkdown: "Kuadrat x.", conditionsMarkdown: "x real." },
  { id: "summary-graph", kind: "visual_ref", visualId: "limit-graph", staticMarkdown: "Pada x = 0, nilai fungsi mendekati 0 dari kedua sisi." },
] }]);
const diktat = { sourceArticleId: "article", sourceArticleVersion: 1, sourceArticleHash: hash, units };

describe("authored Diktat V4 structural checks", () => {
  test("accepts traced authored summary and materializes printable fallback in order", () => {
    assert.deepEqual(validateAuthoredDiktat(article, diktat), []);
    const markdown = materializeAuthoredDiktat(units);
    assert.ok(markdown.indexOf("x^2") < markdown.indexOf("Pada x"));
    assert.ok(!markdown.includes("<!-- visual:"));
  });
  test("rejects stale lineage, missing refs, lost Ideas and formula conditions", () => {
    assert.ok(validateAuthoredDiktat(article, { ...diktat, sourceArticleVersion: 2 }).includes("DIKTAT_LINEAGE_MISMATCH"));
    assert.ok(validateAuthoredDiktat(article, { ...diktat, units: [{ ...units[0], sourceElementRefs: ["missing"] }] }).includes("DIKTAT_SOURCE_ELEMENT_MISSING"));
    assert.ok(validateAuthoredDiktat(article, { ...diktat, units: [{ ...units[0], ideaIds: ["other"] }] }).includes("DIKTAT_IDEA_COVERAGE_INVALID"));
    const missingConditions = structuredClone(units);
    if (missingConditions[0].parts[0].kind === "math_unit") delete missingConditions[0].parts[0].conditionsMarkdown;
    assert.ok(validateAuthoredDiktat(article, { ...diktat, units: missingConditions }).includes("DIKTAT_CONDITIONS_MISSING"));
  });
  test("rejects missing static fallback and executable payloads", () => {
    assert.equal(authoredDiktatUnitsSchema.safeParse([{ ...units[0], parts: [{ id: "v", kind: "visual_ref", visualId: "limit-graph" }] }]).success, false);
    assert.equal(authoredDiktatUnitsSchema.safeParse([{ ...units[0], parts: [{ id: "unsafe", kind: "markdown", markdown: "<script>alert(1)</script>" }] }]).success, false);
  });
  test("rejects duplicate nested IDs and ungrounded worked-example steps", () => {
    const worked = { id: "example", kind: "worked_example" as const, title: "Example", problemMarkdown: "Compute.", verificationMarkdown: "Checked.", steps: [{ id: "step", operationMarkdown: "Square.", reasonMarkdown: "Definition.", sourceElementRefs: ["missing"], parts: [{ id: "nested", kind: "markdown" as const, markdown: "Result." }] }] };
    const exampleUnits = [{ ...units[0], parts: [...units[0].parts, worked] }];
    assert.ok(validateAuthoredDiktat(article, { ...diktat, units: exampleUnits }).includes("DIKTAT_STEP_SOURCE_REF_MISSING"));
    assert.equal(authoredDiktatUnitsSchema.safeParse([{ ...units[0], parts: [...units[0].parts, { ...worked, steps: [{ ...worked.steps[0], id: "summary-formula" }] }] }]).success, false);
  });
});
