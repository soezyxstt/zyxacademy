import { describe, it, expect } from "bun:test";
import { executeToolCall } from "@/lib/admin-ops-ai/tools";
import { executeOpsAiTool } from "@/lib/admin-ops-ai/runtime-tools";
import { introspectDbSchema } from "@/lib/admin-ops-ai/schema-introspection";
import { db } from "@/db";
import { courseMaterials, chapters } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";

describe("Zyx Ops AI Tools & Schema Introspection", () => {
  it("introspects known tables in database schema", async () => {
    const allSchema = await introspectDbSchema();
    expect(allSchema.tables.length).toBeGreaterThan(3);

    const userTable = await introspectDbSchema("user");
    expect(userTable.tables.length).toBe(1);
    expect(userTable.tables[0].tableName).toBe("user");
    expect(userTable.tables[0].columns.some((c) => c.name === "role")).toBe(true);
  });

  it("handles navigate_admin tool properly", async () => {
    const res = await executeToolCall("navigate_admin", { destination: "flags" });
    expect(res.data).toBeDefined();
    expect((res.data as any).href).toBe("/admin/ops/flags");
  });

  it("generates a structured proposal for create_token", async () => {
    const res = await executeToolCall("propose_create_token", {
      courseIds: "kalkulus-1,fisika-dasar",
      capacity: "4",
    });

    expect(res.proposal).toBeDefined();
    expect(res.proposal?.type).toBe("create_token");
    expect(res.proposal?.status).toBe("pending");
    expect(res.proposal?.params.capacity).toBe(4);
  });

  it("generates a structured proposal for toggle_flag", async () => {
    const res = await executeToolCall("propose_toggle_flag", {
      flagKey: "FEATURE_PKA",
      enabled: "true",
      reason: "Testing toggle flag",
    });

    expect(res.proposal).toBeDefined();
    expect(res.proposal?.params.flagKey).toBe("FEATURE_PKA");
    expect(res.proposal?.params.enabled).toBe(true);
  });
});

describe("Zyx Ops AI - Expanded Autonomous & Query Tools", () => {
  const adminContext = { callerRole: "admin", actorId: "test-admin" };
  const sharedCourseId = `test-ops-${Date.now()}`;

  describe("Academic & Curriculum Tools", () => {
    it("lists courses with active stats", async () => {
      const res = await executeOpsAiTool("list_courses", {}, adminContext);
      expect(res.summary).toContain("mata kuliah");
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("creates a new course autonomously", async () => {
      const res = await executeOpsAiTool(
        "create_course",
        {
          id: sharedCourseId,
          title: "Mata Kuliah Uji Coba",
          category: "Matematika",
          description: "Deskripsi kursus uji coba",
        },
        adminContext
      );
      expect(res.summary).toContain("berhasil dibuat");
      expect((res.data as any).id).toBe(sharedCourseId);
    });

    it("creates batch chapters for a course atomically", async () => {
      const res = await executeOpsAiTool(
        "batch_create_chapters",
        {
          courseId: sharedCourseId,
          chapters: [
            { title: "Bab 1 Pendahuluan" },
            { title: "Bab 2 Konsep Dasar" },
            { title: "Bab 3 Latihan Soal" },
          ],
        },
        adminContext
      );
      expect(res.summary).toContain("Berhasil membuat 3 bab");
      expect((res.data as any).createdCount).toBe(3);
    });

    it("lists and searches chapters across courses", async () => {
      const res = await executeOpsAiTool(
        "list_chapters",
        {
          courseId: sharedCourseId,
          search: "Konsep Dasar",
        },
        adminContext
      );
      expect(res.summary).toContain("bab materi");
      expect(Array.isArray(res.data)).toBe(true);
      const matched = (res.data as any[]).find((c) => c.title === "Bab 2 Konsep Dasar");
      expect(matched).toBeDefined();
      expect(matched.courseId).toBe(sharedCourseId);
    });

    it("audits course completeness and identifies missing materials", async () => {
      const res = await executeOpsAiTool(
        "audit_course_completeness",
        { courseId: sharedCourseId },
        adminContext
      );
      expect(res.summary).toContain("Audit Kelengkapan");
      expect((res.data as any).totalChapters).toBe(3);
      expect((res.data as any).emptyCount).toBe(3);
    });

    it("bulk updates materials metadata autonomously", async () => {
      const matId1 = `mat-test-${Date.now()}-1`;
      const matId2 = `mat-test-${Date.now()}-2`;
      await db.insert(courseMaterials).values([
        {
          id: matId1,
          courseId: sharedCourseId,
          title: "Materi Awal 1",
          type: "materi",
          subcategory: "materi_dosen",
          year: 2023,
          fileUrl: "courses/test/m1.pdf",
          chapterIds: ["ch-1"],
        },
        {
          id: matId2,
          courseId: sharedCourseId,
          title: "Materi Awal 2",
          type: "soal",
          subcategory: "uts",
          year: 2023,
          fileUrl: "courses/test/m2.pdf",
          chapterIds: ["ch-1", "ch-2"],
        },
      ]);

      const updateRes = await executeOpsAiTool(
        "bulk_update_materials",
        {
          materialIds: [matId1, matId2],
          patch: {
            year: 2024,
            addChapterIds: ["ch-3"],
          },
        },
        adminContext
      );

      expect(updateRes.summary).toContain("Berhasil memperbarui metadata 2 berkas materi");
      expect((updateRes.data as any).updatedCount).toBe(2);

      const checkList = await db.select().from(courseMaterials).where(inArray(courseMaterials.id, [matId1, matId2]));
      expect(checkList.find((m) => m.id === matId1)?.year).toBe(2024);
      expect(checkList.find((m) => m.id === matId1)?.chapterIds).toContain("ch-3");
      expect(checkList.find((m) => m.id === matId2)?.year).toBe(2024);
      expect(checkList.find((m) => m.id === matId2)?.chapterIds).toContain("ch-3");
    });

    it("rolls back all chapters if chapter creation fails on an invalid item", async () => {
      const beforeChapters = await db.select().from(chapters).where(eq(chapters.courseId, sharedCourseId));

      await expect(
        executeOpsAiTool(
          "batch_create_chapters",
          {
            courseId: sharedCourseId,
            chapters: [
              { title: "Bab Valid Transaksi" },
              { title: "" }, // Invalid title causing failure
            ],
          },
          adminContext
        )
      ).rejects.toThrow("Bab pada indeks 2 memiliki judul kosong");

      const afterChapters = await db.select().from(chapters).where(eq(chapters.courseId, sharedCourseId));
      expect(afterChapters.length).toBe(beforeChapters.length);
      expect(afterChapters.some((c) => c.title === "Bab Valid Transaksi")).toBe(false);
    });

    it("rejects bulk updating materials when some IDs are missing", async () => {
      const matIdValid = `mat-valid-${Date.now()}`;
      await db.insert(courseMaterials).values({
        id: matIdValid,
        courseId: sharedCourseId,
        title: "Materi Valid Pra-Uji",
        type: "materi",
        year: 2020,
        fileUrl: "courses/test/valid.pdf",
        chapterIds: ["ch-1"],
      });

      await expect(
        executeOpsAiTool(
          "bulk_update_materials",
          {
            materialIds: [matIdValid, "mat-non-existent-999"],
            patch: { year: 2026 },
          },
          adminContext
        )
      ).rejects.toThrow("Sebagian berkas materi tidak ditemukan");

      const [checked] = await db.select().from(courseMaterials).where(eq(courseMaterials.id, matIdValid));
      expect(checked.year).toBe(2020);
    });
  });

  describe("Assessment & Question Bank Tools", () => {
    it("lists quizzes and creates a new quiz autonomously", async () => {
      const listRes = await executeOpsAiTool("list_quizzes", {}, adminContext);
      expect(listRes.summary).toContain("kuis");

      const createRes = await executeOpsAiTool(
        "create_quiz",
        {
          courseId: sharedCourseId,
          title: "Kuis Diagnostik Integral",
          durationMinutes: 45,
          category: "chapter",
        },
        adminContext
      );
      expect(createRes.summary).toContain("berhasil dibuat");
      expect((createRes.data as any).title).toBe("Kuis Diagnostik Integral");
    });

    it("creates a question in question bank", async () => {
      const res = await executeOpsAiTool(
        "create_question",
        {
          courseId: sharedCourseId,
          prompt: "Berapa turunan dari f(x) = x^2?",
          options: ["2x", "x^2", "2", "x"],
          correctAnswer: "2x",
          difficulty: "easy",
          explanation: "Turunan pangkat nx^{n-1} adalah 2x.",
        },
        adminContext
      );
      expect(res.summary).toContain("berhasil dibuat");
      expect((res.data as any).prompt).toContain("turunan");
    });

    it("handles reset_quiz_attempt validation and rejects missing attempt", async () => {
      expect(
        executeOpsAiTool(
          "reset_quiz_attempt",
          {
            attemptId: "non-existent-attempt-999",
            reason: "Reset kendala teknis",
          },
          adminContext
        )
      ).rejects.toThrow("tidak ditemukan");
    });
  });

  describe("Study Groups & Instant Tokens", () => {
    it("creates a study group and generates an instant enrollment token", async () => {
      const groupRes = await executeOpsAiTool(
        "create_study_group",
        {
          name: "Kelompok Belajar Sigma",
          courseIds: [sharedCourseId],
          capacity: 4,
        },
        adminContext
      );
      expect(groupRes.summary).toContain("Kelompok belajar 'Kelompok Belajar Sigma'");

      const tokenRes = await executeOpsAiTool(
        "create_enrollment_token",
        {
          courseIds: [sharedCourseId],
          capacity: 3,
        },
        adminContext
      );
      expect(tokenRes.summary).toContain("Token aktivasi");
      expect((tokenRes.data as any).token).toMatch(/^Zyx-[A-Z0-9]+-3-1$/);
    });

    it("diagnoses student access and handles unknown user", async () => {
      const notFoundRes = await executeOpsAiTool(
        "diagnose_student_access",
        { userIdentifier: "non-existent-student@zyx.ac" },
        adminContext
      );
      expect(notFoundRes.summary).toContain("tidak ditemukan");
      expect((notFoundRes.data as any).found).toBe(false);

      const existingRes = await executeOpsAiTool(
        "diagnose_student_access",
        { userIdentifier: "admin", courseId: sharedCourseId },
        adminContext
      );
      expect(existingRes.summary).toContain("Hasil Diagnosa");
      expect((existingRes.data as any).courseAccessEvaluation).toBeDefined();
    });
  });

  describe("Ops, Feature Flags & Short Links", () => {
    it("reads and toggles feature flags", async () => {
      const flagsRes = await executeOpsAiTool("get_feature_flags", {}, adminContext);
      expect(flagsRes.summary).toContain("Feature Flags");

      const toggleRes = await executeOpsAiTool(
        "set_feature_flag",
        {
          flagKey: "FEATURE_PKA",
          enabled: true,
          reason: "Diaktifkan via test",
        },
        adminContext
      );
      expect(toggleRes.summary).toContain("berhasil diubah");
    });

    it("creates a short redirect link", async () => {
      const testSlug = `link-${Date.now()}`;
      const res = await executeOpsAiTool(
        "create_short_link",
        {
          slug: testSlug,
          url: "https://zyx.academy/dashboard",
          title: "Dashboard Redirect",
        },
        adminContext
      );
      expect(res.summary).toContain(`/s/${testSlug}`);
      expect((res.data as any).shortUrl).toBe(`/s/${testSlug}`);
    });

    it("rejects autonomous mutation when caller is not admin", async () => {
      expect(
        executeOpsAiTool(
          "create_course",
          { id: "hacker-course", title: "Hacker Course", category: "Umum" },
          { callerRole: "student", actorId: "student-123" }
        )
      ).rejects.toThrow("Forbidden: Mutasi otonom");
    });
  });
});
