import { describe, expect, it, mock, beforeAll, afterAll } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const { client, testDb } = await createPostgresTestDb();

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

import { createHmac } from "node:crypto";

describe("Quiz Assembly Contract & MCP Tools", () => {
  const testCourseId = "perpindahan-panas";
  const testCanonicalCourseId = "mk-perpindahan-panas";
  const adminId = "admin-test-01";

  afterAll(async () => { await client.close(); });

  beforeAll(async () => {

    // Seed admin
    await client.query(`INSERT INTO "user" (id, name, email, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [adminId, "Admin Test", "admin@zyx.id", "admin", new Date(), new Date()]);
    await client.query(`INSERT INTO pengguna (id, status) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [adminId, "active"]);

    // Seed courses & mata_kuliah
    await client.query(`INSERT INTO courses (id, title, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [testCourseId, "Perpindahan Panas", "Teknik Mesin"]);
    await client.query(`INSERT INTO mata_kuliah (id, code, title, legacy_course_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [testCanonicalCourseId, testCourseId, "Perpindahan Panas", testCourseId]);

    // Seed bab
    await client.query(`INSERT INTO bab (id, mata_kuliah_id, code, title, order_index) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, ["bab-01-intro", testCanonicalCourseId, "ch-01", "Introduction to Heat Transfer", 1]);

    // Seed sample questions in soal
    for (let i = 1; i <= 5; i++) {
      await client.query(`INSERT INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, origin, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING`, [
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
        ]);
    }

    // Seed soal non-published (draft)
    await client.query(`INSERT INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, origin, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING`, [
        "soal-ht-draft",
        testCanonicalCourseId,
        "bab-01-intro",
        "multiple_choice",
        "Soal Masih Draft",
        JSON.stringify(["A", "B"]),
        "zyx_original",
        "draft",
        "easy",
        "remember",
        "recall",
        "hash-draft",
        adminId,
      ]);

    // Seed soal historical reference yang belum quiz-eligible
    await client.query(`INSERT INTO soal (id, mata_kuliah_id, bab_id, question_type, prompt, options_snapshot, origin, quiz_eligible, status, difficulty, cognitive_level, reasoning_pattern, generation_hash, creator_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT DO NOTHING`, [
        "soal-ht-hist-ineligible",
        testCanonicalCourseId,
        "bab-01-intro",
        "multiple_choice",
        "Soal Historical Belum Eligible",
        JSON.stringify(["A", "B"]),
        "historical_reference",
        false,
        "published",
        "hard",
        "analyze",
        "multi_step",
        "hash-hist",
        adminId,
      ]);
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
    await expect(
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
    await expect(
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

  it("gagal membuat kuis jika soal belum berstatus published", async () => {
    await expect(
      createQuizWithQuestions(
        {
          courseKey: testCourseId,
          title: "Kuis Draft Question",
          questionIds: ["soal-ht-draft"],
        },
        adminId,
      ),
    ).rejects.toThrow("QUIZ_ASSEMBLY_QUESTION_NOT_PUBLISHED");
  });

  it("gagal membuat kuis jika soal historical_reference belum quiz-eligible", async () => {
    await expect(
      createQuizWithQuestions(
        {
          courseKey: testCourseId,
          title: "Kuis Ineligible Historical",
          questionIds: ["soal-ht-hist-ineligible"],
        },
        adminId,
      ),
    ).rejects.toThrow("QUIZ_ASSEMBLY_QUESTION_NOT_ELIGIBLE");
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

  it("mcp server mendaftarkan semua tool quiz.* dan handler dapat dieksekusi", async () => {
    const principal: McpPrincipal = {
      userId: adminId,
      actorId: adminId,
      sessionId: "session-test-01",
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

    // Eksekusi write handler quiz.create untuk memverifikasi actorId diteruskan dengan benar
    const createTool = tools["quiz.create"];
    const res = await createTool.handler({
      courseKey: testCourseId,
      title: "Kuis via MCP Handler",
      questionIds: ["soal-ht-1", "soal-ht-2"],
      timeLimitSeconds: 1500,
    });
    expect(res).toBeDefined();
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent.ok).toBe(true);
    expect(res.structuredContent.title).toBe("Kuis via MCP Handler");
    expect(res.structuredContent.questionCount).toBe(2);

    // Bug 1 Acceptance Test: catalog.list_courses().choices[i].key and catalog.list_chapters().choices[i].key resolve directly in quiz.list and quiz.create
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-quiz-catalog-key";
    const coursesRes = await tools["catalog.list_courses"].handler({});
    expect(coursesRes.isError).toBeUndefined();
    const courseChoice = coursesRes.structuredContent.choices.find(
      (c: any) => c.code === testCourseId,
    );
    expect(courseChoice).toBeDefined();
    expect(courseChoice.key).not.toBe(testCourseId);

    const chaptersRes = await tools["catalog.list_chapters"].handler({
      courseKey: courseChoice.key,
    });
    expect(chaptersRes.isError).toBeUndefined();
    const chapterChoice = chaptersRes.structuredContent.choices[0];
    expect(chapterChoice).toBeDefined();

    const listBySignedKey = await tools["quiz.list"].handler({
      courseKey: courseChoice.key,
    });
    expect(listBySignedKey.isError).toBeUndefined();
    expect(listBySignedKey.structuredContent.ok).toBe(true);
    expect(listBySignedKey.structuredContent.courseId).toBe(testCourseId);
    expect(listBySignedKey.structuredContent.canonicalCourseId).toBe(testCanonicalCourseId);
    // Ensure signed token is not echoed back as courseKey
    expect(listBySignedKey.structuredContent.courseKey).toBe(testCanonicalCourseId);
    expect(listBySignedKey.structuredContent.quizzes.length).toBeGreaterThanOrEqual(1);

    const createBySignedKey = await tools["quiz.create"].handler({
      courseKey: courseChoice.key,
      chapterKey: chapterChoice.key,
      title: "Kuis via Signed Catalog Key",
      questionIds: ["soal-ht-1", "soal-ht-2"],
      timeLimitSeconds: 1200,
    });
    expect(createBySignedKey.isError).toBeUndefined();
    expect(createBySignedKey.structuredContent.ok).toBe(true);
    expect(createBySignedKey.structuredContent.courseId).toBe(testCourseId);
    expect(createBySignedKey.structuredContent.canonicalCourseId).toBe(testCanonicalCourseId);

    // Ensure missing course error does not leak the raw signed key
    const fakeKey = "signed-secret-key-should-not-leak-in-error";
    const missingRes = await tools["quiz.list"].handler({
      courseKey: fakeKey,
    });
    expect(missingRes.isError).toBe(true);
    expect(missingRes.structuredContent.error).toBe("QUIZ_ASSEMBLY_COURSE_NOT_FOUND");
    expect(JSON.stringify(missingRes)).not.toContain(fakeKey);

    // Negative Token Verification Tests (Bug 1 strengthened):
    // 1. Tampered signature must fail with AUTHORING_MCP_TOKEN_INVALID and NEVER fall back to legacy ID lookup
    const [validBody, validSig] = courseChoice.key.split(".");
    const tamperedSig = (validSig[0] === "a" ? "b" : "a") + validSig.slice(1);
    const tamperedToken = `${validBody}.${tamperedSig}`;
    const tamperedRes = await tools["quiz.list"].handler({
      courseKey: tamperedToken,
    });
    expect(tamperedRes.isError).toBe(true);
    expect(tamperedRes.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_INVALID");

    // Also test a token-shaped string whose first segment is a valid legacy courseId ("perpindahan-panas.fakesig")
    const legacyShapedTampered = `${testCourseId}.fakesignature123`;
    const legacyShapedRes = await tools["quiz.list"].handler({
      courseKey: legacyShapedTampered,
    });
    expect(legacyShapedRes.isError).toBe(true);
    expect(legacyShapedRes.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_INVALID");

    // 2. Expired token must fail with AUTHORING_MCP_TOKEN_EXPIRED
    const decodedCoursePayload = JSON.parse(Buffer.from(validBody, "base64url").toString("utf8"));
    const expiredBody = Buffer.from(
      JSON.stringify({
        ...decodedCoursePayload,
        issuedAt: Date.now() - 120_000,
        expiresAt: Date.now() - 60_000,
      }),
      "utf8",
    ).toString("base64url");
    const derivedSigningSecret = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
      .update("zyx-authoring-mcp.v1", "utf8")
      .digest("hex");
    const expiredSig = createHmac("sha256", derivedSigningSecret)
      .update(expiredBody, "utf8")
      .digest("base64url");
    const expiredToken = `${expiredBody}.${expiredSig}`;
    const expiredRes = await tools["quiz.list"].handler({
      courseKey: expiredToken,
    });
    expect(expiredRes.isError).toBe(true);
    expect(expiredRes.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_EXPIRED");

    // 3. Wrong token kind: chapter_choice passed as courseKey or course_choice passed as chapterKey
    const wrongKindCourseRes = await tools["quiz.list"].handler({
      courseKey: chapterChoice.key,
    });
    expect(wrongKindCourseRes.isError).toBe(true);
    expect(wrongKindCourseRes.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_INVALID");

    const wrongKindChapterRes = await tools["quiz.create"].handler({
      courseKey: courseChoice.key,
      chapterKey: courseChoice.key,
      title: "Wrong Kind Chapter Test",
      questionIds: ["soal-ht-1", "soal-ht-2"],
    });
    expect(wrongKindChapterRes.isError).toBe(true);
    expect(wrongKindChapterRes.structuredContent.error).toBe("AUTHORING_MCP_TOKEN_INVALID");

    // 4. Chapter belonging to another course must fail with AUTHORING_MCP_SCOPE_MISMATCH
    await client.query(`INSERT INTO courses (id, title, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, ["kimia-dasar-1", "Kimia Dasar I", "TPB"]);
    await client.query(`INSERT INTO mata_kuliah (id, code, title, legacy_course_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, ["mk-kimia-dasar-1", "kimia-dasar-1", "Kimia Dasar I", "kimia-dasar-1"]);
    await client.query(`INSERT INTO bab (id, mata_kuliah_id, code, title, order_index) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, ["bab-ki-1", "mk-kimia-dasar-1", "BAB-01", "Stoikiometri", 1]);

    const coursesRes2 = await tools["catalog.list_courses"].handler({});
    const kimiaCourseChoice = coursesRes2.structuredContent.choices.find(
      (c: any) => c.code === "kimia-dasar-1",
    );
    expect(kimiaCourseChoice).toBeDefined();
    const kimiaChaptersRes = await tools["catalog.list_chapters"].handler({
      courseKey: kimiaCourseChoice.key,
    });
    const kimiaChapterChoice = kimiaChaptersRes.structuredContent.choices[0];
    expect(kimiaChapterChoice).toBeDefined();

    const crossCourseChapterRes = await tools["quiz.create"].handler({
      courseKey: courseChoice.key, // Perpindahan Panas
      chapterKey: kimiaChapterChoice.key, // Kimia Dasar I chapter
      title: "Cross Course Mismatch Quiz",
      questionIds: ["soal-ht-1", "soal-ht-2"],
    });
    expect(crossCourseChapterRes.isError).toBe(true);
    expect(crossCourseChapterRes.structuredContent.error).toBe("AUTHORING_MCP_SCOPE_MISMATCH");
  });
});
