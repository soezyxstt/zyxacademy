import { describe, expect, it, mock, beforeAll, beforeEach } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });

mock.module("@/db", () => ({
  db: testDb,
}));

mock.module("@/lib/db", () => ({
  db: testDb,
}));

import {
  createQuizWithQuestions,
  getQuizDetail,
  listQuizzes,
  updateQuizMeta,
  setQuizQuestions,
} from "@/lib/authoring/quiz-assembly";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";

async function setupTables() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT DEFAULT 'student',
      last_activity_at INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pengguna (
      id TEXT PRIMARY KEY REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      price INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS mata_kuliah (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      legacy_course_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bab (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      legacy_chapter_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS soal (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      bab_id TEXT REFERENCES bab(id),
      question_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_snapshot TEXT NOT NULL DEFAULT '[]',
      origin TEXT NOT NULL DEFAULT 'zyx_original',
      source_event_name TEXT,
      source_reference_id TEXT,
      assessment_source_id TEXT,
      source_question_number TEXT,
      source_question_part TEXT,
      source_page INTEGER,
      source_locator TEXT,
      answer_provenance TEXT,
      solution_provenance TEXT,
      quiz_eligible INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      difficulty TEXT NOT NULL,
      cognitive_level TEXT NOT NULL,
      reasoning_pattern TEXT NOT NULL,
      generation_hash TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES pengguna(id),
      curator_id TEXT REFERENCES pengguna(id),
      published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS quiz_templates (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'draft',
      time_limit_seconds INTEGER,
      max_attempts INTEGER,
      selection_rules TEXT NOT NULL,
      open_at INTEGER,
      close_at INTEGER,
      manual_status TEXT NOT NULL DEFAULT 'scheduled',
      show_discussion INTEGER NOT NULL DEFAULT 0,
      spreadsheet_id TEXT,
      spreadsheet_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS blueprint_asesmen (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      title TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      blueprint TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      generation_hash TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES pengguna(id),
      curator_id TEXT REFERENCES pengguna(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS asesmen (
      id TEXT PRIMARY KEY,
      blueprint_asesmen_id TEXT NOT NULL REFERENCES blueprint_asesmen(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      title TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      generation_hash TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES pengguna(id),
      curator_id TEXT REFERENCES pengguna(id),
      published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS cakupan_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL REFERENCES asesmen(id),
      bab_id TEXT NOT NULL REFERENCES bab(id),
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS item_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL REFERENCES asesmen(id),
      soal_id TEXT NOT NULL REFERENCES soal(id),
      order_index INTEGER NOT NULL DEFAULT 0,
      rendered_question_snapshot TEXT NOT NULL DEFAULT '{}',
      option_order_snapshot TEXT NOT NULL DEFAULT '[]',
      grading_policy_snapshot TEXT NOT NULL DEFAULT '{}',
      content_version INTEGER NOT NULL DEFAULT 1,
      generation_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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

describe("Quiz Assembly Contract & MCP Tools", () => {
  const testCourseId = "perpindahan-panas";
  const testCanonicalCourseId = "mk-perpindahan-panas";
  const adminId = "admin-test-01";

  beforeAll(async () => {
    await setupTables();

    // Seed admin
    await client.execute({
      sql: `INSERT OR IGNORE INTO user (id, name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [adminId, "Admin Test", "admin@zyx.id", "admin", Date.now(), Date.now()],
    });
    await client.execute({
      sql: `INSERT OR IGNORE INTO pengguna (id, status) VALUES (?, ?)`,
      args: [adminId, "active"],
    });

    // Seed courses & mata_kuliah
    await client.execute({
      sql: `INSERT OR IGNORE INTO courses (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: [testCourseId, "Perpindahan Panas", Date.now(), Date.now()],
    });
    await client.execute({
      sql: `INSERT OR IGNORE INTO mata_kuliah (id, code, title, legacy_course_id) VALUES (?, ?, ?, ?)`,
      args: [testCanonicalCourseId, testCourseId, "Perpindahan Panas", testCourseId],
    });

    // Seed bab
    await client.execute({
      sql: `INSERT OR IGNORE INTO bab (id, mata_kuliah_id, code, title, order_index) VALUES (?, ?, ?, ?, ?)`,
      args: ["bab-01-intro", testCanonicalCourseId, "ch-01", "Introduction to Heat Transfer", 1],
    });

    // Seed sample questions in soal
    for (let i = 1; i <= 5; i++) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, origin, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `soal-ht-${i}`,
          testCanonicalCourseId,
          "bab-01-intro",
          "multiple_choice",
          `Soal Pertanyaan ${i}`,
          JSON.stringify(["A", "B", "C", "D"]),
          "zyx_original",
          "published",
          "medium",
          "apply",
          "direct_application",
          `hash-${i}`,
          adminId,
        ],
      });
    }
  });

  it("berhasil membuat kuis dengan kumpulan questionIds (quiz.create)", async () => {
    const questionIds = ["soal-ht-1", "soal-ht-2", "soal-ht-3"];
    const result = await createQuizWithQuestions(
      {
        courseKey: testCourseId,
        title: "Kuis Introduction",
        category: "chapter",
        chapterKey: "bab-01-intro",
        questionIds,
        timeLimitSeconds: 1200,
        status: "draft",
      },
      adminId,
    );

    expect(result.ok).toBe(true);
    expect(result.quizId).toBeDefined();
    expect(result.title).toBe("Kuis Introduction");
    expect(result.questionCount).toBe(3);
    expect(result.questionIds).toEqual(questionIds);

    // Verifikasi sync ke database: quiz_templates
    const [tpl] = await testDb
      .select()
      .from(schema.quizTemplates)
      .where(eq(schema.quizTemplates.id, result.quizId));
    expect(tpl).toBeDefined();
    expect(tpl.title).toBe("Kuis Introduction");
    const rules =
      typeof tpl.selectionRules === "string"
        ? JSON.parse(tpl.selectionRules)
        : (tpl.selectionRules as Record<string, unknown>);
    expect(rules.count).toBe(3);
    expect(rules.fixedQuestionIds).toEqual(questionIds);

    // Verifikasi sync ke item_asesmen
    const items = await testDb
      .select()
      .from(schema.itemAsesmen)
      .where(eq(schema.itemAsesmen.asesmenId, result.quizId));
    expect(items.length).toBe(3);
  });

  it("gagal membuat kuis jika ada questionId yang tidak ditemukan", async () => {
    expect(
      createQuizWithQuestions(
        {
          courseKey: testCourseId,
          title: "Kuis Invalid",
          questionIds: ["soal-ht-1", "soal-fiktif-999"],
        },
        adminId,
      ),
    ).rejects.toThrow("QUIZ_ASSEMBLY_QUESTION_NOT_FOUND");
  });

  it("gagal membuat kuis jika daftar questionIds kosong", async () => {
    expect(
      createQuizWithQuestions(
        {
          courseKey: testCourseId,
          title: "Kuis Kosong",
          questionIds: [],
        },
        adminId,
      ),
    ).rejects.toThrow("QUIZ_ASSEMBLY_EMPTY_QUESTIONS");
  });

  it("berhasil mengambil detail kuis beserta ringkasan soalnya (quiz.get)", async () => {
    const questionIds = ["soal-ht-4", "soal-ht-5"];
    const created = await createQuizWithQuestions(
      {
        courseKey: testCourseId,
        title: "Kuis Conduction",
        category: "chapter",
        questionIds,
        timeLimitSeconds: 1800,
        status: "published",
      },
      adminId,
    );

    const detail = await getQuizDetail(created.quizId);
    expect(detail.ok).toBe(true);
    expect(detail.quiz.title).toBe("Kuis Conduction");
    expect(detail.quiz.status).toBe("published");
    expect(detail.quiz.questionCount).toBe(2);
    expect(detail.questions.length).toBe(2);
    expect(detail.questions[0].id).toBe("soal-ht-4");
  });

  it("berhasil mendaftar kuis pada mata kuliah (quiz.list)", async () => {
    const list = await listQuizzes({
      courseKey: testCourseId,
    });

    expect(list.ok).toBe(true);
    expect(list.quizzes.length).toBeGreaterThanOrEqual(2);
  });

  it("berhasil memperbarui metadata kuis (quiz.update)", async () => {
    const created = await createQuizWithQuestions(
      {
        courseKey: testCourseId,
        title: "Kuis To Update",
        questionIds: ["soal-ht-1"],
      },
      adminId,
    );

    const updated = await updateQuizMeta(
      {
        quizId: created.quizId,
        title: "Kuis Updated Title",
        timeLimitSeconds: 2400,
        status: "published",
      },
      adminId,
    );

    expect(updated.ok).toBe(true);

    const detail = await getQuizDetail(created.quizId);
    expect(detail.quiz.title).toBe("Kuis Updated Title");
    expect(detail.quiz.timeLimitSeconds).toBe(2400);
    expect(detail.quiz.status).toBe("published");
  });

  it("berhasil mengganti daftar soal pada kuis (quiz.set_questions)", async () => {
    const created = await createQuizWithQuestions(
      {
        courseKey: testCourseId,
        title: "Kuis Set Questions",
        questionIds: ["soal-ht-1"],
      },
      adminId,
    );

    const newQuestionIds = ["soal-ht-2", "soal-ht-3", "soal-ht-4"];
    const setRes = await setQuizQuestions(created.quizId, newQuestionIds, adminId);

    expect(setRes.ok).toBe(true);
    expect(setRes.questionCount).toBe(3);

    const detail = await getQuizDetail(created.quizId);
    expect(detail.quiz.questionCount).toBe(3);
    expect(detail.questions.map((q) => q.id)).toEqual(newQuestionIds);
  });

  it("mcp server mendaftarkan semua tool quiz.*", () => {
    const principal: McpPrincipal = {
      user: { id: adminId, name: "Admin Test", email: "admin@zyx.id", role: "admin" },
      roles: ["admin"],
      scopes: ["authoring:read", "authoring:stage"],
      authMethod: "session",
    };

    const server = createAuthoringMcpServer(principal);
    expect(server).toBeDefined();

    // Periksa bahwa tools terdaftar di instance McpServer
    const tools = (server as any)._registeredTools || (server as any).tools;
    expect(tools).toBeDefined();
    expect(tools["quiz.create"]).toBeDefined();
    expect(tools["quiz.get"]).toBeDefined();
    expect(tools["quiz.list"]).toBeDefined();
    expect(tools["quiz.update"]).toBeDefined();
    expect(tools["quiz.set_questions"]).toBeDefined();
  });
});
