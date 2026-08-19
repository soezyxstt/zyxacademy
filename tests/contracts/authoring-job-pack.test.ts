import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { buildAuthoringJobPack, validateAuthoringJobPack } from "@/lib/authoring/job-pack";
import { validateSourcePack } from "@/lib/authoring/source-pack";

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value)}\n`);
}

function sourcePackFixture(): Uint8Array {
  const material = strToU8("<!-- source-unit: 1 -->\n# Vektor\nBesaran memiliki arah.\n<!-- source-unit: 2 -->\n## Magnitudo\nMagnitudo adalah panjang vektor.\n");
  const questions = strToU8("<!-- source-unit: 1 -->\n# Latihan vektor\nSoal 1. Tentukan magnitudo.\n");
  const coverage = (documentId: string, expectedUnits: number, questionsCount: number) => ({
    documentId,
    status: "complete",
    expectedUnits,
    processedUnits: Array.from({ length: expectedUnits }, (_, index) => index + 1),
    inventory: { headings: expectedUnits, formulas: 0, tables: 0, examples: 0, applications: 0, visuals: 0, questions: questionsCount, solutions: 0 },
    outputCounts: { headings: expectedUnits, formulas: 0, tables: 0, examples: 0, applications: 0, visualExplanations: 0, questions: questionsCount, solutions: 0 },
    unresolved: [],
    reviewPasses: ["inventory", "transcription", "visual", "reconciliation"],
  });
  const manifest = {
    schemaVersion: "zyx-source-pack.v1",
    packId: "source-pack-vektor",
    name: "Vektor dasar",
    language: "id",
    createdAt: "2026-08-13T00:00:00.000Z",
    generator: { provider: "google", model: "gemini-test", promptVersion: "source-pack-translator.v1" },
    documents: [
      {
        id: "source-doc-001",
        title: "Materi vektor",
        originalFilename: "materi.pdf",
        originalMediaType: "application/pdf",
        originalSha256: "a".repeat(64),
        role: "material",
        unitKind: "page",
        expectedUnits: 2,
        markdownPath: "documents/001-materi.md",
        coveragePath: "coverage/source-doc-001.json",
        markdownSha256: hash(material),
      },
      {
        id: "source-doc-002",
        title: "Soal vektor",
        originalFilename: "soal.pdf",
        originalMediaType: "application/pdf",
        originalSha256: "b".repeat(64),
        role: "question",
        unitKind: "page",
        expectedUnits: 1,
        markdownPath: "documents/002-soal.md",
        coveragePath: "coverage/source-doc-002.json",
        markdownSha256: hash(questions),
      },
    ],
  };
  return zipSync({
    "manifest.json": json(manifest),
    "documents/001-materi.md": material,
    "documents/002-soal.md": questions,
    "coverage/source-doc-001.json": json(coverage("source-doc-001", 2, 0)),
    "coverage/source-doc-002.json": json(coverage("source-doc-002", 1, 1)),
  });
}

const course = {
  id: "course-physics",
  code: "FIS101",
  title: "Fisika dasar",
  chapters: [
    { id: "chapter-vector", code: "B01", title: "Vektor", orderIndex: 0 },
    { id: "chapter-exercise", code: "B02", title: "Latihan", orderIndex: 1 },
  ],
};

describe("Authoring Job Pack", () => {
  test("accepts material and question documents without inventing a solution document", () => {
    const source = validateSourcePack(sourcePackFixture());
    expect(source.documents).toHaveLength(2);
    expect(source.documents.reduce((total, document) => total + document.counts.solutions, 0)).toBe(0);
  });

  test("builds and revalidates one self-contained job with exact section mappings", () => {
    const pack = buildAuthoringJobPack({
      sourcePackBytes: sourcePackFixture(),
      course,
      mappings: [
        { sectionId: "source-doc-001:section:001", chapterId: "chapter-vector" },
        { sectionId: "source-doc-001:section:002", chapterId: "chapter-vector" },
        { sectionId: "source-doc-002:section:001", chapterId: "chapter-exercise" },
      ],
      requestedProducts: ["article", "diktat", "flashcard", "question", "solution", "assessment_blueprint"],
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    const validated = validateAuthoringJobPack(pack.bytes);
    expect(validated.job.target).toEqual({ courseId: "course-physics", courseCode: "FIS101", courseLabel: "Fisika dasar" });
    expect(validated.job.sectionMappings).toHaveLength(3);
    expect(validated.job.attribution).toEqual({ creatorId: "$UPLOADER", curatorId: "$APPROVING_REVIEWER" });
    expect(validated.job.workflow.ideaPublicationRequiredBeforeProducts).toBe(true);
    expect(unzipSync(pack.bytes)["contracts/product-bundle/product.schema.json"]).toBeDefined();
  });

  test("rejects incomplete mapping and tampered files", () => {
    expect(() => buildAuthoringJobPack({
      sourcePackBytes: sourcePackFixture(),
      course,
      mappings: [{ sectionId: "source-doc-001:section:001", chapterId: "chapter-vector" }],
      requestedProducts: ["article"],
    })).toThrow("AUTHORING_JOB_MAPPING_INCOMPLETE");

    const pack = buildAuthoringJobPack({
      sourcePackBytes: sourcePackFixture(),
      course,
      mappings: [
        { sectionId: "source-doc-001:section:001", chapterId: "chapter-vector" },
        { sectionId: "source-doc-001:section:002", chapterId: "chapter-vector" },
        { sectionId: "source-doc-002:section:001", chapterId: "chapter-exercise" },
      ],
      requestedProducts: ["article"],
    });
    const files = unzipSync(pack.bytes);
    files["authoring-job.json"] = strToU8("{}\n");
    expect(() => validateAuthoringJobPack(zipSync(files))).toThrow("AUTHORING_JOB_FILE_CHECKSUM_MISMATCH");
  });
});
