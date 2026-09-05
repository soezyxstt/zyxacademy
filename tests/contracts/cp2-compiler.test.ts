import { describe, expect, test } from "bun:test";
import { compileArticleProduct } from "@/lib/materials/compiler";
import { LIMIT_ARTICLE_FIXTURE, LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function createV3Article(): any {
  const cloned = structuredClone(LIMIT_ARTICLE_FIXTURE);
  const clonedGraph = structuredClone(LIMIT_EPSILON_DELTA_GRAPH);
  const sourceRefs = structuredClone(cloned.sections[0].sourceRefs);

  const v3Sections = cloned.sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    learningSectionId: s.kind === "topic" ? (s.learningSectionId ?? "ls-limit-formal-definition") : undefined,
    parentSectionId: s.parentSectionId,
    title: s.title,
    slug: s.slug,
    orderIndex: s.orderIndex,
    learningObjective: s.learningObjective,
    ideaIds: structuredClone(s.ideaIds),
    sourceRefs: structuredClone(s.sourceRefs),
    pedagogy: s.pedagogy ? structuredClone(s.pedagogy) : undefined,
    blocks: s.blocks.map((b) => ({
      id: b.id,
      blockType: b.blockType,
      title: b.title,
      orderIndex: b.orderIndex,
      contentMarkdown: b.content,
      ideaIds: structuredClone(b.ideaIds),
      sourceRefs: structuredClone(b.sourceRefs),
      workedExamplePayload: b.workedExamplePayload ? structuredClone(b.workedExamplePayload) : undefined,
      formativeCheckPayload: b.formativeCheckPayload ? structuredClone(b.formativeCheckPayload) : undefined,
    })),
  }));

  return {
    id: "article-limit-definition",
    productType: "article" as const,
    slug: "article-limit-definition",
    title: cloned.title,
    courseId: "kalkulus-1",
    chapterId: "chapter-limit",
    version: 1,
    status: "draft" as const,
    ideaLinks: [{ id: "idea-limit-precision", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs,
    schemaVersion: "1.0",
    sourceHash: sourceRefs[0].checksum,
    generationHash: HASH_A,
    creatorId: "creator-001",
    curatorId: "curator-001",
    blocks: [],
    sections: v3Sections,
    visuals: [clonedGraph],
  };
}

function createV2Article(): any {
  const v2BlockTypes = [
    "prior_knowledge_activation",
    "problem_introduction",
    "explanation",
    "verbal_representation",
    "mathematical_representation",
    "analogy",
    "worked_example",
    "misconception",
    "application",
    "retrieval_prompt",
    "summary",
    "retrieval_close",
  ];

  return {
    id: "article-v2-legacy",
    productType: "article" as const,
    slug: "article-v2-legacy",
    title: "Artikel V2 Kompatibel",
    courseId: "kalkulus-1",
    chapterId: "chapter-01",
    version: 1,
    status: "draft" as const,
    ideaLinks: [{ id: "idea-limit-01", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-calc", version: 1, checksum: HASH_B, excerptIds: ["ex-1"] }],
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: HASH_A,
    creatorId: "creator-001",
    curatorId: "curator-001",
    sections: [],
    blocks: v2BlockTypes.map((blockType, orderIndex) => ({
      id: `block-${orderIndex}`,
      blockType,
      orderIndex,
      content: `${blockType} content text`,
    })),
  };
}

describe("CP2 Compiler Preservation and Negative Gates", () => {
  test("preserves pedagogy, workedExamplePayload, formativeCheckPayload, and visuals through compilation", () => {
    const product = createV3Article();
    const compiled = compileArticleProduct(product, { strict: true });

    expect(compiled.article.sections.length).toBe(3);
    const topicSection = compiled.article.sections.find((s) => s.id === "sec-epsilon-delta");
    expect(topicSection).toBeDefined();
    expect(topicSection?.pedagogy).toBeDefined();
    expect(topicSection?.pedagogy?.objectives.length).toBeGreaterThan(0);

    const workedExampleBlock = topicSection?.blocks.find((b) => b.blockType === "worked_example");
    expect(workedExampleBlock).toBeDefined();
    expect(workedExampleBlock?.workedExamplePayload).toBeDefined();
    expect(workedExampleBlock?.workedExamplePayload?.steps.length).toBe(3);
    expect(workedExampleBlock?.workedExamplePayload?.verification).toContain("delta");

    const formativeBlock = topicSection?.blocks.find((b) => b.blockType === "retrieval_prompt");
    expect(formativeBlock).toBeDefined();
    expect(formativeBlock?.formativeCheckPayload).toBeDefined();
    expect(formativeBlock?.formativeCheckPayload?.checkKind).toBe("multiple_choice");
    expect(formativeBlock?.formativeCheckPayload?.options?.length).toBe(3);

    expect(compiled.article.visuals?.length).toBe(1);
    expect(compiled.article.visuals?.[0].id).toBe("visual-limit-linear-2x-plus-1");

    const astExample = compiled.ast.blocks.find((b) => b.type === "example") as any;
    expect(astExample).toBeDefined();
    expect(astExample.content.solutionSteps.length).toBe(4);
    expect(astExample.content.solutionSteps[0].explanationMarkdown).toContain("Alasan");

    const astExercise = compiled.ast.blocks.find((b) => b.type === "exercise" && b.id.includes("block-ed-chk-mcq")) as any;
    expect(astExercise).toBeDefined();
    expect(astExercise.content.questionType).toBe("multiple_choice");
    expect(astExercise.content.options?.length).toBe(3);
  });

  test("preserves backwards compatibility for V2 articles without sections or visuals", () => {
    const product = createV2Article();
    const compiled = compileArticleProduct(product, { strict: true });

    expect(compiled.article.sections.length).toBe(0);
    expect(compiled.article.blocks.length).toBe(12);
    expect(compiled.ast.blocks.length).toBe(13);
  });

  test("rejects dangling explanation block reference with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.objectives[0].explanationBlockIds = ["block-nonexistent"];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_EXPLANATION_BLOCK",
    );
  });

  test("rejects objective explanation block type mismatch with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.objectives[0].explanationBlockIds = ["block-ed-pka"];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_BLOCK_TYPE_MISMATCH",
    );
  });

  test("rejects dangling formative check block reference with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.objectives[0].formativeCheckBlockIds = ["block-ghost-check"];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_FORMATIVE_CHECK_BLOCK",
    );
  });

  test("rejects dangling prerequisite support block with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.prerequisites.push({
      id: "prereq-missing",
      type: "idea",
      label: "Ide Hilang",
      supportBlockIds: ["block-missing-support"],
    });

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_SUPPORT_BLOCK",
    );
  });

  test("rejects self-referencing section prerequisite with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.prerequisites.push({
      id: section.id,
      type: "section",
      label: "Self reference",
      supportBlockIds: ["block-ed-pka"],
    });

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_SELF_PREREQUISITE",
    );
  });

  test("rejects dangling section prerequisite reference with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.prerequisites.push({
      id: "sec-does-not-exist",
      type: "section",
      label: "Bagian Gaib",
      supportBlockIds: ["block-ed-pka"],
    });

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_SECTION_REFERENCE",
    );
  });

  test("rejects dangling symbol introduction block with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.symbols.push({
      symbol: "theta",
      meaning: "Sudut rotasi",
      introductionBlockId: "block-missing-theta",
    });

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_SYMBOL_BLOCK",
    );
  });

  test("rejects dangling required visual reference with stable code", () => {
    const product = createV3Article();
    const section = product.sections[1];
    section.pedagogy.visualRequirement = {
      status: "required",
      visualIds: ["visual-not-in-registry"],
    };

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_PEDAGOGY_REFERENCE_INVALID:PEDAGOGY_DANGLING_VISUAL_REFERENCE",
    );
  });

  test("rejects non-contiguous worked example steps", () => {
    const product = createV3Article();
    const section = product.sections[1];
    const exampleBlock = section.blocks.find((b: any) => b.blockType === "worked_example");
    exampleBlock.workedExamplePayload.steps = [
      { stepIndex: 0, label: "L1", explanation: "E1", reason: "R1" },
      { stepIndex: 2, label: "L2", explanation: "E2", reason: "R2" },
    ];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Worked example step indexes must be contiguous",
    );
  });

  test("rejects multiple choice formative check with fewer than two options", () => {
    const product = createV3Article();
    const section = product.sections[1];
    const checkBlock = section.blocks.find((b: any) => b.blockType === "retrieval_prompt");
    checkBlock.formativeCheckPayload.options = [{ id: "opt-1", text: "Solo option", isCorrect: true }];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Multiple choice formative checks require at least two options",
    );
  });

  test("rejects multiple choice formative check with duplicate option IDs", () => {
    const product = createV3Article();
    const section = product.sections[1];
    const checkBlock = section.blocks.find((b: any) => b.blockType === "retrieval_prompt");
    checkBlock.formativeCheckPayload.options = [
      { id: "opt-dup", text: "Option A", isCorrect: true },
      { id: "opt-dup", text: "Option B", isCorrect: false },
    ];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Multiple choice option IDs must be unique",
    );
  });

  test("rejects multiple choice formative check with zero or multiple correct options", () => {
    const product = createV3Article();
    const section = product.sections[1];
    const checkBlock = section.blocks.find((b: any) => b.blockType === "retrieval_prompt");
    checkBlock.formativeCheckPayload.options = [
      { id: "opt-1", text: "Option A", isCorrect: true },
      { id: "opt-2", text: "Option B", isCorrect: true },
    ];

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Multiple choice formative check must have exactly one correct option",
    );
  });

  test("rejects security attack vectors in worked examples", () => {
    const product = createV3Article();
    const section = product.sections[1];
    const exampleBlock = section.blocks.find((b: any) => b.blockType === "worked_example");
    exampleBlock.workedExamplePayload.steps[0].explanation = "<script>alert('xss')</script>";

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Forbidden executable or markup pattern detected",
    );
  });

  test("rejects security attack vectors in visuals", () => {
    const product = createV3Article();
    product.visuals[0].label = "<svg onload='alert(1)'>";

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID:Forbidden executable or markup pattern detected",
    );
  });

  test("rejects numeric incoherence in visuals", () => {
    const product = createV3Article();
    product.visuals[0].xBounds = { min: 5, max: 2 };

    expect(() => compileArticleProduct(product, { strict: true })).toThrow(
      "ARTICLE_CONTRACT_INVALID",
    );
  });
});
