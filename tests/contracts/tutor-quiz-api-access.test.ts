import { describe, expect, it, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let mockSession: any = null;

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"];
const dbProxy = new Proxy({} as typeof testDb, {
  get(_target, key) {
    const value = Reflect.get(testDb, key);
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});
beforeAll(async () => {
  ({ client, testDb } = await createPostgresTestDb());
}, 60_000);
afterAll(async () => { await client?.close(); });

mock.module("@/db", () => ({
  db: dbProxy,
}));

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
  },
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

mock.module("@/lib/notifications/send", () => ({
  notifyQuizPublishedBestEffort: async () => {},
}));

import { POST, GET } from "@/app/api/quiz/templates/route";
import { PATCH, DELETE } from "@/app/api/quiz/templates/[id]/route";
import { GET as getQuizAttempts } from "@/app/api/admin/quiz-insights/[id]/attempts/route";

async function seedApiData() {
  const now = new Date();
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]).onConflictDoNothing();

  // Tutor 1
  await testDb.insert(schema.user).values({
    id: "usr-tutor-1",
    name: "Tutor Satu",
    email: "tutor1@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-1",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-1",
    penggunaId: "usr-tutor-1",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Admin 1
  await testDb.insert(schema.user).values({
    id: "usr-admin-1",
    name: "Admin Satu",
    email: "admin1@zyx.test",
    role: "admin",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-admin-1",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-admin-1",
    penggunaId: "usr-admin-1",
    peranId: "peran-admin",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Student 1
  await testDb.insert(schema.user).values({
    id: "usr-student-1",
    name: "Murid Satu",
    email: "student1@zyx.test",
    role: "student",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Course 1 (assigned to Tutor 1)
  await testDb.insert(schema.courses).values({
    id: "crs-calc",
    title: "Kalkulus 1",
    category: "Matematika",
  }).onConflictDoNothing();

  await testDb.insert(schema.mataKuliah).values({
    id: "mk-calc",
    code: "MA-1101",
    title: "Kalkulus 1",
    status: "active",
    legacyCourseId: "crs-calc",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penugasanTutor).values({
    id: "pt-tutor-1",
    penggunaId: "usr-tutor-1",
    mataKuliahId: "mk-calc",
    status: "active",
    assignmentScope: "course",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Course 2 (unassigned)
  await testDb.insert(schema.courses).values({
    id: "crs-physics",
    title: "Fisika Dasar 1",
    category: "Fisika",
  }).onConflictDoNothing();

  await testDb.insert(schema.mataKuliah).values({
    id: "mk-physics",
    code: "FI-1101",
    title: "Fisika Dasar 1",
    status: "active",
    legacyCourseId: "crs-physics",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Existing quiz template in mk-calc
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-calc-1",
    courseId: "crs-calc",
    title: "Kuis Bab 1 Kalkulus",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: { count: 5 },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Existing simulation template in mk-calc
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-calc-sim",
    courseId: "crs-calc",
    title: "Simulasi Ujian Kalkulus",
    category: "simulation",
    visibility: "paid",
    status: "published",
    selectionRules: { count: 20, assessmentType: "tryout" },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Existing quiz template in mk-physics (unassigned course)
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-physics-1",
    courseId: "crs-physics",
    title: "Kuis Fisika Vektor",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: { count: 5 },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Draft quiz template in mk-calc (must never leak to students)
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-calc-draft",
    courseId: "crs-calc",
    title: "Kuis Draft Kalkulus",
    category: "daily",
    visibility: "free",
    status: "draft",
    selectionRules: { count: 5 },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Student 1 enrolled in Kalkulus until far in the future
  await testDb.insert(schema.enrollments).values({
    id: "enr-student-1",
    userId: "usr-student-1",
    courseId: "crs-calc",
    enrolledAt: now,
    expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
  }).onConflictDoNothing();

  // Attempt for student 1 in Kalkulus quiz
  await testDb.insert(schema.studentQuizAttempts).values({
    id: "att-calc-1",
    templateId: "tpl-calc-1",
    studentId: "usr-student-1",
    status: "completed",
    score: 85,
    durationSeconds: 300,
    answersSnapshot: { "q1": 0 },
    questionsSnapshot: [{ id: "q1", prompt: "2+2?", options: ["4", "5"], correctIndex: 0 }],
    startedAt: now,
    submittedAt: now,
  }).onConflictDoNothing();

  // Attempt for student 1 in Physics quiz
  await testDb.insert(schema.studentQuizAttempts).values({
    id: "att-physics-1",
    templateId: "tpl-physics-1",
    studentId: "usr-student-1",
    status: "completed",
    score: 90,
    durationSeconds: 400,
    answersSnapshot: { "q2": 1 },
    questionsSnapshot: [{ id: "q2", prompt: "F=?", options: ["ma", "mv"], correctIndex: 0 }],
    startedAt: now,
    submittedAt: now,
  }).onConflictDoNothing();
}

describe("Tutor Quiz Template API Access Controls", () => {
  beforeEach(async () => {
    await client.exec('TRUNCATE TABLE "user", peran, courses CASCADE');
    await seedApiData();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. POST /api/quiz/templates
   * ──────────────────────────────────────────────────────────────────────── */
  describe("POST /api/quiz/templates", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession = null;
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Kuis Baru",
          category: "daily",
          selectionRules: { count: 5 },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("allows tutor to create quiz in assigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Kuis Harian Aljabar",
          category: "daily",
          visibility: "free",
          timeLimitSeconds: 600,
          maxAttempts: 1,
          selectionRules: { count: 5 },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.templateId).toBeDefined();
    });

    it("returns 403 when tutor attempts to create quiz in unassigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-physics",
          title: "Kuis Fisika Gelombang",
          category: "daily",
          selectionRules: { count: 5 },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("returns 403 when tutor attempts to create simulation or tryout assessmentType", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

      // Simulation category
      const reqSim = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Simulasi Ujian Nasional",
          category: "simulation",
          selectionRules: { count: 15 },
        }),
      });

      const resSim = await POST(reqSim);
      expect(resSim.status).toBe(403);

      // Tryout assessmentType
      const reqTryout = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Kuis Tryout Scope",
          category: "chapter",
          selectionRules: { count: 10, assessmentType: "tryout" },
        }),
      });

      const resTryout = await POST(reqTryout);
      expect(resTryout.status).toBe(403);
    });

    it("allows admin to create simulation in any active course", async () => {
      mockSession = { user: { id: "usr-admin-1", role: "admin" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-physics",
          title: "Simulasi Fisika Admin",
          category: "simulation",
          selectionRules: { count: 20 },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("records rejected and successful audits for tutor quiz creation", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

      // Rejected: unassigned course
      const reqDenied = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-physics",
          title: "Kuis Tidak Sah",
          category: "daily",
          selectionRules: { count: 5 },
        }),
      });
      const resDenied = await POST(reqDenied);
      expect(resDenied.status).toBe(403);

      // Success: assigned course
      const reqOk = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Kuis Audit Sukses",
          category: "weekly",
          visibility: "free",
          timeLimitSeconds: 900,
          maxAttempts: 2,
          selectionRules: { count: 8 },
        }),
      });
      const resOk = await POST(reqOk);
      expect(resOk.status).toBe(201);
      const okJson = await resOk.json();

      const audits = await testDb.select().from(schema.auditMutasi);
      const createAudits = audits.filter(
        (a) => a.entityType === "quiz_template" && a.action === "quiz:create",
      );
      const deniedAudit = createAudits.find((a) => a.outcome === "rejected");
      expect(deniedAudit).toBeDefined();
      expect(deniedAudit?.actorId).toBe("usr-tutor-1");
      expect(deniedAudit?.courseId).toBe("mk-physics");
      const successAudit = createAudits.find(
        (a) => a.outcome === "success" && a.entityId === okJson.templateId,
      );
      expect(successAudit).toBeDefined();
      expect(successAudit?.actorId).toBe("usr-tutor-1");
    });

    it("rejects and audits malformed JSON in POST /api/quiz/templates", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: "{ not a valid json payload",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const audits = await testDb.select().from(schema.auditMutasi);
      const malformedAudit = audits.find(
        (a) =>
          a.entityType === "quiz_template" &&
          a.action === "quiz:create" &&
          a.outcome === "rejected" &&
          a.reason?.includes("Malformed JSON"),
      );
      expect(malformedAudit).toBeDefined();
      expect(malformedAudit?.actorId).toBe("usr-tutor-1");
      expect(malformedAudit?.courseId).toBe("unknown");
    });

    it("rejects and audits missing or blank courseId in POST /api/quiz/templates", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "  ",
          title: "Kuis Tanpa Kelas",
          category: "daily",
          selectionRules: { count: 5 },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const audits = await testDb.select().from(schema.auditMutasi);
      const blankAudit = audits.find(
        (a) =>
          a.entityType === "quiz_template" &&
          a.action === "quiz:create" &&
          a.outcome === "rejected" &&
          a.reason?.includes("courseId"),
      );
      expect(blankAudit).toBeDefined();
      expect(blankAudit?.actorId).toBe("usr-tutor-1");
      expect(blankAudit?.courseId).toBe("unknown");
    });

    it("resolves canonical and legacy course IDs before checking duplicate tags", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

      // Templates reference courses.id; requests may use the linked canonical ID.
      await testDb.insert(schema.quizTemplates).values({
        id: "tpl-calc-tag-1",
        courseId: "crs-calc",
        title: "Kuis Aljabar Dasar",
        category: "chapter",
        visibility: "free",
        status: "published",
        selectionRules: { count: 5, tags: ["aljabar-dasar"] },
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      // The canonical identifier must find the existing legacy projection.
      const req = new NextRequest("http://localhost:3000/api/quiz/templates", {
        method: "POST",
        body: JSON.stringify({
          courseId: "mk-calc",
          title: "Kuis Aljabar Duplikat",
          category: "chapter",
          visibility: "free",
          selectionRules: { count: 5, tags: ["aljabar-dasar"] },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("Kuis dengan tag bab ini sudah ada di kelas ini.");

      const audits = await testDb.select().from(schema.auditMutasi);
      const dupAudit = audits.find(
        (a) =>
          a.entityType === "quiz_template" &&
          a.action === "quiz:create" &&
          a.outcome === "rejected" &&
          a.reason?.includes("tag bab"),
      );
      expect(dupAudit).toBeDefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. GET /api/quiz/templates (role and course scoping)
   * ──────────────────────────────────────────────────────────────────────── */
  describe("GET /api/quiz/templates", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession = null;
      const res = await GET(new NextRequest("http://localhost:3000/api/quiz/templates"));
      expect(res.status).toBe(401);
    });

    it("returns only free published quizzes of enrolled courses for students", async () => {
      mockSession = { user: { id: "usr-student-1", role: "student" } };

      const res = await GET(
        new NextRequest("http://localhost:3000/api/quiz/templates?courseId=mk-calc"),
      );
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.map((r: { id: string }) => r.id)).toEqual(["tpl-calc-1"]);
    });

    it("rejects students querying courses without an active enrollment", async () => {
      mockSession = { user: { id: "usr-student-1", role: "student" } };

      const resUnknown = await GET(
        new NextRequest("http://localhost:3000/api/quiz/templates?courseId=mk-physics"),
      );
      expect(resUnknown.status).toBe(403);

      const resNoCourseId = await GET(new NextRequest("http://localhost:3000/api/quiz/templates"));
      expect(resNoCourseId.status).toBe(200);
      const noCourseRows = await resNoCourseId.json();
      expect(noCourseRows).toEqual([]);
    });

    it("scopes tutor listings to accessible courses only", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

      const resAssigned = await GET(
        new NextRequest("http://localhost:3000/api/quiz/templates?courseId=mk-calc"),
      );
      expect(resAssigned.status).toBe(200);
      const assignedRows = await resAssigned.json();
      const assignedIds = assignedRows.map((r: { id: string }) => r.id).sort();
      expect(assignedIds).toEqual(["tpl-calc-1", "tpl-calc-draft", "tpl-calc-sim"]);

      // Querying via legacyCourseId "crs-calc" returns the same templates
      const resLegacy = await GET(
        new NextRequest("http://localhost:3000/api/quiz/templates?courseId=crs-calc"),
      );
      expect(resLegacy.status).toBe(200);
      const legacyRows = await resLegacy.json();
      const legacyIds = legacyRows.map((r: { id: string }) => r.id).sort();
      expect(legacyIds).toEqual(["tpl-calc-1", "tpl-calc-draft", "tpl-calc-sim"]);

      const resUnassigned = await GET(
        new NextRequest("http://localhost:3000/api/quiz/templates?courseId=mk-physics"),
      );
      expect(resUnassigned.status).toBe(403);
    });

    it("lets tutors list templates across all their assigned courses", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

      const res = await GET(new NextRequest("http://localhost:3000/api/quiz/templates"));
      expect(res.status).toBe(200);
      const rows = await res.json();
      const ids = rows.map((r: { id: string }) => r.id).sort();
      expect(ids).toEqual(["tpl-calc-1", "tpl-calc-draft", "tpl-calc-sim"]);
    });

    it("lets admins list all templates including other courses", async () => {
      mockSession = { user: { id: "usr-admin-1", role: "admin" } };

      const res = await GET(new NextRequest("http://localhost:3000/api/quiz/templates"));
      expect(res.status).toBe(200);
      const rows = await res.json();
      const ids = rows.map((r: { id: string }) => r.id).sort();
      expect(ids).toEqual([
        "tpl-calc-1",
        "tpl-calc-draft",
        "tpl-calc-sim",
        "tpl-physics-1",
      ]);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. PATCH /api/quiz/templates/[id]
   * ──────────────────────────────────────────────────────────────────────── */
  describe("PATCH /api/quiz/templates/[id]", () => {
    it("allows tutor to update quiz template in assigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Kuis Bab 1 Kalkulus Diperbarui",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 403 when tutor attempts to update quiz template in unassigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-physics-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Kuis Fisika Disabotase",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-physics-1" }) });
      expect(res.status).toBe(403);
    });

    it("returns 403 when tutor attempts to edit a simulation template", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-sim", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Simulasi Diubah Tutor",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-calc-sim" }) });
      expect(res.status).toBe(403);
    });

    it("returns 403 when tutor attempts to change category to simulation", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-1", {
        method: "PATCH",
        body: JSON.stringify({
          category: "simulation",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(403);
    });

    it("rejects and audits malformed JSON in PATCH /api/quiz/templates/[id]", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-1", {
        method: "PATCH",
        body: "{ malformed json...",
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(400);

      const audits = await testDb.select().from(schema.auditMutasi);
      const malformedAudit = audits.find(
        (a) =>
          a.entityType === "quiz_template" &&
          a.entityId === "tpl-calc-1" &&
          a.action === "quiz:update" &&
          a.outcome === "rejected" &&
          a.reason?.includes("Malformed JSON"),
      );
      expect(malformedAudit).toBeDefined();
      expect(malformedAudit?.actorId).toBe("usr-tutor-1");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. DELETE /api/quiz/templates/[id]
   * ──────────────────────────────────────────────────────────────────────── */
  describe("DELETE /api/quiz/templates/[id]", () => {
    it("allows tutor to delete quiz template in assigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 403 when tutor attempts to delete quiz template in unassigned course", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-physics-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "tpl-physics-1" }) });
      expect(res.status).toBe(403);
    });

    it("returns 403 when tutor attempts to delete a simulation template", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/quiz/templates/tpl-calc-sim", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "tpl-calc-sim" }) });
      expect(res.status).toBe(403);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. GET /api/admin/quiz-insights/[id]/attempts (IDOR Protection)
   * ──────────────────────────────────────────────────────────────────────── */
  describe("GET /api/admin/quiz-insights/[id]/attempts", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession = null;
      const req = new NextRequest("http://localhost:3000/api/admin/quiz-insights/tpl-calc-1/attempts");
      const res = await getQuizAttempts(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 401 when non-tutor student attempts to access", async () => {
      mockSession = { user: { id: "usr-student-1", role: "student" } };
      const req = new NextRequest("http://localhost:3000/api/admin/quiz-insights/tpl-calc-1/attempts");
      const res = await getQuizAttempts(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(401);
    });

    it("allows tutor to access student attempt data for assigned course template", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/admin/quiz-insights/tpl-calc-1/attempts");
      const res = await getQuizAttempts(req, { params: Promise.resolve({ id: "tpl-calc-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.template.title).toBe("Kuis Bab 1 Kalkulus");
      expect(json.attempts.length).toBe(1);
      expect(json.attempts[0].studentEmail).toBe("student1@zyx.test");
      expect(json.attempts[0].score).toBe(85);
    });

    it("returns 403 when tutor attempts IDOR on unassigned course template", async () => {
      mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
      const req = new NextRequest("http://localhost:3000/api/admin/quiz-insights/tpl-physics-1/attempts");
      const res = await getQuizAttempts(req, { params: Promise.resolve({ id: "tpl-physics-1" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("allows admin to access attempt data for any course template", async () => {
      mockSession = { user: { id: "usr-admin-1", role: "admin" } };
      const req = new NextRequest("http://localhost:3000/api/admin/quiz-insights/tpl-physics-1/attempts");
      const res = await getQuizAttempts(req, { params: Promise.resolve({ id: "tpl-physics-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.template.title).toBe("Kuis Fisika Vektor");
      expect(json.attempts.length).toBe(1);
      expect(json.attempts[0].score).toBe(90);
    });
  });
});
