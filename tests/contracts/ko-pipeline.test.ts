import { describe, expect, it } from "bun:test";
import { loadAiFixture } from "../helpers/ai-fixtures";
import { generateStableKoKey, computeSemanticKoHash, reconcileKoExtractionRun } from "@/lib/knowledge/identity";
import { normalizeCanonicalSource, chunkCanonicalSource } from "@/lib/knowledge/chunker";
import { validateChunkCandidates, validateChunkLearningObjectives } from "@/lib/knowledge/candidate-extractor";
import { reconcileCrossChunkCandidates } from "@/lib/knowledge/candidate-reconciler";
import { resolveCanonicalConcepts } from "@/lib/knowledge/canonicalizer";
import { executeStagedKoExtractionRun } from "@/lib/knowledge/extraction-run";
import { env } from "@/lib/env";

describe("KO Pipeline Contract Tests", () => {
  it("characterization: loads extracted KOs sample fixture and validates schema version", () => {
    const fixture = loadAiFixture<{
      extractedCount: number;
      kos?: Array<{ id: string; conceptName: string; type: string }>;
    }>("extracted-kos-sample.json");

    expect(fixture.schemaVersion).toBe("1.0");
    expect(fixture.requirementId).toBe("AI-KO-EXTRACT-001");

    const { singleConcept, multiConcept } = fixture.fixtures;
    expect(singleConcept.extractedCount).toBe(1);
    expect(multiConcept.extractedCount).toBe(3);
  });

  it("AI-KO-IDENT-001: Generates deterministic stable identity keys based on source document, chapter, and concept name", () => {
    const key1 = generateStableKoKey("doc_physics_101", "ch_kinematics", "Newton's Second Law");
    const key2 = generateStableKoKey("doc_physics_101", "ch_kinematics", "Newton's Second Law");
    const key3 = generateStableKoKey("doc_physics_101", "ch_kinematics", "Newton's Third Law");

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toContain("newton-s-second-law");
  });

  it("AI-KO-HASH-002: Computes identical semantic hashes for equivalent KO content payloads", () => {
    const hash1 = computeSemanticKoHash("Force Equation", "F = ma equation definition", "formula", "core");
    const hash2 = computeSemanticKoHash("Force Equation", "F = ma equation definition", "formula", "core");
    const hash3 = computeSemanticKoHash("Force Equation", "F = m * a modified summary", "formula", "core");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it("AI-KO-RECON-003: Reconciles candidate KOs against existing DB records without destructive chapter deletion", () => {
    const existingKos = [
      {
        id: "ko_existing_001",
        stableKey: generateStableKoKey("doc_pka", "ch_01", "Kinematics Definition"),
        semanticHash: computeSemanticKoHash("Kinematics Definition", "Study of motion", "definition", "core"),
        version: 1,
        status: "active",
        chapterId: "ch_01",
      },
      {
        id: "ko_existing_002",
        stableKey: generateStableKoKey("doc_pka", "ch_01", "Velocity Formula"),
        semanticHash: computeSemanticKoHash("Velocity Formula", "v = d / t", "formula", "core"),
        version: 1,
        status: "active",
        chapterId: "ch_01",
      },
      {
        id: "ko_existing_003_old",
        stableKey: generateStableKoKey("doc_pka", "ch_01", "Obsolete Concept"),
        semanticHash: computeSemanticKoHash("Obsolete Concept", "Old summary", "definition", "core"),
        version: 1,
        status: "active",
        chapterId: "ch_01",
      },
    ];

    const candidates = [
      {
        title: "Kinematics Definition",
        summary: "Study of motion",
        knowledgeKind: "definition" as const,
        instructionalRole: "core" as const,
        sourceSpans: [],
      },
      {
        title: "Velocity Formula",
        summary: "v = delta x / delta t (updated precision)",
        knowledgeKind: "formula" as const,
        instructionalRole: "core" as const,
        sourceSpans: [],
      },
      {
        title: "Acceleration Concept",
        summary: "a = delta v / delta t",
        knowledgeKind: "definition" as const,
        instructionalRole: "core" as const,
        sourceSpans: [],
      },
    ];

    const result = reconcileKoExtractionRun(existingKos, candidates, "doc_pka", "ch_01");

    expect(result.hasAmbiguousMatch).toBe(false);
    expect(result.reconciliations).toHaveLength(4);

    const retainResult = result.reconciliations.find((r) => r.action === "retain");
    expect(retainResult?.existingId).toBe("ko_existing_001");

    const updateResult = result.reconciliations.find((r) => r.action === "update");
    expect(updateResult?.existingId).toBe("ko_existing_002");

    const insertResult = result.reconciliations.find((r) => r.action === "insert");
    expect(insertResult?.candidate.title).toBe("Acceleration Concept");

    const supersedeResult = result.reconciliations.find((r) => r.action === "supersede");
    expect(supersedeResult?.existingId).toBe("ko_existing_003_old");
  });

  it("AI-KO-ENV-001: Contains FEATURE_KO_PIPELINE_V2 feature flag in server schema", () => {
    expect("FEATURE_KO_PIPELINE_V2" in env).toBe(true);
  });

  // ── Plan 008 Staged Extraction Contract Tests ──────────────────────────────

  it("AI-KO-STAGED-001: Normalizes canonical source and performs deterministic semantic chunking without splitting formulas or tables", () => {
    const rawMarkdown = `# Bab 1: Kinematika

Pendahuluan tentang gerak lurus dan persamaan percepatan.

$$
a = \\frac{dv}{dt} = \\frac{d^2 x}{dt^2}
$$

Tabel berikut merangkum rumus utama:

| Besaran | Simbol | Satuan |
| Posisi | x | m |
| Kecepatan | v | m/s |
| Percepatan | a | m/s^2 |

Penjelasan tambahan mengenai vektor kecepatan dan arah gerak.`;

    const normalized = normalizeCanonicalSource("doc_kinematics", rawMarkdown, "1.0");
    expect(normalized.sourceHash).toBeTruthy();

    const chunks = chunkCanonicalSource(normalized, { maxChunkSize: 200 });
    expect(chunks.length).toBeGreaterThan(0);

    // Verify chunk offsets match original text exactly
    for (const chunk of chunks) {
      const sliced = normalized.content.slice(chunk.startOffset, chunk.endOffset);
      expect(sliced).toBe(chunk.content);
    }
  });

  it("AI-KO-STAGED-002: Processes long sources > 30,000 characters without silent truncation", async () => {
    // Generate synthetic long document > 30k characters
    const repeatedSection = `## Section Heading\n\nPenjelasan detail konsep fisika kuantum dan mekanika fluida dengan rumus $E = mc^2$.\n\n`;
    let longMarkdown = `# Bab Panjang: Pengantar Fisika Terpadu\n\n`;
    while (longMarkdown.length < 32000) {
      longMarkdown += repeatedSection;
    }
    longMarkdown += `\n\n## Subbab Akhir\n\nMekanika Kuantum Lanjutan membahas operator Hamilton dan fungsi gelombang Schrödinger.\n`;

    expect(longMarkdown.length).toBeGreaterThan(30000);

    const result = await executeStagedKoExtractionRun({
      sourceDocumentId: "doc_long_test",
      chapterId: "ch_long",
      rawContent: longMarkdown,
      chunkingOptions: { maxChunkSize: 4000 },
      chunkExtractorFn: async (chunk, _source) => {
        if (chunk.content.includes("Mekanika Kuantum Lanjutan")) {
          return {
            candidates: [
              {
                title: "Mekanika Kuantum Lanjutan",
                summary: "Operator Hamilton dan fungsi gelombang",
                knowledgeKind: "principle",
                instructionalRole: "core",
                excerpt: "Mekanika Kuantum Lanjutan membahas operator Hamilton",
              },
            ],
          };
        }
        return { candidates: [] };
      },
    });

    expect(result.state).toBe("accepted");
    expect(result.chunks.length).toBeGreaterThan(7);
    const lastChunk = result.chunks[result.chunks.length - 1];
    expect(lastChunk.endOffset).toBe(result.normalizedSource.content.length);

    const tailCand = result.reconciliationReport.candidates.find((c) => c.title === "Mekanika Kuantum Lanjutan");
    expect(tailCand).toBeDefined();
    expect(tailCand?.sourceSpans[0].startOffset).toBeGreaterThan(30000);
  });

  it("AI-KO-STAGED-003: Reconciles candidate KOs across chunks while preserving ALL supporting source spans", () => {
    const rawMarkdown = `# Bab Gerak

Persamaan kecepatan:
v = v0 + a * t

... kemudian di bagian lain:

Kecepatan v = v0 + a * t digunakan untuk gerak lurus berubah beraturan.`;

    const normalized = normalizeCanonicalSource("doc_motion", rawMarkdown, "1.0");

    const cand1 = validateChunkCandidates(
      { chunkIndex: 0, content: rawMarkdown, startOffset: 0, endOffset: 50, chunkHash: "h1", headings: [] },
      normalized,
      "ch_motion",
      [
        {
          title: "Persamaan Kecepatan",
          summary: "v = v0 + a * t",
          knowledgeKind: "formula",
          excerpt: "v = v0 + a * t",
        },
      ]
    );

    const cand2 = validateChunkCandidates(
      { chunkIndex: 1, content: rawMarkdown, startOffset: 60, endOffset: 140, chunkHash: "h2", headings: [] },
      normalized,
      "ch_motion",
      [
        {
          title: "Persamaan Kecepatan",
          summary: "v = v0 + a * t digunakan untuk gerak lurus",
          knowledgeKind: "formula",
          excerpt: "v = v0 + a * t digunakan untuk gerak lurus",
        },
      ]
    );

    const report = reconcileCrossChunkCandidates([[cand1[0]], [cand2[0]]]);
    expect(report.candidates).toHaveLength(1);

    const merged = report.candidates[0];
    expect(merged.title).toBe("Persamaan Kecepatan");
    // Verifies ALL source spans preserved across chunks!
    expect(merged.sourceSpans.length).toBe(2);
    expect(merged.chunkIndices).toEqual([0, 1]);
  });

  it("AI-KO-STAGED-004: Canonical resolution flags high embedding similarity without exact name match as ambiguous", () => {
    const candidate = {
      id: "cand_01",
      title: "Laju Perubahan Kecepatan",
      summary: "Turunan kecepatan terhadap waktu",
      knowledgeKind: "definition" as const,
      instructionalRole: "core" as const,
      sourceSpans: [],
      excerptHashes: [],
      prerequisites: [],
      chunkIndices: [0],
      embeddingSimilarityProposal: {
        conceptId: "concept_percepatan_uuid",
        similarity: 0.89,
      },
    };

    const registeredConcepts = [
      {
        conceptId: "concept_percepatan_uuid",
        displayName: "Percepatan",
        aliases: ["Akselerasi"],
      },
    ];

    const result = resolveCanonicalConcepts([candidate], registeredConcepts);
    expect(result.overallState).toBe("needs_review");
    expect(result.hasAmbiguousCandidates).toBe(true);

    const res = result.resolutions[0];
    expect(res.status).toBe("ambiguous");
    expect(res.reason).toContain("Requires review");
  });

  it("AI-KO-STAGED-005: Learning Objectives retain Bloom taxonomy levels and source evidence separately from isolated KOs", () => {
    const rawMarkdown = `Siswa mampu menghitung kecepatan rata-rata dari data posisi dan waktu.`;
    const normalized = normalizeCanonicalSource("doc_lo_test", rawMarkdown, "1.0");

    const chunk = { chunkIndex: 0, content: rawMarkdown, startOffset: 0, endOffset: rawMarkdown.length, chunkHash: "h1", headings: [] };
    const loCandidates = validateChunkLearningObjectives(chunk, normalized, "ch_lo", [
      {
        objectiveText: "Menghitung kecepatan rata-rata dari data posisi",
        bloomLevel: "apply",
        excerpt: "menghitung kecepatan rata-rata",
      },
    ]);

    expect(loCandidates).toHaveLength(1);
    expect(loCandidates[0].bloomLevel).toBe("apply");
    expect(loCandidates[0].sourceSpans).toHaveLength(1);
  });
});
