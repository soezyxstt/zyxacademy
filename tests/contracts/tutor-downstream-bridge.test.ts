import { describe, expect, it, mock, beforeEach, beforeAll } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

let mockSession: any = null;

const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });

mock.module("@/db", () => ({
  db: testDb,
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

mock.module("@/lib/env", () => ({
  env: {
    FEATURE_LIVE: "1",
    NEXT_PUBLIC_REALTIME_URL: "https://realtime.zyx.test",
    LIVE_HMAC_SECRET: "test-secret-key-1234567890123456",
  },
}));

const inngestSentEvents: any[] = [];
mock.module("@/lib/inngest", () => ({
  inngest: {
    send: mock(async (payload: any) => {
      inngestSentEvents.push(payload);
      return {};
    }),
  },
}));

const recordedEventsList: any[] = [];
mock.module("@/lib/learning-events", () => ({
  recordLearningEvents: mock(async (events: any[]) => {
    recordedEventsList.push(...events);
  }),
}));

const computedSnapshots: string[] = [];
mock.module("@/lib/cohort-analytics", () => ({
  computeSnapshotPayload: mock(async (courseId: string) => {
    computedSnapshots.push(courseId);
    return {};
  }),
  getCohortAnalytics: mock(async (courseId: string) => {
    computedSnapshots.push(`get:${courseId}`);
    return {
      courseTitle: "Kalkulus 1",
      enrolledCount: 20,
      activeCount: 15,
      weakConcepts: [],
      allConcepts: [],
      interventionCounts: [],
    };
  }),
}));

process.env.FEATURE_LIVE = "1";
process.env.NEXT_PUBLIC_REALTIME_URL = "https://realtime.zyx.test";
process.env.LIVE_HMAC_SECRET = "test-secret-key-1234567890123456";

globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = String(input);
  if (urlStr.includes("/room/") && (urlStr.includes("/init") || urlStr.includes("/control"))) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("Not found", { status: 404 });
}) as any;

import { POST as refreshAnalytics } from "@/app/api/tutor/analytics/refresh/route";
import { GET as getAnalytics } from "@/app/api/tutor/analytics/route";
import { POST as createZyraProposal, GET as listZyraProposalsRoute } from "@/app/api/zyra/proposals/route";
import { GET as getZyraProposalItemRoute, PATCH as patchZyraProposalItemRoute } from "@/app/api/zyra/proposals/[id]/route";

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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS peran (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pengguna_peran (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      peran_id TEXT NOT NULL REFERENCES peran(id),
      source TEXT NOT NULL,
      audit_actor_pengguna_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Matematika',
      description TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS mata_kuliah (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      legacy_course_id TEXT REFERENCES courses(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS penugasan_tutor (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      status TEXT NOT NULL DEFAULT 'active',
      assignment_scope TEXT NOT NULL DEFAULT 'course',
      legacy_tutor_course_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tutor_courses (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS quiz_templates (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'daily',
      visibility TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'draft',
      time_limit_seconds INTEGER,
      max_attempts INTEGER,
      selection_rules TEXT NOT NULL,
      open_at INTEGER,
      close_at INTEGER,
      manual_status TEXT NOT NULL DEFAULT 'open',
      show_discussion INTEGER NOT NULL DEFAULT 1,
      spreadsheet_id TEXT,
      spreadsheet_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ai_question_bank (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      source_section_id TEXT,
      origin TEXT NOT NULL DEFAULT 'zyx_original',
      source_event_name TEXT,
      source_reference_id TEXT,
      knowledge_object_id TEXT,
      source_mtd_id TEXT,
      source_mtd_version INTEGER,
      generation_hash TEXT,
      generation_run_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      is_stale INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      question_type TEXT NOT NULL DEFAULT 'multiple_choice',
      tags TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_indices TEXT NOT NULL,
      acceptable_answers TEXT,
      distractor_map TEXT NOT NULL DEFAULT '[]',
      explanation TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'generated',
      quality_score REAL,
      use_count INTEGER NOT NULL DEFAULT 0,
      styled_after_assessment_object_id TEXT,
      pattern TEXT,
      reasoning_type TEXT,
      application_level INTEGER,
      estimated_steps INTEGER,
      created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS live_quiz_sessions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      tutor_id TEXT NOT NULL REFERENCES user(id),
      template_id TEXT,
      code TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'lobby',
      questions_snapshot TEXT NOT NULL,
      participant_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      delivery_claimed_at INTEGER,
      delivery_claim_token TEXT,
      delivered_at INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS mastery_recompute_queue (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS live_quiz_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES live_quiz_sessions(id),
      student_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      score INTEGER NOT NULL DEFAULT 0,
      rank INTEGER,
      answers_snapshot TEXT NOT NULL,
      completed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS zyra_proposals (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES user(id),
      role TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      course_id TEXT REFERENCES courses(id),
      scope TEXT NOT NULL,
      evidence_refs TEXT NOT NULL,
      precondition_snapshot TEXT NOT NULL,
      operations TEXT NOT NULL,
      learner_impact TEXT NOT NULL,
      reversibility TEXT NOT NULL,
      warnings TEXT NOT NULL,
      proposer_trace TEXT NOT NULL,
      validator_result TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      precondition_version INTEGER NOT NULL,
      diff_hash TEXT NOT NULL,
      audit_id TEXT,
      failure_code TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
      reviewed_at INTEGER,
      confirmed_at INTEGER,
      applied_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS zyra_proposal_events (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES zyra_proposals(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      diff_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'success',
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute("PRAGMA foreign_keys = ON;");
}

async function cleanTables() {
  await client.execute("DELETE FROM audit_mutasi");
  await client.execute("DELETE FROM zyra_proposal_events");
  await client.execute("DELETE FROM zyra_proposals");
  await client.execute("DELETE FROM live_quiz_results");
  await client.execute("DELETE FROM live_quiz_sessions");
  await client.execute("DELETE FROM ai_question_bank");
  await client.execute("DELETE FROM quiz_templates");
  await client.execute("DELETE FROM penugasan_tutor");
  await client.execute("DELETE FROM tutor_courses");
  await client.execute("DELETE FROM pengguna_peran");
  await client.execute("DELETE FROM mata_kuliah");
  await client.execute("DELETE FROM courses");
  await client.execute("DELETE FROM pengguna");
  await client.execute("DELETE FROM user");
  await client.execute("DELETE FROM peran");

  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);
}

async function seedCoursePair(
  canonicalId: string,
  legacyId: string,
  meta: { code: string; title: string },
) {
  const now = new Date();
  await testDb.insert(schema.courses).values({
    id: legacyId,
    title: meta.title,
    category: "Matematika",
  });
  await testDb.insert(schema.mataKuliah).values({
    id: canonicalId,
    code: meta.code,
    title: meta.title,
    status: "active",
    legacyCourseId: legacyId,
    createdAt: now,
    updatedAt: now,
  });
}

describe("Tutor Downstream Analytics and Zyra Bridge Contract", () => {
  beforeAll(async () => {
    await setupTables();
  });

  beforeEach(async () => {
    await cleanTables();
    mockSession = null;
    inngestSentEvents.length = 0;
    recordedEventsList.length = 0;
    computedSnapshots.length = 0;
    (env as any).FEATURE_LIVE = "1";
    (env as any).NEXT_PUBLIC_REALTIME_URL = "https://realtime.zyx.test";
    (env as any).LIVE_HMAC_SECRET = "test-secret-key-1234567890123456";
  });

  it("bridges canonical courseId to verified legacyCourseId for analytics refresh", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-ar",
      name: "Tutor Analytics Refresh",
      email: "tutorar@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-ar",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-ar",
      penggunaId: "usr-tutor-ar",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kalkulus-can", "crs-kalkulus-leg", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-ar",
      penggunaId: "usr-tutor-ar",
      mataKuliahId: "mk-kalkulus-can",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    mockSession = {
      user: { id: "usr-tutor-ar", name: "Tutor Analytics Refresh", role: "teacher" },
    };

    // 1. Call refresh with canonical course ID -> succeeds and computes for legacyCourseId
    const req1 = new NextRequest("http://localhost/api/tutor/analytics/refresh?courseId=mk-kalkulus-can", {
      method: "POST",
    });
    const res1 = await refreshAnalytics(req1);
    expect(res1.status).toBe(200);
    expect(computedSnapshots.length).toBe(1);
    expect(computedSnapshots[0]).toBe("crs-kalkulus-leg");

    // 2. Call refresh with legacy course ID -> succeeds and computes for legacyCourseId
    const req2 = new NextRequest("http://localhost/api/tutor/analytics/refresh?courseId=crs-kalkulus-leg", {
      method: "POST",
    });
    const res2 = await refreshAnalytics(req2);
    expect(res2.status).toBe(200);
    expect(computedSnapshots.length).toBe(2);
    expect(computedSnapshots[1]).toBe("crs-kalkulus-leg");

    // 3. Unauthorized user / unassigned tutor -> returns 403
    mockSession = {
      user: { id: "usr-stranger", name: "Stranger", role: "student" },
    };
    const req3 = new NextRequest("http://localhost/api/tutor/analytics/refresh?courseId=mk-kalkulus-can", {
      method: "POST",
    });
    const res3 = await refreshAnalytics(req3);
    expect(res3.status).toBe(403);
  });

  it("authorizes Zyra proposals for tutor with course assignment and rejects unassigned courses", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-zyra",
      name: "Tutor Zyra",
      email: "tutorzyra@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-zyra",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-zyra",
      penggunaId: "usr-tutor-zyra",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-fisika-can", "crs-fisika-leg", {
      code: "FI-1101",
      title: "Fisika Dasar 1",
    });
    await seedCoursePair("mk-unassigned-can", "crs-unassigned-leg", {
      code: "UA-1101",
      title: "Unassigned Course",
    });

    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-zyra",
      penggunaId: "usr-tutor-zyra",
      mataKuliahId: "mk-fisika-can",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    mockSession = {
      user: { id: "usr-tutor-zyra", name: "Tutor Zyra", role: "tutor" },
    };

    // 1. Create proposal for assigned course (using legacyCourseId as passed by ZyraProposalPanel)
    const req1 = new NextRequest("http://localhost/api/zyra/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "misconception_brief",
        courseId: "crs-fisika-leg",
        scope: { courseId: "crs-fisika-leg" },
        evidenceRefs: ["course:crs-fisika-leg"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "Tidak ada mutasi data." },
        reversibility: { reversible: true, rollback: "Tidak ada mutasi." },
        warnings: ["Proposal ini membutuhkan review."],
        rationale: "Tinjau pola miskonsepsi.",
      }),
    });

    const res1 = await createZyraProposal(req1);
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(data1.proposal).toBeDefined();
    expect(data1.proposal.courseId).toBe("crs-fisika-leg");

    // 2. Create proposal for unassigned course -> 403 Forbidden
    const req2 = new NextRequest("http://localhost/api/zyra/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "misconception_brief",
        courseId: "crs-unassigned-leg",
        scope: { courseId: "crs-unassigned-leg" },
        evidenceRefs: ["course:crs-unassigned-leg"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "Tidak ada mutasi data." },
        reversibility: { reversible: true, rollback: "Tidak ada mutasi." },
        warnings: ["Proposal ini membutuhkan review."],
        rationale: "Tinjau pola miskonsepsi.",
      }),
    });

    const res2 = await createZyraProposal(req2);
    expect(res2.status).toBe(403);
    const data2 = await res2.json();
    expect(data2.error).toBe("COURSE_SCOPE_DENIED");
  });

  it("bridges canonical courseId to verified legacyCourseId for GET /api/tutor/analytics with relational role resolution", async () => {
    const now = new Date();

    // Tutor user with role in DB (pengguna_peran) but legacy session role omitted or student
    await testDb.insert(schema.user).values({
      id: "usr-tutor-get-an",
      name: "Tutor Get Analytics",
      email: "tutorgetan@zyx.test",
      role: "student",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-get-an",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-get-an",
      penggunaId: "usr-tutor-get-an",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kimia-can", "crs-kimia-leg", {
      code: "KI-1101",
      title: "Kimia Dasar 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-get-an",
      penggunaId: "usr-tutor-get-an",
      mataKuliahId: "mk-kimia-can",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Session has user with role student, but relational role is tutor
    mockSession = {
      user: { id: "usr-tutor-get-an", name: "Tutor Get Analytics", role: "student" },
    };

    // 1. GET with canonical course ID -> succeeds, calls getCohortAnalytics with legacyCourseId
    const req1 = new NextRequest("http://localhost/api/tutor/analytics?courseId=mk-kimia-can");
    const res1 = await getAnalytics(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.courseTitle).toBe("Kalkulus 1");
    expect(computedSnapshots).toContain("get:crs-kimia-leg");

    // 2. GET with legacy course ID -> succeeds with legacyCourseId
    const req2 = new NextRequest("http://localhost/api/tutor/analytics?courseId=crs-kimia-leg");
    const res2 = await getAnalytics(req2);
    expect(res2.status).toBe(200);

    // 3. GET with missing courseId -> 400
    const reqMissing = new NextRequest("http://localhost/api/tutor/analytics");
    const resMissing = await getAnalytics(reqMissing);
    expect(resMissing.status).toBe(400);

    // 4. Unauthorized user -> 403
    mockSession = {
      user: { id: "usr-stranger-2", name: "Stranger Two", role: "student" },
    };
    const req3 = new NextRequest("http://localhost/api/tutor/analytics?courseId=mk-kimia-can");
    const res3 = await getAnalytics(req3);
    expect(res3.status).toBe(403);
  });

  it("resolves relational roles from DB for Zyra proposals even when session user role is student", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-rel-zyra",
      name: "Relational Zyra Tutor",
      email: "relzyra@zyx.test",
      role: "student",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-rel-zyra",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-rel-zyra",
      penggunaId: "usr-rel-zyra",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-biologi-can", "crs-biologi-leg", {
      code: "BI-1101",
      title: "Biologi Umum",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-rel-zyra",
      penggunaId: "usr-rel-zyra",
      mataKuliahId: "mk-biologi-can",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Session has role "student", but DB has peran "tutor"
    mockSession = {
      user: { id: "usr-rel-zyra", name: "Relational Zyra Tutor", role: "student" },
    };

    // 1. GET proposals list succeeds
    const listReq = new NextRequest("http://localhost/api/zyra/proposals?courseId=crs-biologi-leg");
    const listRes = await listZyraProposalsRoute(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData.proposals)).toBe(true);

    // 2. POST proposal succeeds for assigned course
    const postReq = new NextRequest("http://localhost/api/zyra/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "misconception_brief",
        courseId: "crs-biologi-leg",
        scope: { courseId: "crs-biologi-leg" },
        evidenceRefs: ["course:crs-biologi-leg"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "Tidak ada mutasi data." },
        reversibility: { reversible: true, rollback: "Tidak ada mutasi." },
        warnings: ["Proposal ini membutuhkan review."],
        rationale: "Tinjau pola miskonsepsi biologi.",
      }),
    });
    const postRes = await createZyraProposal(postReq);
    expect(postRes.status).toBe(201);
  });

  it("handles Zyra proposal item GET and PATCH transitions with canonical relational role resolution and admin/tutor boundaries", async () => {
    const now = new Date();

    // 1. Proposer Tutor (user.role in session is student, but relational role in DB is tutor)
    await testDb.insert(schema.user).values([
      {
        id: "usr-proposer-tutor",
        name: "Proposer Tutor",
        email: "proposer@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-admin-reviewer",
        name: "Admin Reviewer",
        email: "adminrev@zyx.test",
        role: "admin",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-pure-student",
        name: "Pure Student",
        email: "purestudent@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await testDb.insert(schema.pengguna).values([
      { id: "usr-proposer-tutor", status: "active", createdAt: now, updatedAt: now },
      { id: "usr-admin-reviewer", status: "active", createdAt: now, updatedAt: now },
      { id: "usr-pure-student", status: "active", createdAt: now, updatedAt: now },
    ]);

    await testDb.insert(schema.penggunaPeran).values([
      {
        id: "pp-prop-tutor",
        penggunaId: "usr-proposer-tutor",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      },
      {
        id: "pp-adm-rev",
        penggunaId: "usr-admin-reviewer",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      },
    ]);

    await seedCoursePair("mk-matematika-can", "crs-matematika-leg", {
      code: "MT-1101",
      title: "Matematika Diskrit",
    });

    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-prop-tutor",
      penggunaId: "usr-proposer-tutor",
      mataKuliahId: "mk-matematika-can",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Create proposal as proposer tutor
    mockSession = {
      user: { id: "usr-proposer-tutor", name: "Proposer Tutor", role: "student" },
    };

    const createReq = new NextRequest("http://localhost/api/zyra/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalType: "misconception_brief",
        courseId: "crs-matematika-leg",
        scope: { courseId: "crs-matematika-leg" },
        evidenceRefs: ["course:crs-matematika-leg"],
        preconditionSnapshot: { version: 1 },
        operations: [{ kind: "read_only_report", reportKey: "misconception_brief" }],
        learnerImpact: { audience: "single_course", summary: "Tidak ada mutasi data." },
        reversibility: { reversible: true, rollback: "Tidak ada mutasi." },
        warnings: ["Proposal ini membutuhkan review."],
        rationale: "Analisis pemahaman relasi ekuivalensi.",
      }),
    });

    const createRes = await createZyraProposal(createReq);
    expect(createRes.status).toBe(201);
    const { proposal } = await createRes.json();
    const proposalId = proposal.id;
    expect(proposal.status).toBe("validated");

    // Proposer GET item -> succeeds
    const getReq1 = new NextRequest(`http://localhost/api/zyra/proposals/${proposalId}`);
    const getRes1 = await getZyraProposalItemRoute(getReq1, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(getRes1.status).toBe(200);
    const getData1 = await getRes1.json();
    expect(getData1.proposal.id).toBe(proposalId);
    expect(getData1.proposal.actorId).toBeUndefined(); // Serializer strips actorId

    // Proposer tries self-review -> rejects with 400 SECOND_REVIEWER_REQUIRED
    const selfReviewReq = new NextRequest(`http://localhost/api/zyra/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", preconditionVersion: 1 }),
    });
    const selfReviewRes = await patchZyraProposalItemRoute(selfReviewReq, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(selfReviewRes.status).toBe(400);
    const selfReviewData = await selfReviewRes.json();
    expect(selfReviewData.error).toBe("SECOND_REVIEWER_REQUIRED");

    // Pure student attempts GET or PATCH -> 404
    mockSession = {
      user: { id: "usr-pure-student", name: "Pure Student", role: "student" },
    };
    const studentGetRes = await getZyraProposalItemRoute(getReq1, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(studentGetRes.status).toBe(404);

    const studentPatchRes = await patchZyraProposalItemRoute(selfReviewReq, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(studentPatchRes.status).toBe(404);

    // Admin reviews proposal -> 200 reviewed
    mockSession = {
      user: { id: "usr-admin-reviewer", name: "Admin Reviewer", role: "admin" },
    };
    const adminReviewReq = new NextRequest(`http://localhost/api/zyra/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", preconditionVersion: 1 }),
    });
    const adminReviewRes = await patchZyraProposalItemRoute(adminReviewReq, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(adminReviewRes.status).toBe(200);
    const adminReviewData = await adminReviewRes.json();
    expect(adminReviewData.proposal.status).toBe("reviewed");

    // Admin tries to confirm proposal -> rejects with 400 PROPOSER_CONFIRMATION_REQUIRED
    const adminConfirmReq = new NextRequest(`http://localhost/api/zyra/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", preconditionVersion: 1 }),
    });
    const adminConfirmRes = await patchZyraProposalItemRoute(adminConfirmReq, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(adminConfirmRes.status).toBe(400);
    const adminConfirmData = await adminConfirmRes.json();
    expect(adminConfirmData.error).toBe("PROPOSER_CONFIRMATION_REQUIRED");

    // Proposer tutor (with relational role) confirms proposal -> 200 confirmed
    mockSession = {
      user: { id: "usr-proposer-tutor", name: "Proposer Tutor", role: "student" },
    };
    const proposerConfirmReq = new NextRequest(`http://localhost/api/zyra/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", preconditionVersion: 1 }),
    });
    const proposerConfirmRes = await patchZyraProposalItemRoute(proposerConfirmReq, {
      params: Promise.resolve({ id: proposalId }),
    });
    expect(proposerConfirmRes.status).toBe(200);
    const proposerConfirmData = await proposerConfirmRes.json();
    expect(proposerConfirmData.proposal.status).toBe("confirmed");
  });
});
