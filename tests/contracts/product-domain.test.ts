import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
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

  it("creates the additive product and assessment tables with relational constraints in SQLite", async () => {
    const client = createClient({ url: "file::memory:?cache=shared" });
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
      "review_flashcard",
      "set_flashcard",
      "soal",
      "soal_ide",
      "soal_itb_referensi",
      "soal_relasi_ide",
    ];

    try {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      await client.execute("PRAGMA foreign_keys = ON");

      const tableResult = await client.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${targetTables.map(() => "?").join(", ")}) ORDER BY name`,
        targetTables,
      );
      expect(tableResult.rows.map((row) => String(row.name))).toEqual([...targetTables].sort());

      await client.execute({
        sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: ["user-plan004-db", "Plan 004 User", "plan004-db@example.test", 1, 0, 0, "teacher"],
      });
      await client.execute({
        sql: "INSERT INTO pengguna (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
        args: ["user-plan004-db", "active", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO mata_kuliah (id, code, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: ["mk-plan004-db", "FIS-004", "Fisika Plan 004", "active", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO bab (id, mata_kuliah_id, code, title, order_index, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["bab-plan004-db", "mk-plan004-db", "BAB-1", "Gerak", 1, "active", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO ide (id, mata_kuliah_id, bab_id, stable_key, code, canonical_statement, concise_explanation, difficulty_metadata, version, status, source_policy, schema_version, semantic_hash, generation_hash, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["ide-plan004-db", "mk-plan004-db", "bab-plan004-db", "stable-plan004-db", "IDE-004", "Pernyataan", "Penjelasan", JSON.stringify({ level: "introductory" }), 1, "draft", "source_grounded", "idea.v1", hash, hash, "user-plan004-db", 0, 0],
      });

      await client.execute({
        sql: "INSERT INTO artikel (id, mata_kuliah_id, bab_id, slug, title, content_markdown, version, status, source_hash, generation_hash, creator_id, curator_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["artikel-plan004-db", "mk-plan004-db", "bab-plan004-db", "artikel-plan004-db", "Artikel", "# Isi", 1, "published", hash, hash, "user-plan004-db", null, null, 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["artikel-ide-plan004-db", "artikel-plan004-db", "ide-plan004-db", 1, 0],
      });
      await expect(client.execute({
        sql: "INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["artikel-ide-duplicate-plan004-db", "artikel-plan004-db", "ide-plan004-db", 1, 0],
      })).rejects.toThrow();
      await expect(client.execute({
        sql: "INSERT INTO artikel_ide (id, artikel_id, ide_id, weight, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["artikel-ide-invalid-plan004-db", "artikel-plan004-db", "ide-plan004-db", 0, 0],
      })).rejects.toThrow();
      await expect(client.execute({
        sql: "INSERT INTO artikel (id, mata_kuliah_id, bab_id, slug, title, content_markdown, version, status, source_hash, generation_hash, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["artikel-orphan-plan004-db", "missing-course", "bab-plan004-db", "artikel-orphan-plan004-db", "Orphan", "# Isi", 1, "published", hash, hash, "user-plan004-db", 0, 0],
      })).rejects.toThrow();

      await client.execute({
        sql: "INSERT INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, version, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["soal-plan004-db", "mk-plan004-db", "bab-plan004-db", "multiple_choice", "Berapa?", JSON.stringify(["1", "2"]), 1, "published", "easy", "apply", "conceptual", hash, "user-plan004-db", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO soal_ide (id, soal_id, ide_id, weight, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: ["soal-ide-plan004-db", "soal-plan004-db", "ide-plan004-db", 1, "primary", 0],
      });

      await client.execute({
        sql: "INSERT INTO blueprint_asesmen (id, mata_kuliah_id, title, assessment_type, blueprint, version, status, generation_hash, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["blueprint-plan004-db", "mk-plan004-db", "Quiz", "quiz", JSON.stringify({}), 1, "approved", hash, "user-plan004-db", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO asesmen (id, blueprint_asesmen_id, mata_kuliah_id, title, assessment_type, version, status, generation_hash, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["asesmen-plan004-db", "blueprint-plan004-db", "mk-plan004-db", "Quiz", "quiz", 1, "published", hash, "user-plan004-db", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO cakupan_asesmen (id, asesmen_id, bab_id, order_index, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["cakupan-plan004-db", "asesmen-plan004-db", "bab-plan004-db", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO item_asesmen (id, asesmen_id, soal_id, order_index, rendered_question_snapshot, option_order_snapshot, grading_policy_snapshot, content_version, generation_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["item-plan004-db", "asesmen-plan004-db", "soal-plan004-db", 0, JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ version: "rubric-1" }), 1, hash, 0],
      });
      await client.execute({
        sql: "INSERT INTO percobaan_asesmen (id, asesmen_id, pengguna_id, status, rendered_question_snapshot, option_order_snapshot, grading_policy_snapshot, content_version, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["attempt-plan004-db", "asesmen-plan004-db", "user-plan004-db", "in_progress", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify({ "item-plan004-db": ["a", "b"] }), JSON.stringify({ version: "rubric-1" }), 1, 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO jawaban_murid (id, percobaan_asesmen_id, item_asesmen_id, rendered_question_snapshot, option_order_snapshot, response_snapshot, grading_policy_snapshot, content_version, status, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["answer-plan004-db", "attempt-plan004-db", "item-plan004-db", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ selected: "b" }), JSON.stringify({ version: "rubric-1" }), 1, "ungraded", 0],
      });
      await expect(client.execute({
        sql: "INSERT INTO jawaban_murid (id, percobaan_asesmen_id, item_asesmen_id, rendered_question_snapshot, option_order_snapshot, response_snapshot, content_version, status, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["answer-incomplete-plan004-db", "attempt-plan004-db", "item-plan004-db", JSON.stringify({ prompt: "Berapa?" }), JSON.stringify(["a", "b"]), JSON.stringify({ selected: "b" }), 1, "ungraded", 0],
      })).rejects.toThrow();

      await expect(client.execute({
        sql: "INSERT INTO pemahaman_ide (id, pengguna_id, ide_id, skor, keyakinan, evidence_count, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["mastery-invalid-plan004-db", "user-plan004-db", "ide-plan004-db", 101, 50, 0, 1, 0, 0],
      })).rejects.toThrow();
      await client.execute({
        sql: "INSERT INTO pemahaman_ide (id, pengguna_id, ide_id, skor, keyakinan, evidence_count, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["mastery-plan004-db", "user-plan004-db", "ide-plan004-db", 25, 90, 1, 1, 0, 0],
      });
      await expect(client.execute({
        sql: "INSERT INTO bukti_ide_jawaban (id, jawaban_murid_id, ide_id, score_contribution, weight, confidence, evidence_source, rubric_version, derivation_status, ambiguous, affects_mastery, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["evidence-ambiguous-plan004-db", "answer-plan004-db", "ide-plan004-db", 0.5, 1, 50, "answer", "rubric-1", "ambiguous", 1, 1, 0],
      })).rejects.toThrow();

      await client.execute({
        sql: "INSERT INTO impor_bundle (id, bundle_id, checksum, bundle_type, source_uri_or_key, version, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["import-plan004-db", "bundle-plan004-db", hash, "product", "bundles/plan004.json", 1, "approved", "user-plan004-db", 0, 0],
      });
      await expect(client.execute({
        sql: "INSERT INTO impor_bundle (id, bundle_id, checksum, bundle_type, source_uri_or_key, version, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["import-duplicate-plan004-db", "bundle-plan004-db", hash, "product", "bundles/plan004.json", 1, "approved", "user-plan004-db", 0, 0],
      })).rejects.toThrow();
      await client.execute({
        sql: "INSERT INTO review_bundle (id, impor_bundle_id, reviewer_id, status, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: ["review-plan004-db", "import-plan004-db", "user-plan004-db", "approved", 0, 0],
      });
      await client.execute({
        sql: "INSERT INTO publikasi_bundle (id, impor_bundle_id, approved_review_id, version, publication_hash, status, published_by, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["publication-plan004-db", "import-plan004-db", "review-plan004-db", 1, hash, "published", "user-plan004-db", 0, 0],
      });
      await expect(client.execute({
        sql: "INSERT INTO publikasi_bundle (id, impor_bundle_id, approved_review_id, version, publication_hash, status, published_by, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: ["publication-orphan-plan004-db", "import-plan004-db", "missing-review", 2, hash, "published", "user-plan004-db", 0, 0],
      })).rejects.toThrow();
    } finally {
      client.close();
    }
  });
});
