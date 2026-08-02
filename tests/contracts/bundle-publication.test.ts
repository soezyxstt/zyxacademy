import { describe, expect, test } from "bun:test";
import { previewProducts } from "@/lib/bundle/product-preview";
import { productEntitySchema } from "@/lib/bundle/product-validator";

describe("Plan 008 product preview boundary", () => {
  test("renders source and Idea traceability for staged products", () => {
    const product = productEntitySchema.parse({
      id: "question-preview",
      productType: "question",
      courseId: "course-preview",
      chapterId: "chapter-preview",
      version: 1,
      status: "in_review",
      ideaLinks: [{ id: "idea-preview", version: 1, semanticHash: "a".repeat(64), weight: 1, role: "primary" }],
      sourceRefs: [{ sourceId: "source-preview", version: 1, checksum: "b".repeat(64), excerptIds: ["excerpt-preview"] }],
      schemaVersion: "1.0",
      sourceHash: "b".repeat(64),
      generationHash: "a".repeat(64),
      creatorId: "creator-preview",
      questionType: "essay",
      prompt: "Explain the method.",
      options: [],
      difficulty: "medium",
      cognitiveLevel: "analyze",
      reasoningPattern: "derivation",
    });
    const [preview] = previewProducts([product]);
    expect(preview.traceability.ideaIds).toEqual(["idea-preview"]);
    expect(preview.traceability.sourceIds).toEqual(["source-preview"]);
    expect(preview.sections.some((section) => section.label === "prompt")).toBe(true);
  });
});
