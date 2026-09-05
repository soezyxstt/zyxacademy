import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TEST_DB_PATH = `/tmp/test-cp1-isolated-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;

describe("CP1 database migration schema isolation test", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(TEST_DB_PATH);
    db.run("PRAGMA foreign_keys = OFF;");
    db.run("CREATE TABLE IF NOT EXISTS impor_bundle (id text PRIMARY KEY);");
    db.run("CREATE TABLE IF NOT EXISTS pengguna (id text PRIMARY KEY);");

    // Execute 0087 migration
    const migration0087 = readFileSync(
      join(process.cwd(), "drizzle/0087_curly_black_tom.sql"),
      "utf8",
    );
    for (const stmt of migration0087.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.run(trimmed);
      }
    }

    // Execute 0088 migration
    const migration0088 = readFileSync(
      join(process.cwd(), "drizzle/0088_talented_shinobi_shaw.sql"),
      "utf8",
    );
    for (const stmt of migration0088.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.run(trimmed);
      }
    }

    // Populate required foreign key parent entities
    db.run("INSERT OR IGNORE INTO impor_bundle (id) VALUES ('bundle-01'), ('bundle-02'), ('bundle-03');");
    db.run("INSERT OR IGNORE INTO pengguna (id) VALUES ('user-lead');");
  });

  afterAll(() => {
    try {
      db.close();
      unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore cleanup error if already removed
    }
  });

  test("creates review_pedagogi_bundle table with expected columns and indexes", () => {
    const table = db
      .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_pedagogi_bundle'")
      .get() as { sql: string } | null;

    expect(table).not.toBeNull();
    expect(table?.sql).toContain("impor_bundle_id");
    expect(table?.sql).toContain("reviewer_id");
    expect(table?.sql).toContain("content_fingerprint");
    expect(table?.sql).toContain("policy_version");

    const uniqueIdx = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'review_pedagogi_bundle_decision_idx'",
      )
      .get() as { sql: string } | null;

    expect(uniqueIdx).not.toBeNull();
    expect(uniqueIdx?.sql).toContain("UNIQUE");
    expect(uniqueIdx?.sql).toContain("impor_bundle_id");
    expect(uniqueIdx?.sql).toContain("reviewer_id");
    expect(uniqueIdx?.sql).toContain("content_fingerprint");
    expect(uniqueIdx?.sql).toContain("policy_version");
  });

  test("creates bukti_pdf_bundle table with expected columns, constraints, and indexes", () => {
    const table = db
      .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bukti_pdf_bundle'")
      .get() as { sql: string } | null;

    expect(table).not.toBeNull();
    expect(table?.sql).toContain("page_count_check");
    expect(table?.sql).toContain("status_check");

    const lineageIdx = db
      .query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'bukti_pdf_bundle_lineage_idx'")
      .get() as { sql: string } | null;

    expect(lineageIdx).not.toBeNull();
    expect(lineageIdx?.sql).toContain("UNIQUE");
    expect(lineageIdx?.sql).toContain("diktat_hash");
    expect(lineageIdx?.sql).toContain("print_profile");

    const articleHashIdx = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'bukti_pdf_bundle_article_hash_idx'",
      )
      .get() as { sql: string } | null;

    expect(articleHashIdx).not.toBeNull();
  });

  test("enforces composite uniqueness on review_pedagogi_bundle decisions", () => {
    const insertStmt = db.prepare(`
      INSERT INTO review_pedagogi_bundle (
        id, impor_bundle_id, reviewer_id, content_fingerprint, policy_version, status, rubric, exceptions, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const fp1 = "11".repeat(32);
    const fp2 = "22".repeat(32);

    // Initial insert succeeds
    insertStmt.run("rev-1", "bundle-01", "user-lead", fp1, "2026.09.1", "approved", "[]", "[]", "Notes");

    // Re-inserting identical decision tuple throws UNIQUE constraint error
    expect(() => {
      insertStmt.run("rev-2", "bundle-01", "user-lead", fp1, "2026.09.1", "approved", "[]", "[]", "Duplicate");
    }).toThrow(/UNIQUE constraint failed/);

    // Re-inserting with different content fingerprint succeeds (immutable review versioning)
    insertStmt.run("rev-3", "bundle-01", "user-lead", fp2, "2026.09.1", "approved", "[]", "[]", "New content");

    const count = db
      .query("SELECT COUNT(*) as total FROM review_pedagogi_bundle WHERE impor_bundle_id = 'bundle-01'")
      .get() as { total: number };
    expect(count.total).toBe(2);
  });

  test("enforces status check constraint on review_pedagogi_bundle", () => {
    const insertStmt = db.prepare(`
      INSERT INTO review_pedagogi_bundle (
        id, impor_bundle_id, reviewer_id, content_fingerprint, policy_version, status, rubric, exceptions, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    expect(() => {
      insertStmt.run("rev-bad-status", "bundle-02", "user-lead", "33".repeat(32), "2026.09.1", "unknown_status", "[]", "[]", null);
    }).toThrow(/CHECK constraint failed/);
  });

  test("enforces composite uniqueness on bukti_pdf_bundle lineage", () => {
    const insertStmt = db.prepare(`
      INSERT INTO bukti_pdf_bundle (
        id, impor_bundle_id, product_id, article_version, article_hash, diktat_hash, renderer_version, print_profile, status, page_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const dHash1 = "aa".repeat(32);
    const aHash1 = "bb".repeat(32);

    // First insert succeeds
    insertStmt.run("pdf-1", "bundle-01", "art-01", 1, aHash1, dHash1, "v1", "a4_standard", "ready", 3);

    // Duplicate lineage (bundle, product, diktat_hash, print_profile) throws UNIQUE constraint error
    expect(() => {
      insertStmt.run("pdf-2", "bundle-01", "art-01", 1, aHash1, dHash1, "v2", "a4_standard", "ready", 3);
    }).toThrow(/UNIQUE constraint failed/);
  });

  test("enforces page_count check constraint on bukti_pdf_bundle", () => {
    const insertStmt = db.prepare(`
      INSERT INTO bukti_pdf_bundle (
        id, impor_bundle_id, product_id, article_version, article_hash, diktat_hash, renderer_version, print_profile, status, page_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Under budget (1 page) throws CHECK error
    expect(() => {
      insertStmt.run("pdf-under", "bundle-03", "art-01", 1, "cc".repeat(32), "dd".repeat(32), "v1", "a4_standard", "ready", 1);
    }).toThrow(/CHECK constraint failed/);

    // Over budget (5 pages) throws CHECK error
    expect(() => {
      insertStmt.run("pdf-over", "bundle-03", "art-01", 1, "ee".repeat(32), "ff".repeat(32), "v1", "a4_standard", "ready", 5);
    }).toThrow(/CHECK constraint failed/);

    // Within budget (2 to 4 pages) or NULL succeeds
    insertStmt.run("pdf-valid-2", "bundle-03", "art-01", 1, "11".repeat(32), "22".repeat(32), "v1", "a4_standard", "ready", 2);
    insertStmt.run("pdf-valid-4", "bundle-03", "art-02", 1, "33".repeat(32), "44".repeat(32), "v1", "a4_standard", "ready", 4);
    insertStmt.run("pdf-valid-null", "bundle-03", "art-03", 1, "55".repeat(32), "66".repeat(32), "v1", "a4_standard", "pending", null);
  });
});
