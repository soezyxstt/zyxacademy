import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { evaluateIdeaBundleQuality } from "@/lib/authoring/quality/idea-bundle";
import { evaluateProductBundleQuality } from "@/lib/authoring/quality/product-bundle";
import { evaluateSourcePackQuality } from "@/lib/authoring/quality/source-pack";
import type { ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import type { ValidatedSourcePack } from "@/lib/authoring/source-pack";

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourcePackFixture(): { pack: ValidatedSourcePack; original: Uint8Array } {
  const original = new TextEncoder().encode("original document");
  const markdown = new TextEncoder().encode("<!-- source-unit: 1 -->\n# Materi\nIsi.");
  const coverage = new TextEncoder().encode(JSON.stringify({
    documentId: "source-1",
    outputCounts: { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, visualExplanations: 0, questions: 0, solutions: 0 },
  }));
  const pack = {
    archive: { files: new Map([["documents/one.md", markdown], ["coverage/source-1.json", coverage]]), checksum: "archive" },
    manifest: { documents: [{ id: "source-1", title: "Materi", originalSha256: hash(original), markdownPath: "documents/one.md", coveragePath: "coverage/source-1.json" }] },
    documents: [{ id: "source-1", title: "Materi", expectedUnits: 1, sections: [] }],
  } as unknown as ValidatedSourcePack;
  return { pack, original };
}

describe("canonical authoring quality gates", () => {
  test("requires original binaries for Source Pack MCP verification", () => {
    const { pack, original } = sourcePackFixture();
    expect(evaluateSourcePackQuality(pack).valid).toBe(false);
    const report = evaluateSourcePackQuality(pack, new Map([["source-1", original]]));
    expect(report.valid).toBe(true);
    expect(report.metrics.originalVerification).toBe("verified");
  });

  test("reports Idea source coverage and duplicate candidates", () => {
    const bundle = {
      entities: {
        sourceMaterials: [],
        sourceChunks: [{ id: "chunk-1", content: "Definisi konsep yang cukup panjang untuk coverage.", }],
        ideas: [
          { id: "idea-1", canonicalStatement: "Konsep adalah perubahan posisi terhadap waktu.", sourcePolicy: "source_grounded", latex: undefined },
          { id: "idea-2", canonicalStatement: "Konsep adalah perubahan posisi terhadap waktu.", sourcePolicy: "source_grounded", latex: undefined },
        ],
        provenance: [{ ideaId: "idea-1", sourceChunkId: "chunk-1" }],
        relations: [],
      },
    } as unknown as ValidatedIdeaBundle;
    const report = evaluateIdeaBundleQuality(bundle);
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("IDEA_SEMANTIC_DUPLICATE_CANDIDATE");
    expect(report.issues.map((issue) => issue.code)).toContain("IDEA_PROVENANCE_MISSING");
  });

  test("reports shallow Article content", () => {
    const article = {
      id: "article-1",
      productType: "article",
      ideaLinks: [{ id: "idea-1" }],
      blocks: [{ blockType: "explanation", content: "Terlalu pendek." }],
    } as unknown as ProductEntity;
    const report = evaluateProductBundleQuality({ products: [article] });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("ARTICLE_TOO_SHALLOW");
  });

  test("rejects a sectioned Article whose prose density defeats formula-first reading", () => {
    const ideaId = "idea-sectioned-1";
    const explanation = Array.from({ length: 850 }, (_, index) => `penjelasan${index}`).join(" ");
    const retrieval = `Cek ingatan ${Array.from({ length: 48 }, (_, index) => `cek${index}`).join(" ")}`;
    const article = {
      id: "article-sectioned-900",
      productType: "article",
      ideaLinks: [{ id: ideaId }],
      blocks: [],
      sections: [{
        id: "section-1",
        kind: "topic",
        blocks: [
          { id: "explanation-1", blockType: "explanation", contentMarkdown: explanation, ideaIds: [ideaId] },
          { id: "retrieval-1", blockType: "retrieval_prompt", contentMarkdown: retrieval, ideaIds: [ideaId] },
        ],
      }],
    } as unknown as ProductEntity;
    const diktat = {
      id: "diktat-sectioned-900",
      productType: "diktat",
      sourceArticleId: article.id,
      ideaLinks: [{ id: ideaId }],
      contentMarkdown: `# Ringkasan\nCek ingatan ${Array.from({ length: 402 }, (_, index) => `ringkas${index}`).join(" ")}`,
    } as unknown as ProductEntity;

    const report = evaluateProductBundleQuality({ products: [article, diktat] });
    const issueCodes = report.issues.map((issue) => issue.code);
    expect(report.valid).toBe(false);
    expect(issueCodes).toContain("ARTICLE_TOPIC_PROSE_DENSITY_HIGH");
    expect(issueCodes).not.toContain("DIKTAT_TOO_THIN");
    expect(issueCodes).not.toContain("DIKTAT_COMPRESSION_RATIO_HIGH");
    expect(report.metrics.diktats[0]?.compressionRatio).toBe(0.45);
  });

  test("audits bracket math, raw commands, and balance in every Article section", () => {
    const ideaId = "idea-math-audit";
    const article = {
      id: "article-math-audit",
      productType: "article",
      ideaLinks: [{ id: ideaId }],
      blocks: [],
      sections: [
        {
          id: "overview-math-audit",
          kind: "overview",
          blocks: [{ id: "overview-raw-latex", blockType: "explanation", contentMarkdown: "Gunakan \\alpha pada definisi ini.", ideaIds: [ideaId] }],
        },
        {
          id: "topic-math-audit",
          kind: "topic",
          blocks: [
            { id: "topic-explanation", blockType: "explanation", contentMarkdown: "Definisi singkat dengan simbol yang terpisah.", ideaIds: [ideaId] },
            { id: "topic-formula", blockType: "mathematical_representation", contentMarkdown: "\\[x = 1\\]", ideaIds: [ideaId] },
            { id: "topic-retrieval", blockType: "retrieval_prompt", contentMarkdown: "Cek ingatan: apa nilai x?", ideaIds: [ideaId] },
          ],
        },
        {
          id: "summary-math-audit",
          kind: "summary",
          blocks: [{ id: "summary-unbalanced", blockType: "summary", contentMarkdown: "Rumus akhir adalah \\[x = 1", ideaIds: [ideaId] }],
        },
      ],
    } as unknown as ProductEntity;

    const report = evaluateProductBundleQuality({ products: [article] });
    const issueCodes = report.issues.map((issue) => issue.code);
    expect(issueCodes).toContain("ARTICLE_RAW_LATEX_UNWRAPPED");
    expect(issueCodes).toContain("ARTICLE_INVALID_MATH");
    expect(report.metrics.articles[0]?.formulas).toBe(1);
    expect(report.metrics.articles[0]?.sections.find((section) => section.id === "topic-math-audit")?.proseWords).toBeGreaterThan(0);
  });

  test("does not require optional Diktat examples or misconceptions and counts only rendered visuals", () => {
    const ideaId = "idea-optional-diktat";
    const article = {
      id: "article-optional-diktat",
      productType: "article",
      ideaLinks: [{ id: ideaId }],
      blocks: [],
      visuals: [{ id: "unreferenced-visual" }],
      sections: [{
        id: "topic-optional-diktat",
        kind: "topic",
        blocks: [
          { id: "optional-explanation", blockType: "explanation", contentMarkdown: "Materi utama ".repeat(80), ideaIds: [ideaId] },
          { id: "optional-example", blockType: "worked_example", contentMarkdown: "Contoh yang boleh diringkas.", ideaIds: [ideaId] },
          { id: "optional-misconception", blockType: "misconception", contentMarkdown: "Kesalahan umum yang tidak wajib masuk Diktat.", ideaIds: [ideaId] },
          { id: "optional-retrieval", blockType: "retrieval_prompt", contentMarkdown: "Cek ingatan: sebutkan definisinya.", ideaIds: [ideaId] },
        ],
      }],
    } as unknown as ProductEntity;
    const diktat = {
      id: "diktat-optional-diktat",
      productType: "diktat",
      sourceArticleId: article.id,
      ideaLinks: [{ id: ideaId }],
      contentMarkdown: `# Ringkasan\nCek ingatan ${"kata ".repeat(70)}`,
    } as unknown as ProductEntity;

    const report = evaluateProductBundleQuality({ products: [article, diktat] });
    const issueCodes = report.issues.map((issue) => issue.code);
    expect(issueCodes).not.toContain("DIKTAT_EXAMPLES_COVERAGE_LOW");
    expect(issueCodes).not.toContain("DIKTAT_TRAPS_COVERAGE_LOW");
    expect(report.metrics.diktats[0]?.visuals).toBe(0);
  });

  test("flags repeated prose, crowded formulas, and missing section visuals", () => {
    const repeated = "Kurva awal menjadi pembanding agar arah dan besar perubahan terlihat jelas oleh mahasiswa.";
    const article = {
      id: "article-transform",
      productType: "article",
      ideaLinks: [{ id: "idea-transform" }],
      blocks: [],
      sections: [{
        id: "section-transform",
        kind: "topic",
        title: "Transformasi grafik fungsi",
        blocks: [
          { id: "explain", blockType: "explanation", contentMarkdown: repeated, ideaIds: ["idea-transform"] },
          { id: "formula", blockType: "mathematical_representation", contentMarkdown: "$$f(x)+k, f(x-k), cf(x)$$", ideaIds: ["idea-transform"] },
          { id: "repeat", blockType: "worked_example", contentMarkdown: `${repeated}\n\nLangkah: lakukan perubahan. Verifikasi: uji hasil.`, ideaIds: ["idea-transform"], workedExamplePayload: { steps: [{ stepIndex: 0, label: "Terapkan", explanation: "Ubah rumus.", reason: "Geser kurva." }], verification: "Uji titik pada kurva hasil." } },
          { id: "check", blockType: "retrieval_prompt", contentMarkdown: "Apa perubahan kurvanya?", ideaIds: ["idea-transform"] },
        ],
      }],
    } as unknown as ProductEntity;
    const codes = evaluateProductBundleQuality({ products: [article] }).issues.map((issue) => issue.code);
    expect(codes).toContain("ARTICLE_REPEATED_PASSAGE");
    expect(codes).toContain("ARTICLE_FORMULA_CROWDED");
    expect(codes).toContain("ARTICLE_VISUAL_OPPORTUNITY_MISSING");
    expect(codes).toContain("ARTICLE_VERIFICATION_REPEATED");
    expect(codes).toContain("ARTICLE_STEPS_REPEATED");
  });

  test("flags crowded bracket-delimited display math", () => {
    const article = {
      id: "article-bracket-formula",
      productType: "article",
      ideaLinks: [{ id: "idea-formula" }],
      blocks: [],
      sections: [{ id: "section-formula", kind: "topic", title: "Rumus fungsi", blocks: [
        { id: "formula", blockType: "mathematical_representation", contentMarkdown: "\\[f(x), g(x), h(x)\\]", ideaIds: ["idea-formula"] },
      ] }],
    } as unknown as ProductEntity;
    const codes = evaluateProductBundleQuality({ products: [article] }).issues.map((issue) => issue.code);
    expect(codes).toContain("ARTICLE_FORMULA_CROWDED");
  });

  test("keeps set commas and inequalities out of false quality warnings", () => {
    const article = {
      id: "article-sets",
      productType: "article",
      ideaLinks: [{ id: "idea-sets" }],
      blocks: [],
      sections: [{
        id: "section-sets",
        kind: "topic",
        title: "Himpunan bilangan",
        blocks: [
          { id: "formula", blockType: "mathematical_representation", contentMarkdown: "$$\\mathbb{N}=\\{1,2,3,\\ldots\\}\\subset\\mathbb{Z}$$", ideaIds: ["idea-sets"] },
          { id: "explain", blockType: "explanation", contentMarkdown: `${"Untuk x<1 atau x>3, periksa batas pada garis bilangan. ".repeat(16)}`, ideaIds: ["idea-sets"] },
          { id: "check", blockType: "retrieval_prompt", contentMarkdown: "Di mana nilai x berada?", ideaIds: ["idea-sets"] },
        ],
      }],
    } as unknown as ProductEntity;
    const report = evaluateProductBundleQuality({ products: [article] });
    expect(report.issues.map((issue) => issue.code)).not.toContain("ARTICLE_FORMULA_CROWDED");
    expect(report.metrics.articles[0]?.sections[0]?.wordCount).toBeGreaterThan(150);
  });

  test("accepts a short list of separate display formulas", () => {
    const article = {
      id: "article-formula-list",
      productType: "article",
      ideaLinks: [{ id: "idea-formula-list" }],
      blocks: [],
      sections: [{
        id: "section-formula-list",
        kind: "topic",
        blocks: [
          { id: "formula-list", blockType: "mathematical_representation", contentMarkdown: "- $$f(x)+k$$\n- $$f(x-k)$$", ideaIds: ["idea-formula-list"] },
          { id: "explanation", blockType: "explanation", contentMarkdown: "Perubahan di luar dan di dalam argumen menggeser grafik pada arah berbeda.", ideaIds: ["idea-formula-list"] },
          { id: "retrieval", blockType: "retrieval_prompt", contentMarkdown: "Ke mana grafik bergeser?", ideaIds: ["idea-formula-list"] },
        ],
      }],
    } as unknown as ProductEntity;
    const codes = evaluateProductBundleQuality({ products: [article] }).issues.map((issue) => issue.code);
    expect(codes).not.toContain("ARTICLE_FORMULA_PROSE_MIXED");
    expect(codes).not.toContain("ARTICLE_INVALID_MATH");
  });
});
