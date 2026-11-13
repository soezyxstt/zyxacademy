import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { expandedSolutionCollectionFixture, solutionCollectionFixture, markdownCodeSolutionCollectionFixture } from "@/app/visual-fixtures/solution-collection/fixture";
import { parseSolutionCollection, solutionCollectionSchema, validateSolutionCollection } from "@/lib/materials/solution-collection";

function fixture() { return structuredClone(solutionCollectionFixture); }
function messages(input: unknown) {
  const result = validateSolutionCollection(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("solution_collection.v1", () => {
  test("parses independently authored math and programming with separate provenance", () => {
    const collection = parseSolutionCollection(fixture());
    expect(collection.release).toBe("released_learning_content");
    expect(collection.items.map((item) => item.template)).toEqual(["calculation", "code_trace"]);
    expect(collection.items[0].provenance.problem.kind).toBe("original");
    expect(collection.items[0].provenance.solution.kind).toBe("original");
  });

  test("accepts independently authored Markdown code in both prompts and worked steps", () => {
    const collection = parseSolutionCollection(markdownCodeSolutionCollectionFixture);
    const item = collection.items.find(item => item.id === "python-loop")!;
    expect(item.prompt.some(part => part.kind === "markdown" && part.markdown.includes("```\n"))).toBe(true);
    expect(item.steps[0].operationMarkdown).toContain("```python");
  });

  test("rejects snapshots, unknown fields, missing solution provenance, and unlocated adapted sources", () => {
    const value = fixture() as any;
    value.release = "question_bank_snapshot";
    value.items[0].privateTests = [{ input: "secret" }];
    delete value.items[0].provenance.solution;
    expect(validateSolutionCollection(value).success).toBe(false);
    const adapted = fixture();
    adapted.items[0].provenance.problem.kind = "adapted";
    expect(messages(adapted)).toContain("SOLUTION_SOURCE_REQUIRED");
  });

  test("enforces unique identifiers across items, steps, options, parts and visuals", () => {
    const value = fixture();
    value.items[1].steps[0].id = value.items[0].options[0].id;
    expect(messages(value)).toContain("SOLUTION_ID_DUPLICATE");
    const repeatedPart = fixture();
    repeatedPart.items[1].prompt[0].id = repeatedPart.items[0].prompt[0].id;
    expect(messages(repeatedPart)).toContain("SOLUTION_ID_DUPLICATE");
  });

  test("validates option answers and compatible question templates", () => {
    const value = fixture();
    value.items[0].answer.optionIds = ["missing"];
    expect(messages(value)).toContain("SOLUTION_ANSWER_OPTION_INVALID");
    value.items[0].answer.optionIds = ["triangle-a", "triangle-b"];
    expect(messages(value)).toContain("SOLUTION_ANSWER_OPTION_COUNT");
    value.items[0].template = "code_trace";
    expect(messages(value)).toContain("SOLUTION_CODE_DISCIPLINE_MISMATCH");
    value.items[0].questionType = "essay";
    expect(messages(value)).toContain("SOLUTION_TEMPLATE_TYPE_MISMATCH");
  });

  test("reuses article validation for visual, focus and step references", () => {
    const value = fixture() as any;
    value.items[0].steps[0].parts[0].visualId = "missing";
    expect(messages(value)).toContain("ARTICLE_PART_VISUAL_MISSING");
    value.items[0].steps[0].parts[0].visualId = "triangle-diagram";
    value.items[0].steps[0].parts[0].focusRefs = ["missing"];
    expect(messages(value)).toContain("ARTICLE_FOCUS_REF_MISSING");
    value.items[0].steps[0].parts = [{ id: "example", kind: "worked_example", title: "Contoh", problemMarkdown: "Soal", verificationMarkdown: "Periksa", steps: [{ id: "inner-step", operationMarkdown: "Hitung", reasonMarkdown: "Aturan", sourceElementRefs: ["missing"], parts: [{ id: "inner-part", kind: "markdown", markdown: "Isi" }] }] }];
    expect(messages(value)).toContain("ARTICLE_STEP_SOURCE_REF_MISSING");
  });

  test("rejects private coding references and unsafe content while allowing authored code", () => {
    const value = fixture() as any;
    value.items[1].prompt.push({ id: "private-reference", kind: "coding_exercise", problem: { problemId: "bank-problem", version: 1 } });
    expect(messages(value)).toContain("SOLUTION_PRIVATE_CODING_REFERENCE_FORBIDDEN");
    const unsafe = fixture();
    unsafe.items[0].steps[0].reasonMarkdown = '<script>alert(1)</script>';
    expect(messages(unsafe)).toContain("SOLUTION_CONTENT_UNSAFE");
    const embedded = fixture() as any;
    embedded.items[1].prompt[0].markdown = "<!--__ZYX_V4_BLOCK_PAYLOAD__:eyJwYXJ0cyI6W119-->";
    expect(messages(embedded)).toContain("SOLUTION_EMBEDDED_PAYLOAD_FORBIDDEN");
    embedded.items[1].prompt[0].markdown = "```zyx-visual\n{}\n```";
    expect(messages(embedded)).toContain("SOLUTION_EMBEDDED_PAYLOAD_FORBIDDEN");
    expect(validateSolutionCollection(fixture()).success).toBe(true);
  });

  test("requires static code examples throughout a solution collection", () => {
    const invalid = fixture() as any;
    const example = invalid.items[1].prompt.find((part: { kind: string }) => part.kind === "code_example");
    example.runnable = true;
    expect(messages(invalid)).toContain("SOLUTION_RUNNABLE_CODE_EXAMPLE_FORBIDDEN: solution collection code examples must set runnable to false");
    delete example.runnable;
    expect(messages(invalid)).toContain("SOLUTION_RUNNABLE_CODE_EXAMPLE_FORBIDDEN: solution collection code examples must set runnable to false");
    example.runnable = false;
    expect(validateSolutionCollection(invalid).success).toBe(true);
    const construction = expandedSolutionCollectionFixture.items.find((item) => item.id === "shortest-subarray");
    expect(construction?.template).toBe("code_construction");
    expect(construction?.answer.parts.some((part) => part.kind === "code_example" && !part.runnable)).toBe(true);
    const schema = z.toJSONSchema(solutionCollectionSchema, { io: "input", unrepresentable: "any" });
    expect(JSON.stringify(schema)).toContain("Every code_example must explicitly set runnable to false");
    const variants: any[] = [];
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if ((value as any).properties?.kind?.const === "code_example") variants.push(value);
      Object.values(value).forEach(visit);
    };
    visit(schema);
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      expect(variant.properties.runnable.const).toBe(false);
      expect(variant.required).toContain("runnable");
    }
  });

  test("keeps an optional hint separate, bounded and text-only while leaving full strategies private", () => {
    const value = fixture();
    value.items[0].hintMarkdown = "Perhatikan sisi tegak lurus.";
    expect(parseSolutionCollection(value).items[0].hintMarkdown).toBe("Perhatikan sisi tegak lurus.");
    value.items[0].hintMarkdown = "```python\nprint(12)\n```";
    expect(messages(value)).toContain("SOLUTION_HINT_TEXT_ONLY");
    value.items[0].hintMarkdown = "x".repeat(1201);
    expect(validateSolutionCollection(value).success).toBe(false);
    delete value.items[0].hintMarkdown;
    value.items[0].strategy = [{ id: "strategy-with-answer", kind: "markdown", markdown: "Jawaban lengkap adalah 12." }];
    expect(parseSolutionCollection(value).items[0].hintMarkdown).toBeUndefined();
  });

  test("allows an empty collection for a safe reader empty state", () => {
    const value = fixture();
    value.items = [];
    expect(validateSolutionCollection(value).success).toBe(true);
  });
});
