import { describe, expect, test } from "bun:test";
import { buildAuthoringContextPack, serializeAuthoringContextPack, scanAuthoringContextPack, type AuthoringContextInput } from "@/lib/authoring/context-pack";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function input(): AuthoringContextInput {
  return {
    snapshotId: "snapshot-007",
    createdAt: "2026-08-03T01:00:00.000Z",
    retentionUntil: "2026-08-10T01:00:00.000Z",
    course: { id: "course-fixture", code: "MAT", title: "Matematika" },
    chapters: [
      { id: "chapter-2", courseId: "course-fixture", code: "B02", title: "Bab dua", orderIndex: 1 },
      { id: "chapter-1", courseId: "course-fixture", code: "B01", title: "Bab satu", orderIndex: 0 },
    ],
    ideas: [
      {
        id: "idea-old", courseId: "course-fixture", chapterId: "chapter-1", stableKey: "course-fixture:velocity", code: "I-OLD",
        canonicalStatement: "Old version", conciseExplanation: "Old", knowledgeKind: "definition", instructionalRole: "core",
        version: 1, status: "published", sourcePolicy: "source_grounded", semanticHash: HASH_A, generationHash: HASH_A, reviewed: true,
      },
      {
        id: "idea-current", courseId: "course-fixture", chapterId: "chapter-1", stableKey: "course-fixture:velocity", code: "I-NEW",
        canonicalStatement: "Current version", conciseExplanation: "Current", knowledgeKind: "definition", instructionalRole: "core",
        version: 2, status: "published", sourcePolicy: "source_grounded", semanticHash: HASH_B, generationHash: HASH_B, reviewed: true,
      },
      {
        id: "idea-draft", courseId: "course-fixture", chapterId: "chapter-1", stableKey: "course-fixture:draft", code: "I-DRAFT",
        canonicalStatement: "Draft", conciseExplanation: "Draft", knowledgeKind: "definition", instructionalRole: "core",
        version: 1, status: "draft", sourcePolicy: "source_grounded", semanticHash: HASH_A, generationHash: HASH_A, reviewed: false,
      },
      {
        id: "idea-unreviewed", courseId: "course-fixture", chapterId: "chapter-2", stableKey: "course-fixture:unreviewed", code: "I-UNREVIEWED",
        canonicalStatement: "Unreviewed", conciseExplanation: "Unreviewed", knowledgeKind: "definition", instructionalRole: "core",
        version: 1, status: "published", sourcePolicy: "source_grounded", semanticHash: HASH_A, generationHash: HASH_A, reviewed: false,
      },
    ],
    sources: [{ id: "source-1", courseId: "course-fixture", chapterId: "chapter-1", title: "Source one", version: 1, checksum: HASH_A, status: "active", citation: "sources/source-one.md" }],
    excerpts: [{ id: "excerpt-1", sourceId: "source-1", sourceVersion: 1, content: "Velocity is displacement over time.", startOffset: 0, endOffset: 34, checksum: HASH_B, sectionLocator: "1.1", pageNumber: 1 }],
    provenance: [{ id: "prov-1", ideaId: "idea-current", excerptId: "excerpt-1", role: "primary", startOffset: 0, endOffset: 34, sourceChecksum: HASH_B }],
    relations: [],
    objectives: [{ id: "objective-1", courseId: "course-fixture", chapterId: "chapter-1", objectiveText: "Explain velocity", bloomLevel: "understand", relatedIdeaIds: ["idea-current"] }],
    requirements: [{ id: "requirement-1", kind: "explanation", text: "Include units", chapterId: "chapter-1" }],
    benchmarks: [
      { id: "benchmark-allowed", referenceId: "itb-reference-allowed", sourceLabel: "UTS Matematika I ITB 2024", datasetKey: "public-set", authoringVisibility: "allowed", version: 1, checksum: HASH_A, status: "active", summary: "Allowed benchmark summary" },
      { id: "benchmark-holdout", datasetKey: "protected-set", authoringVisibility: "holdout", version: 1, checksum: HASH_B, status: "active", summary: "HOLDOUT_CANARY" },
    ],
  };
}

describe("Plan 007 deterministic authoring context pack", () => {
  test("projects only current reviewed published content and counts holdout exclusions", () => {
    const pack = buildAuthoringContextPack(input());
    const ideas = JSON.parse(new TextDecoder().decode(pack.files.get("entities/ideas.json")));
    const benchmarks = JSON.parse(new TextDecoder().decode(pack.files.get("entities/benchmark-summaries.json")));
    expect(ideas.map((idea: { id: string }) => idea.id)).toEqual(["idea-current"]);
    expect(ideas[0]).not.toHaveProperty("creatorId");
    expect(ideas[0]).not.toHaveProperty("curatorId");
    expect(benchmarks).toEqual([{ checksum: HASH_A, datasetKey: "public-set", id: "benchmark-allowed", referenceId: "itb-reference-allowed", sourceLabel: "UTS Matematika I ITB 2024", summary: "Allowed benchmark summary", version: 1 }]);
    expect(pack.files.has("contracts/external-authoring-workflow.json")).toBe(true);
    expect(pack.files.has("contracts/idea-bundle/manifest.schema.json")).toBe(true);
    expect(pack.files.has("contracts/product-bundle/product.schema.json")).toBe(true);
    expect(pack.holdoutExcludedCount).toBe(1);
    expect(scanAuthoringContextPack(pack)).toEqual([]);
    expect(serializeAuthoringContextPack(pack).byteLength).toBeGreaterThan(0);
  });

  test("has the same checksum when input arrays are reordered", () => {
    const first = buildAuthoringContextPack(input());
    const reordered = input();
    reordered.chapters = [...reordered.chapters].reverse();
    reordered.ideas = [...reordered.ideas].reverse();
    reordered.benchmarks = [...(reordered.benchmarks ?? [])].reverse();
    expect(buildAuthoringContextPack(reordered).checksum).toBe(first.checksum);
  });
});
