import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";

let mockSession: any = null;

const testDirectory = mkdtempSync(join(tmpdir(), "zyx-historical-reference-policy-"));
const client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
const testDb = drizzle(client, { schema });

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
  },
}));
mock.module("@/lib/auth/authorization", () => ({
  hasAnyPeran: async () => true,
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));
mock.module("@/lib/question-authoring", () => ({
  createCanonicalQuestion: async () => {
    throw new Error("not used in this contract");
  },
  QuestionAuthoringError: class QuestionAuthoringError extends Error {},
}));

import { PUT } from "@/app/api/admin/questions/route";

async function setupTables() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS soal (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      assessment_source_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      published_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ai_question_bank (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'generated',
      course_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS assessment_sources (
      id TEXT PRIMARY KEY,
      deleted_at INTEGER
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ide (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS soal_ide (
      id TEXT PRIMARY KEY,
      soal_id TEXT NOT NULL,
      ide_id TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pembahasan_soal (
      id TEXT PRIMARY KEY,
      soal_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      published_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT,
      correlation_id TEXT,
      course_id TEXT,
      outcome TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

async function cleanTables() {
  await client.execute("DELETE FROM audit_mutasi");
  await client.execute("DELETE FROM pembahasan_soal");
  await client.execute("DELETE FROM soal_ide");
  await client.execute("DELETE FROM ide");
  await client.execute("DELETE FROM assessment_sources");
  await client.execute("DELETE FROM ai_question_bank");
  await client.execute("DELETE FROM soal");
}

describe("historical question publication policy", () => {
  beforeAll(setupTables);

  afterAll(async () => {
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      rmSync(testDirectory, { recursive: true, force: true });
    } catch {
      // The SQLite handle can remain locked briefly on Windows; the OS temp directory is disposable.
    }
  });

  beforeEach(async () => {
    await cleanTables();
    mockSession = { user: { id: "admin-1", role: "admin" } };
  });

  it("blocks historical publication until a source and published Idea link exist", async () => {
    await client.execute(`
      INSERT INTO soal (id, mata_kuliah_id, origin, assessment_source_id, status)
      VALUES ('historical-1', 'course-1', 'historical_reference', 'source-1', 'draft')
    `);
    await client.execute(`
      INSERT INTO ai_question_bank (id, origin, review_status, course_id)
      VALUES ('historical-1', 'historical_reference', 'generated', 'legacy-course-1')
    `);
    await client.execute(`
      INSERT INTO pembahasan_soal (id, soal_id, status)
      VALUES ('solution-1', 'historical-1', 'draft')
    `);

    const blocked = await PUT(
      new NextRequest("http://localhost/api/admin/questions", {
        method: "PUT",
        body: JSON.stringify({ ids: ["historical-1"], reviewStatus: "published" }),
      }),
    );

    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toMatchObject({
      code: "HISTORICAL_PUBLICATION_REQUIREMENTS_NOT_MET",
      questionIds: ["historical-1"],
    });

    const [stillDraft] = await testDb
      .select({ status: schema.soal.status })
      .from(schema.soal)
      .where(eq(schema.soal.id, "historical-1"));
    expect(stillDraft?.status).toBe("draft");

    await client.execute(`
      INSERT INTO assessment_sources (id) VALUES ('source-1')
    `);
    await client.execute(`
      INSERT INTO ide (id, mata_kuliah_id, status)
      VALUES ('idea-1', 'course-1', 'published')
    `);
    await client.execute(`
      INSERT INTO soal_ide (id, soal_id, ide_id)
      VALUES ('link-1', 'historical-1', 'idea-1')
    `);

    const published = await PUT(
      new NextRequest("http://localhost/api/admin/questions", {
        method: "PUT",
        body: JSON.stringify({ ids: ["historical-1"], reviewStatus: "published" }),
      }),
    );

    expect(published.status).toBe(200);
    expect(await published.json()).toEqual({ updated: 1 });

    const [canonical] = await testDb
      .select({ status: schema.soal.status })
      .from(schema.soal)
      .where(eq(schema.soal.id, "historical-1"));
    const [compatibility] = await testDb
      .select({ reviewStatus: schema.aiQuestionBank.reviewStatus })
      .from(schema.aiQuestionBank)
      .where(eq(schema.aiQuestionBank.id, "historical-1"));
    expect(canonical?.status).toBe("published");
    expect(compatibility?.reviewStatus).toBe("published");
  });
});
