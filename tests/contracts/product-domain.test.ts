import { describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import {
  authoringReferenceSetSchema,
  artikelSchema,
  flashcardSchema,
  kemajuanFlashcardMuridSchema,
  pembahasanSoalSchema,
  publishedDiktatSchema,
  publishedIdeaLinksSchema,
  publishedQuestionSchema,
  reviewFlashcardSchema,
  soalIdeaLinksSchema,
  visibleReferencesForAuthoring,
} from "@/lib/produk/contracts";

const hash = "a".repeat(64);
const now = "2026-08-02T00:00:00.000Z";
const idea = { ideaId: "ide-1", ideaVersion: 1, ideaStatus: "published" as const };
const base = { id: "produk-1", version: 1, status: "published" as const, generationHash: hash, dependencyHash: hash, creatorId: "user-1", createdAt: now, updatedAt: now };

describe("Plan 004 product contracts", () => {
  it("accepts published products with at least one published Idea", () => {
    expect(artikelSchema.parse({ ...base, title: "Artikel", content: "Isi", ideaLinks: [idea] }).ideaLinks).toHaveLength(1);
    expect(publishedDiktatSchema.parse({ ...base, title: "Diktat", markdown: "Isi", ideaLinks: [idea] })).toBeTruthy();
    expect(publishedQuestionSchema.parse({ ...base, prompt: "Berapa?", ideaLinks: [idea], soalIde: [{ ...idea, weight: 1 }], difficulty: "easy", cognitiveLevel: "apply", reasoningPattern: "conceptual", requiredIdeaRelations: [] })).toBeTruthy();
    expect(pembahasanSoalSchema.parse({ ...base, soalId: "soal-1", explanation: "Karena.", ideaLinks: [idea] })).toBeTruthy();
    expect(flashcardSchema.parse({ ...base, front: "Apa?", back: "Ini.", ideaLinks: [idea], dueAt: now, lastReviewedAt: null, reviewCount: 0, intervalDays: 1, easeFactor: 2.5 })).toBeTruthy();
    expect(kemajuanFlashcardMuridSchema.parse({ muridId: "murid-1", flashcardId: "flashcard-1", dueAt: now, lastReviewedAt: null, reviewCount: 0, intervalDays: 1, easeFactor: 2.5 })).toBeTruthy();
    expect(reviewFlashcardSchema.parse({ id: "review-1", muridId: "murid-1", flashcardId: "flashcard-1", reviewedAt: now, rating: "good", dueAtBefore: now, dueAtAfter: now })).toBeTruthy();
  });

  it("rejects published products without an Idea and rejects unknown fields", () => {
    expect(artikelSchema.safeParse({ ...base, title: "Artikel", content: "Isi", ideaLinks: [] }).success).toBe(false);
    expect(publishedIdeaLinksSchema.safeParse([{ ...idea, unexpected: true }]).success).toBe(false);
    expect(artikelSchema.safeParse({ ...base, title: "Artikel", content: "Isi", ideaLinks: [idea], unexpected: true }).success).toBe(false);
    expect(kemajuanFlashcardMuridSchema.safeParse({ muridId: "murid-1", flashcardId: "flashcard-1", dueAt: now, lastReviewedAt: null, reviewCount: 0, intervalDays: -1, easeFactor: 2.5 }).success).toBe(false);
    expect(artikelSchema.safeParse({ ...base, dependencyHash: "not-a-hash", title: "Artikel", content: "Isi", ideaLinks: [idea] }).success).toBe(false);
  });

  it("requires positive soal_ide weights whose sum is one", () => {
    expect(soalIdeaLinksSchema.safeParse([{ ...idea, weight: 0.4 }, { ...idea, ideaId: "ide-2", weight: 0.6 }]).success).toBe(true);
    expect(soalIdeaLinksSchema.safeParse([{ ...idea, weight: 0 }, { ...idea, ideaId: "ide-2", weight: 1 }]).success).toBe(false);
    expect(soalIdeaLinksSchema.safeParse([{ ...idea, weight: 0.4 }, { ...idea, ideaId: "ide-2", weight: 0.5 }]).success).toBe(false);
  });

  it("keeps difficulty, cognitive level, reasoning, and required relations independent", () => {
    const parsed = publishedQuestionSchema.parse({ ...base, prompt: "Hitung.", ideaLinks: [idea], soalIde: [{ ...idea, weight: 1 }], difficulty: "hard", cognitiveLevel: "evaluate", reasoningPattern: "proof", requiredIdeaRelations: [{ relationType: "prerequisite", ideaId: "ide-0", required: true }] });
    expect(parsed.difficulty).toBe("hard");
    expect(parsed.cognitiveLevel).toBe("evaluate");
    expect(parsed.reasoningPattern).toBe("proof");
    expect(parsed.requiredIdeaRelations[0].ideaId).toBe("ide-0");
  });

  it("blocks holdout references from authoring context while preserving allowed references", () => {
    const refs = [{ id: "ref-allowed", questionId: "soal-1", content: "Allowed", source: "bank", checksum: hash, authoringVisibility: "allowed" as const }, { id: "ref-holdout", questionId: "soal-1", content: "Holdout", source: "benchmark", checksum: hash, authoringVisibility: "holdout" as const }];
    expect(authoringReferenceSetSchema.safeParse(refs).success).toBe(false);
    expect(visibleReferencesForAuthoring(refs).map((ref) => ref.id)).toEqual(["ref-allowed"]);
  });

  it("creates the additive product and assessment tables with relational constraints in PostgreSQL", async () => {
    const { client } = await createPostgresTestDb();
    const targetTables = [
      "artikel",
      "artikel_ide",
      "asesmen",
      "audit_mutasi",
      "benchmark_soal",
      "blok_artikel",
      "blueprint_asesmen",
      "bukti_ide_jawaban",
      "bukti_pembelajaran",
      "cakupan_asesmen",
      "diktat_ide",
      "diktat_materi",
      "diktat_pembahasan",
      "flashcard",
      "flashcard_ide",
      "impor_bundle",
      "item_asesmen",
      "item_diktat_pembahasan",
      "item_impor_bundle",
      "jawaban_murid",
      "kemajuan_flashcard_murid",
      "pemahaman_ide",
      "pembahasan_soal",
      "percobaan_asesmen",
      "perubahan_pemahaman",
      "publikasi_bundle",
      "rekomendasi_flashcard",
      "review_bundle",
      "review_item_bundle",
      "review_flashcard",
      "set_flashcard",
      "soal",
      "soal_ide",
      "soal_itb_referensi",
      "soal_relasi_ide",
    ];

    try {
      const tableResult = await client.query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
        [targetTables],
      );
      expect(tableResult.rows.map((row) => row.name)).toEqual([...targetTables].sort());

      await client.query(`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role) VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6), $7)`, ["user-plan004-db", "Plan 004 User", "plan004-db@example.test", true, 0, 0, "teacher"]);
      await client.query(`INSERT INTO pengguna (id, status, created_at, updated_at) VALUES ($1, $2, to_timestamp($3), to_timestamp($4))`, ["user-plan004-db", "active", 0, 0]);
      await client.query(`INSERT INTO mata_kuliah (id, code, title, status, created_at, updated_at) VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6))`, ["mk-plan004-db", "FIS-004", "Fisika Plan 004", "active", 0, 0]);
      await client.query(`INSERT INTO bab (id, mata_kuliah_id, code, title, order_index, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8))`, ["bab-plan004-db", "mk-plan004-db", "BAB-1", "Gerak", 1, "active", 0, 0]);
      await client.query(`INSERT INTO ide (id, mata_kuliah_id, bab_id, stable_key, code, canonical_statement, concise_explanation, difficulty_metadata, version, status, source_policy, schema_version, semantic_hash, generation_hash, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, to_timestamp($16), to_timestamp($17))`, ["ide-plan004-db", "mk-plan004-db", "bab-plan004-db", "stable-plan004-db", "IDE-004", "Pernyataan", "Penjelasan", JSON.stringify({ level: "introductory" }), 1, "draft", "source_grounded", "idea.v1", hash, hash, "user-plan004-db", 0, 0]);

      await client.query(`INSERT INTO artikel (id, mata_kuliah_id, bab_id, slug, title, content_markdown, version, status, source_hash, generation_hash, creator_id, curator_id, published_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13), to_timestamp($14), to_timestamp($15))`, ["artikel-plan004-db", "mk-plan004-db", "bab-plan004-db", "artikel-plan004-db", "Artikel", "# Isi", 1, "published", hash, hash, "user-plan004-db", null, null, 0, 0]);
      await client.query(`INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5))`, ["artikel-ide-plan004-db", "artikel-plan004-db", "ide-plan004-db", 1, 0]);
      await expect(client.query(`INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5))`, ["artikel-ide-duplicate-plan004-db", "artikel-plan004-db", "ide-plan004-db", 1, 0])).rejects.toThrow();
      await expect(client.query(`INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5))`, ["artikel-ide-invalid-plan004-db", "artikel-plan004-db", "ide-plan004-db", 0, 0])).rejects.toThrow();
      await expect(client.query(`INSERT INTO artikel (id, mata_kuliah_id, bab_id, slug, title, content_markdown, version, status, source_hash, generation_hash, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12), to_timestamp($13))`, ["artikel-orphan-plan004-db", "missing-course", "bab-plan004-db", "artikel-orphan-plan004-db", "Orphan", "# Isi", 1, "published", hash, hash, "user-plan004-db", 0, 0])).rejects.toThrow();

      await client.query(`INSERT INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, version, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14), to_timestamp($15))`, ["soal-plan004-db", "mk-plan004-db", "bab-plan004-db", "multiple_choice", "Berapa?", JSON.stringify(["1", "2"]), 1, "published", "easy", "apply", "conceptual", hash, "user-plan004-db", 0, 0]);
      await client.query(`INSERT INTO soal_ide (id, soal_id, ide_id, weight, role, created_at) VALUES ($1, $2, $3, $4, $5, to_timestamp($6))`, ["soal-ide-plan004-db", "soal-plan004-db", "ide-plan004-db", 1, "primary", 0]);

      await client.query(`INSERT INTO blueprint_asesmen (id, mata_kuliah_id, title, assessment_type, blueprint, version, status, generation_hash, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))`, ["blueprint-plan004-db", "mk-plan004-db", "Quiz", "quiz", JSON.stringify({}), 1, "approved", hash, "user-plan004-db", 0, 0]);
      await client.query(`INSERT INTO asesmen (id, blueprint_asesmen_id, mata_kuliah_id, title, assessment_type, version, status, generation_hash, creator_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))`, ["asesmen-plan004-db", "blueprint-plan004-db", "mk-plan004-db", "Quiz", "quiz", 1, "published", hash, "user-plan004-db", 0, 0]);
      await client.query(`INSERT INTO cakupan_asesmen (id, asesmen_id, bab_id, order_index, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5))`, ["cakupan-plan004-db", "asesmen-plan004-db", "bab-plan004-db", 0, 0]);
      await client.query(`INSERT INTO item_asesmen (id, asesmen_id, soal_id, order_index, rendered_question_snapshot, option_order_snapshot, grading_policy_snapshot, content_version, generation_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10))`, ["item-plan004-db", "asesmen-plan004-db", "soal-plan004-db", 0, JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ version: "rubric-1" }), 1, hash, 0]);
      await client.query(`INSERT INTO percobaan_asesmen (id, asesmen_id, pengguna_id, status, rendered_question_snapshot, option_order_snapshot, grading_policy_snapshot, content_version, started_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9), to_timestamp($10))`, ["attempt-plan004-db", "asesmen-plan004-db", "user-plan004-db", "in_progress", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify({ "item-plan004-db": ["a", "b"] }), JSON.stringify({ version: "rubric-1" }), 1, 0, 0]);
      await client.query(`INSERT INTO jawaban_murid (id, percobaan_asesmen_id, item_asesmen_id, rendered_question_snapshot, option_order_snapshot, response_snapshot, grading_policy_snapshot, content_version, status, answered_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10))`, ["answer-plan004-db", "attempt-plan004-db", "item-plan004-db", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ selected: "b" }), JSON.stringify({ version: "rubric-1" }), 1, "ungraded", 0]);
      await expect(client.query(`INSERT INTO jawaban_murid (id, percobaan_asesmen_id, item_asesmen_id, rendered_question_snapshot, option_order_snapshot, response_snapshot, content_version, status, answered_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))`, ["answer-incomplete-plan004-db", "attempt-plan004-db", "item-plan004-db", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ selected: "b" }), 1, "ungraded", 0])).rejects.toThrow();

      await expect(client.query(`INSERT INTO pemahaman_ide (id, pengguna_id, ide_id, skor, keyakinan, evidence_count, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))`, ["mastery-invalid-plan004-db", "user-plan004-db", "ide-plan004-db", 101, 50, 0, 1, 0, 0])).rejects.toThrow();
      await client.query(`INSERT INTO pemahaman_ide (id, pengguna_id, ide_id, skor, keyakinan, evidence_count, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))`, ["mastery-plan004-db", "user-plan004-db", "ide-plan004-db", 25, 90, 1, 1, 0, 0]);
      await expect(client.query(`INSERT INTO bukti_ide_jawaban (id, jawaban_murid_id, ide_id, score_contribution, weight, confidence, evidence_source, rubric_version, derivation_status, ambiguous, affects_mastery, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12))`, ["evidence-ambiguous-plan004-db", "answer-plan004-db", "ide-plan004-db", 0.5, 1, 50, "answer", "rubric-1", "ambiguous", true, true, 0])).rejects.toThrow();

      await client.query(`INSERT INTO impor_bundle (id, bundle_id, checksum, bundle_type, source_uri_or_key, version, status, validation_report, requested_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))`, ["import-plan004-db", "bundle-plan004-db", hash, "product", "bundles/plan004.json", 1, "approved", JSON.stringify({}), "user-plan004-db", 0, 0]);
      await expect(client.query(`INSERT INTO impor_bundle (id, bundle_id, checksum, bundle_type, source_uri_or_key, version, status, validation_report, requested_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))`, ["import-duplicate-plan004-db", "bundle-plan004-db", hash, "product", "bundles/plan004.json", 1, "approved", JSON.stringify({}), "user-plan004-db", 0, 0])).rejects.toThrow();
      await client.query(`INSERT INTO review_bundle (id, impor_bundle_id, reviewer_id, status, reviewed_at, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6))`, ["review-plan004-db", "import-plan004-db", "user-plan004-db", "approved", 0, 0]);
      await client.query(`INSERT INTO impor_bundle (id, bundle_id, checksum, bundle_type, source_uri_or_key, version, status, validation_report, requested_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10), to_timestamp($11))`, ["import-block-review-db", "bundle-block-review-db", "b".repeat(64), "product", "bundles/block-review.json", 2, "draft", JSON.stringify({}), "user-plan004-db", 0, 0]);
      await client.query(`INSERT INTO review_item_bundle (id, impor_bundle_id, reviewer_id, product_id, block_id, target_id, status, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, to_timestamp($8), to_timestamp($9))`, ["review-item-plan004-db", "import-block-review-db", "user-plan004-db", "article-1", "block-1", "approved", "Sudah diperiksa", 0, 0]);
      await expect(client.query(`INSERT INTO review_item_bundle (id, impor_bundle_id, reviewer_id, product_id, block_id, target_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5, $6, to_timestamp($7), to_timestamp($8))`, ["review-item-duplicate-plan004-db", "import-block-review-db", "user-plan004-db", "article-1", "block-1", "changes_requested", 0, 0])).rejects.toThrow();
      await expect(client.query(`INSERT INTO review_item_bundle (id, impor_bundle_id, reviewer_id, product_id, block_id, target_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5, $6, to_timestamp($7), to_timestamp($8))`, ["review-item-orphan-plan004-db", "missing-import", "user-plan004-db", "article-1", "block-2", "pending", 0, 0])).rejects.toThrow();
      await client.query("DELETE FROM impor_bundle WHERE id = $1", ["import-block-review-db"]);
      const remainingBlockReviews = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM review_item_bundle WHERE impor_bundle_id = $1`, ["import-block-review-db"]);
      expect(Number(remainingBlockReviews.rows[0]?.count)).toBe(0);
      await client.query(`INSERT INTO publikasi_bundle (id, impor_bundle_id, approved_review_id, version, publication_hash, status, published_by, published_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))`, ["publication-plan004-db", "import-plan004-db", "review-plan004-db", 1, hash, "published", "user-plan004-db", 0, 0]);
      await expect(client.query(`INSERT INTO publikasi_bundle (id, impor_bundle_id, approved_review_id, version, publication_hash, status, published_by, published_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9))`, ["publication-orphan-plan004-db", "import-plan004-db", "missing-review", 2, hash, "published", "user-plan004-db", 0, 0])).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
