import { afterAll, describe, expect, it, mock, beforeEach, beforeAll } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

let mockSession: any = null;

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"];
const dbProxy = new Proxy({} as typeof testDb, {
  get(_target, key) {
    const value = Reflect.get(testDb, key);
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});
beforeAll(async () => { ({ client, testDb } = await createPostgresTestDb()); }, 60_000);
afterAll(async () => { await client?.close(); });

async function clearTestData() {
  const result = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  if (result.rows.length) await client.exec(`TRUNCATE TABLE ${result.rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ")} CASCADE`);
}

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

mock.module("@/lib/env", () => ({
  env: {
    FEATURE_LIVE: "1",
    NEXT_PUBLIC_REALTIME_URL: "https://realtime.zyx.test",
    LIVE_HMAC_SECRET: "test-secret-key-1234567890123456",
  },
}));

mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT;replace;${url};307;`);
    (error as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  },
  notFound: () => {
    const error = new Error("NEXT_NOT_FOUND");
    (error as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
    throw error;
  },
}));

// Set env flags
process.env.FEATURE_LIVE = "1";
process.env.NEXT_PUBLIC_REALTIME_URL = "https://realtime.zyx.test";
process.env.LIVE_HMAC_SECRET = "test-secret-key-1234567890123456";

// Mock fetch for DO calls
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
    if (events.length === 0) return;
    const now = new Date();
    const rows = events.map((e) => ({
      id: e.id ?? randomUUID(),
      studentId: e.studentId,
      courseId: e.courseId,
      eventType: e.eventType,
      conceptName: e.conceptName ?? null,
      koId: e.koId ?? null,
      correctness: e.correctness ?? null,
      weight: e.weight ?? 1,
      createdAt: now,
    }));
    await testDb
      .insert(schema.learningEvents)
      .values(rows)
      .onConflictDoNothing({ target: schema.learningEvents.id });
  }),
}));

mock.module("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: any;
    env: any;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { POST as createLiveSession, GET as getLiveSessions } from "@/app/api/live/sessions/route";
import { POST as controlLiveSession } from "@/app/api/live/[sessionId]/control/route";
import { POST as callbackLiveSession, buildLiveQuizLearningEventId } from "@/app/api/live/callback/route";
import { recordLearningEvents } from "@/lib/learning-events";
import LegacyCourseLiveHostPage from "@/app/(student)/courses/[id]/live/host/page";

const { LiveQuizRoom, verifyHmacToken } = await import("@/workers/realtime/src/room");

// Seeds a legacy courses row plus its active canonical mata_kuliah mapping,
// mirroring production data for the legacy course foreign keys.
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

describe("Tutor Live Hosting & Canonical Access Control", () => {

  beforeEach(async () => {
    await clearTestData();
    await testDb.insert(schema.peran).values([
      { id: "peran-admin", code: "admin" },
      { id: "peran-tutor", code: "tutor" },
      { id: "peran-murid", code: "murid" },
    ]);
    mockSession = null;
    inngestSentEvents.length = 0;
    recordedEventsList.length = 0;
    (env as any).FEATURE_LIVE = "1";
    (env as any).NEXT_PUBLIC_REALTIME_URL = "https://realtime.zyx.test";
    (env as any).LIVE_HMAC_SECRET = "test-secret-key-1234567890123456";
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
  });

  it("allows assigned tutor to create live session with published quiz template and audits success", async () => {
    const now = new Date();

    // User & Tutor
    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    // Course with mapped legacy course (live_quiz_sessions.course_id references courses)
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });

    // Assignment
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Published Quiz Template (legacy course foreign key)
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-pub-1",
      courseId: "crs-kalkulus",
      title: "Kuis Bab 1 Turunan",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5, assessmentType: "quiz" },
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });

    const res = await createLiveSession(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.code).toHaveLength(6);
    expect(data.courseId).toBe("mk-kalkulus");
    expect(data.sessionId).toBeDefined();

    // Verify session in database
    const [saved] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, data.sessionId));
    expect(saved).toBeDefined();
    expect(saved.tutorId).toBe("usr-tutor-1");
    expect(saved.state).toBe("lobby");
    // Persisted course id must be the verified mapped legacy courses id, not the canonical id
    expect(saved.courseId).toBe("crs-kalkulus");

    // Verify audit record in audit_mutasi (canonical course context retained)
    const audits = await testDb.select().from(schema.auditMutasi);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("live_session.create");
    expect(audits[0].outcome).toBe("success");
    expect(audits[0].actorId).toBe("usr-tutor-1");
    expect(audits[0].courseId).toBe("mk-kalkulus");
  });

  it("rejects unauthorized tutor with 403 and records audit rejection", async () => {
    const now = new Date();

    // User without course assignment
    await testDb.insert(schema.user).values({
      id: "usr-unassigned",
      name: "Tutor Tanpa Kelas",
      email: "unassigned@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-unassigned",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-unassigned",
      penggunaId: "usr-unassigned",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    // Course & Template
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-pub-1",
      courseId: "crs-kalkulus",
      title: "Kuis Bab 1",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-unassigned", name: "Tutor Tanpa Kelas", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });

    const res = await createLiveSession(req);
    expect(res.status).toBe(403);

    // Verify rejection audit record
    const audits = await testDb.select().from(schema.auditMutasi);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("live_session.create");
    expect(audits[0].outcome).toBe("rejected");
    expect(audits[0].reason).toContain("TUTOR_ACCESS_DENIED");
  });

  it("rejects draft quiz template with 400 and records audit rejection", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Draft Template
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-draft-1",
      courseId: "crs-kalkulus",
      title: "Kuis Draft",
      category: "weekly",
      status: "draft",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-draft-1",
      }),
    });

    const res = await createLiveSession(req);
    expect(res.status).toBe(400);

    const audits = await testDb.select().from(schema.auditMutasi);
    expect(audits.length).toBe(1);
    expect(audits[0].outcome).toBe("rejected");
    expect(audits[0].reason).toBe("TEMPLATE_NOT_PUBLISHED");
  });

  it("rejects simulation and tryout template for live hosting with 403", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // Simulation category template
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-sim-1",
      courseId: "crs-kalkulus",
      title: "Simulasi Ujian",
      category: "simulation",
      status: "published",
      selectionRules: { count: 20 },
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-sim-1",
      }),
    });

    const res = await createLiveSession(req);
    expect(res.status).toBe(403);

    const audits = await testDb.select().from(schema.auditMutasi);
    expect(audits.length).toBe(1);
    expect(audits[0].outcome).toBe("rejected");
    expect(audits[0].reason).toBe("TRYOUT_OR_SIMULATION_LIVE_FORBIDDEN");
  });

  it("enforces session ownership on control actions and allows admin override", async () => {
    const now = new Date();

    // Tutor Owner & Tutor Intruder & Admin
    await testDb.insert(schema.user).values([
      {
        id: "usr-owner",
        name: "Tutor Owner",
        email: "owner@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-intruder",
        name: "Tutor Intruder",
        email: "intruder@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-admin",
        name: "Admin Super",
        email: "admin@zyx.test",
        role: "admin",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await testDb.insert(schema.pengguna).values([
      { id: "usr-owner", status: "active", createdAt: now, updatedAt: now },
      { id: "usr-intruder", status: "active", createdAt: now, updatedAt: now },
      { id: "usr-admin", status: "active", createdAt: now, updatedAt: now },
    ]);
    await testDb.insert(schema.penggunaPeran).values([
      { id: "pp-own", penggunaId: "usr-owner", peranId: "peran-tutor", source: "seed", createdAt: now },
      { id: "pp-int", penggunaId: "usr-intruder", peranId: "peran-tutor", source: "seed", createdAt: now },
      { id: "pp-adm", penggunaId: "usr-admin", peranId: "peran-admin", source: "seed", createdAt: now },
    ]);

    await seedCoursePair("mk-fisika", "crs-fisika", {
      code: "FI-1101",
      title: "Fisika Dasar 1",
    });
    await testDb.insert(schema.penugasanTutor).values([
      {
        id: "pt-own",
        penggunaId: "usr-owner",
        mataKuliahId: "mk-fisika",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pt-int",
        penggunaId: "usr-intruder",
        mataKuliahId: "mk-fisika",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Live session owned by usr-owner (persisted under the mapped legacy courses id)
    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-live-1",
      courseId: "crs-fisika",
      tutorId: "usr-owner",
      code: "XYZ999",
      state: "lobby",
      questionsSnapshot: [{ prompt: "P1", options: ["A", "B"], correctIndex: 0 }],
      participantCount: 0,
    });

    // 1. Intruder tutor tries to start session -> 403 Forbidden
    mockSession = {
      user: { id: "usr-intruder", name: "Tutor Intruder", role: "teacher" },
    };

    const intruderReq = new NextRequest("http://localhost/api/live/sess-live-1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });

    const intruderRes = await controlLiveSession(intruderReq, {
      params: Promise.resolve({ sessionId: "sess-live-1" }),
    });
    expect(intruderRes.status).toBe(403);

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].action).toBe("live_session.control");
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toBe("TUTOR_SESSION_NOT_OWNED");

    // 2. Owner tutor starts session -> 200 OK
    mockSession = {
      user: { id: "usr-owner", name: "Tutor Owner", role: "teacher" },
    };

    const ownerReq = new NextRequest("http://localhost/api/live/sess-live-1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });

    const ownerRes = await controlLiveSession(ownerReq, {
      params: Promise.resolve({ sessionId: "sess-live-1" }),
    });
    expect(ownerRes.status).toBe(200);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("success");

    // 3. Admin ends session via override -> 200 OK
    mockSession = {
      user: { id: "usr-admin", name: "Admin Super", role: "admin" },
    };

    const adminReq = new NextRequest("http://localhost/api/live/sess-live-1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });

    const adminRes = await controlLiveSession(adminReq, {
      params: Promise.resolve({ sessionId: "sess-live-1" }),
    });
    expect(adminRes.status).toBe(200);

    // Verify session ended in database
    const [endedSess] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-live-1"));
    expect(endedSess.state).toBe("ended");
    expect(endedSess.courseId).toBe("crs-fisika");

    // 4. Controlling already ended session -> 410 Gone
    const endedReq = new NextRequest("http://localhost/api/live/sess-live-1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "next" }),
    });
    const endedRes = await controlLiveSession(endedReq, {
      params: Promise.resolve({ sessionId: "sess-live-1" }),
    });
    expect(endedRes.status).toBe(410);
  });

  it("lists active sessions for authorized tutor and rejects unauthorized user", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-list",
      name: "Tutor List",
      email: "tutorlist@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-list",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-list",
      penggunaId: "usr-tutor-list",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kimia", "crs-kimia", {
      code: "KI-1101",
      title: "Kimia Dasar 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-list",
      penggunaId: "usr-tutor-list",
      mataKuliahId: "mk-kimia",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-kimia-1",
      courseId: "crs-kimia",
      tutorId: "usr-tutor-list",
      code: "KIM001",
      state: "lobby",
      questionsSnapshot: "[]",
      participantCount: 0,
    });

    // 1. Authorized tutor gets sessions
    mockSession = {
      user: { id: "usr-tutor-list", name: "Tutor List", role: "teacher" },
    };
    const req1 = new NextRequest("http://localhost/api/live/sessions?courseId=mk-kimia");
    const res1 = await getLiveSessions(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.length).toBe(1);
    expect(data1[0].code).toBe("KIM001");

    // 2. Unauthorized user gets 403
    mockSession = {
      user: { id: "usr-stranger", name: "Stranger", role: "student" },
    };
    const req2 = new NextRequest("http://localhost/api/live/sessions?courseId=mk-kimia");
    const res2 = await getLiveSessions(req2);
    expect(res2.status).toBe(403);
  });

  it("redirects legacy student course live host route to /tutor/:courseId/live", async () => {
    let redirectedUrl = "";
    try {
      await LegacyCourseLiveHostPage({
        params: Promise.resolve({ id: "mk-kalkulus" }),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        redirectedUrl = error.message;
      }
    }

    expect(redirectedUrl).toContain("NEXT_REDIRECT");
    expect(redirectedUrl).toContain("/tutor/mk-kalkulus/live");
  });

  it("handles realtime worker init failure (non-2xx or throw), ensures no orphan session in DB, and audits failure", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-pub-1",
      courseId: "crs-kalkulus",
      title: "Kuis Bab 1",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    // Case 1: Realtime init returns 500 error
    globalThis.fetch = mock(async () => {
      return new Response("Internal Realtime Error", { status: 500 });
    }) as any;

    const req1 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });

    const res1 = await createLiveSession(req1);
    expect(res1.status).toBe(502);

    // Verify NO orphan session in DB
    const sessions = await testDb.select().from(schema.liveQuizSessions);
    expect(sessions.length).toBe(0);

    // Verify failure audit
    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].outcome).toBe("failed");
    expect(audits1[0].reason).toContain("REALTIME_WORKER_INIT_ERROR");

    // Case 2: Missing realtime URL returns 503
    (env as any).NEXT_PUBLIC_REALTIME_URL = "";
    const req2 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });
    const res2 = await createLiveSession(req2);
    expect(res2.status).toBe(503);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("failed");
    expect(audits2[1].reason).toBe("REALTIME_WORKER_NOT_CONFIGURED");

    // Case 3: Realtime init fetch throws -> no orphan session, failure audit
    (env as any).NEXT_PUBLIC_REALTIME_URL = "https://realtime.zyx.test";
    globalThis.fetch = mock(async () => {
      throw new Error("network unreachable");
    }) as any;

    const req3 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });
    const res3 = await createLiveSession(req3);
    expect(res3.status).toBe(502);

    const sessions3 = await testDb.select().from(schema.liveQuizSessions);
    expect(sessions3.length).toBe(0);

    const audits3 = await testDb.select().from(schema.auditMutasi);
    expect(audits3.length).toBe(3);
    expect(audits3[2].outcome).toBe("failed");
    expect(audits3[2].reason).toContain("REALTIME_WORKER_INIT_FAILED");
    expect(audits3[2].reason).toContain("network unreachable");
  });

  it("strictly validates aiQuestionBank items: rejects missing questions or mismatched course", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await seedCoursePair("mk-fisika", "crs-fisika", {
      code: "FI-1101",
      title: "Fisika Dasar 1",
    });

    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    // 1. Missing question ID -> 400 Bad Request
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-missing-q",
      courseId: "crs-kalkulus",
      title: "Kuis Soal Hilang",
      category: "weekly",
      status: "published",
      selectionRules: { questionIds: ["q-ghost-1", "q-ghost-2"] },
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    const req1 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-missing-q",
      }),
    });

    const res1 = await createLiveSession(req1);
    expect(res1.status).toBe(400);

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toContain("QUESTION_NOT_FOUND");

    // 2. Question belonging to different course -> 403 Forbidden
    await testDb.insert(schema.aiQuestionBank).values({
      id: "q-fisika-1",
      courseId: "crs-fisika",
      prompt: "Berapa kecepatan awal?",
      options: ["10 m/s", "20 m/s"],
      correctIndices: [0],
      origin: "zyx_original",
      explanation: "Kecepatan awal adalah nilai v saat t = 0.",
      reviewStatus: "published",
    });

    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-mismatch-course",
      courseId: "crs-kalkulus",
      title: "Kuis Soal Fisika di Kalkulus",
      category: "weekly",
      status: "published",
      selectionRules: { questionIds: ["q-fisika-1"] },
    });

    const req2 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-mismatch-course",
      }),
    });

    const res2 = await createLiveSession(req2);
    expect(res2.status).toBe(403);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("rejected");
    expect(audits2[1].reason).toContain("QUESTION_COURSE_MISMATCH");

    // 3. Valid question matching course -> 200 OK with correct snapshot order
    await testDb.insert(schema.aiQuestionBank).values([
      {
        id: "q-calc-1",
        courseId: "crs-kalkulus",
        prompt: "Turunan dari x^2?",
        options: ["2x", "x^2", "2", "x"],
        correctIndices: [0],
        origin: "zyx_original",
        explanation: "Aturan pangkat menghasilkan 2x.",
        reviewStatus: "published",
      },
      {
        id: "q-calc-2",
        courseId: "crs-kalkulus",
        prompt: "Integral dari 2x dx?",
        options: ["x^2 + C", "2x^2 + C"],
        correctIndices: [0],
        origin: "zyx_original",
        explanation: "Integral tak tentu dari 2x adalah x^2 + C.",
        reviewStatus: "published",
      },
    ]);

    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-valid-q",
      courseId: "crs-kalkulus",
      title: "Kuis Soal Valid",
      category: "weekly",
      status: "published",
      selectionRules: { questionIds: ["q-calc-2", "q-calc-1"] },
    });

    const req3 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-valid-q",
      }),
    });

    const res3 = await createLiveSession(req3);
    expect(res3.status).toBe(200);

    const [savedSess] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.templateId, "tmpl-valid-q"));
    expect(savedSess).toBeDefined();
    expect(savedSess.courseId).toBe("crs-kalkulus");

    const snapshot = typeof savedSess.questionsSnapshot === "string"
      ? JSON.parse(savedSess.questionsSnapshot)
      : savedSess.questionsSnapshot;
    expect(snapshot.length).toBe(2);
    expect(snapshot[0].prompt).toBe("Integral dari 2x dx?");
    expect(snapshot[1].prompt).toBe("Turunan dari x^2?");

    await testDb.insert(schema.aiQuestionBank).values({
      id: "q-historical-ineligible",
      courseId: "crs-kalkulus",
      origin: "historical_reference",
      prompt: "Soal historis belum siap",
      options: ["A", "B"],
      correctIndices: [0],
      explanation: "Belum siap untuk quiz.",
      reviewStatus: "published",
      quizEligible: false,
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-historical-ineligible",
      courseId: "crs-kalkulus",
      title: "Kuis Historis Belum Siap",
      category: "weekly",
      status: "published",
      selectionRules: { questionIds: ["q-historical-ineligible"] },
    });

    const blockedHistorical = await createLiveSession(
      new NextRequest("http://localhost/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "mk-kalkulus",
          templateId: "tmpl-historical-ineligible",
        }),
      }),
    );
    expect(blockedHistorical.status).toBe(400);

    await testDb
      .update(schema.aiQuestionBank)
      .set({ quizEligible: true })
      .where(eq(schema.aiQuestionBank.id, "q-historical-ineligible"));
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-historical-eligible",
      courseId: "crs-kalkulus",
      title: "Kuis Historis Siap",
      category: "weekly",
      status: "published",
      selectionRules: { questionIds: ["q-historical-ineligible"] },
    });

    const eligibleHistorical = await createLiveSession(
      new NextRequest("http://localhost/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "mk-kalkulus",
          templateId: "tmpl-historical-eligible",
        }),
      }),
    );
    expect(eligibleHistorical.status).toBe(200);
  });

  it("audits tutor control attempts for not-found, ended, invalid body, and missing realtime configuration", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-ctl",
      name: "Tutor Control",
      email: "tutorctl@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-ctl",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-ctl",
      penggunaId: "usr-tutor-ctl",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-ctl",
      penggunaId: "usr-tutor-ctl",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    mockSession = {
      user: { id: "usr-tutor-ctl", name: "Tutor Control", role: "teacher" },
    };

    // 1. Session not found -> 404 & audit
    const reqNotFound = new NextRequest("http://localhost/api/live/sess-missing-999/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const resNotFound = await controlLiveSession(reqNotFound, {
      params: Promise.resolve({ sessionId: "sess-missing-999" }),
    });
    expect(resNotFound.status).toBe(404);

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toBe("LIVE_SESSION_NOT_FOUND");

    // 2. Ended session -> 410 & audit
    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-ended-99",
      courseId: "crs-kalkulus",
      tutorId: "usr-tutor-ctl",
      code: "END099",
      state: "ended",
      questionsSnapshot: "[]",
      participantCount: 0,
    });

    const reqEnded = new NextRequest("http://localhost/api/live/sess-ended-99/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const resEnded = await controlLiveSession(reqEnded, {
      params: Promise.resolve({ sessionId: "sess-ended-99" }),
    });
    expect(resEnded.status).toBe(410);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("rejected");
    expect(audits2[1].reason).toBe("LIVE_SESSION_ALREADY_ENDED");

    // 3. Invalid body / action -> 400 & audit
    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-active-99",
      courseId: "crs-kalkulus",
      tutorId: "usr-tutor-ctl",
      code: "ACT099",
      state: "lobby",
      questionsSnapshot: "[]",
      participantCount: 0,
    });

    const reqInvalid = new NextRequest("http://localhost/api/live/sess-active-99/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid_action_name" }),
    });
    const resInvalid = await controlLiveSession(reqInvalid, {
      params: Promise.resolve({ sessionId: "sess-active-99" }),
    });
    expect(resInvalid.status).toBe(400);

    const audits3 = await testDb.select().from(schema.auditMutasi);
    expect(audits3.length).toBe(3);
    expect(audits3[2].outcome).toBe("rejected");
    expect(audits3[2].reason).toBe("INVALID_CONTROL_ACTION");

    // 4. Missing realtime worker configuration -> 503 & audit
    (env as any).NEXT_PUBLIC_REALTIME_URL = "";
    const reqNoRt = new NextRequest("http://localhost/api/live/sess-active-99/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const resNoRt = await controlLiveSession(reqNoRt, {
      params: Promise.resolve({ sessionId: "sess-active-99" }),
    });
    expect(resNoRt.status).toBe(503);

    const audits4 = await testDb.select().from(schema.auditMutasi);
    expect(audits4.length).toBe(4);
    expect(audits4[3].outcome).toBe("failed");
    expect(audits4[3].reason).toBe("REALTIME_WORKER_NOT_CONFIGURED");
  });

  it("GET /api/live/sessions includes host token, wsUrl, and question count for active session recovery", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-resume",
      name: "Tutor Resume",
      email: "tutorresume@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-resume",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-resume",
      penggunaId: "usr-tutor-resume",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-resume",
      penggunaId: "usr-tutor-resume",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-resume-1",
      courseId: "crs-kalkulus",
      tutorId: "usr-tutor-resume",
      code: "RES001",
      state: "lobby",
      questionsSnapshot: [{ prompt: "P1" }, { prompt: "P2" }],
      participantCount: 3,
    });

    mockSession = {
      user: { id: "usr-tutor-resume", name: "Tutor Resume", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sessions?courseId=mk-kalkulus");
    const res = await getLiveSessions(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe("sess-resume-1");
    expect(data[0].code).toBe("RES001");
    expect(data[0].state).toBe("lobby");
    expect(data[0].questionCount).toBe(2);
    expect(data[0].hostToken).toBeDefined();
    expect(data[0].hostToken).not.toBeNull();
    expect(data[0].wsUrl).toContain("sess-resume-1/websocket");
  });

  it("fails closed when the template legacy course mismatches the verified mapping or the mapping is non-unique", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-t1",
      penggunaId: "usr-tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
    await seedCoursePair("mk-kalkulus", "crs-kalkulus", {
      code: "MA-1101",
      title: "Kalkulus 1",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-t1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-kalkulus",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    mockSession = {
      user: { id: "usr-tutor-1", name: "Tutor Satu", role: "teacher" },
    };

    // 1. Published template stored under a different legacy course than the one
    // mapped from the authorized canonical course (canonical-to-legacy mismatch)
    await testDb.insert(schema.courses).values({
      id: "crs-lain",
      title: "Mata Kuliah Lain",
      category: "Matematika",
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-wrong-legacy",
      courseId: "crs-lain",
      title: "Kuis Mata Kuliah Lain",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    const req1 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-wrong-legacy",
      }),
    });

    const res1 = await createLiveSession(req1);
    expect(res1.status).toBe(403);

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toBe("TEMPLATE_COURSE_MISMATCH");

    const sessions1 = await testDb.select().from(schema.liveQuizSessions);
    expect(sessions1.length).toBe(0);

    // 2. Two active canonical courses mapped to one legacy course id must fail closed
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-duplicate-mapping",
      code: "MA-1102",
      title: "Kalkulus Duplikat",
      status: "active",
      legacyCourseId: "crs-kalkulus",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-pub-1",
      courseId: "crs-kalkulus",
      title: "Kuis Bab 1",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    const req2 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-kalkulus",
        templateId: "tmpl-pub-1",
      }),
    });

    const res2 = await createLiveSession(req2);
    expect(res2.status).toBe(409);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("rejected");
    expect(audits2[1].reason).toBe("LEGACY_COURSE_MAPPING_UNAVAILABLE");

    const sessions2 = await testDb.select().from(schema.liveQuizSessions);
    expect(sessions2.length).toBe(0);

    // 3. Canonical course without any legacy mapping cannot host either
    await testDb.insert(schema.courses).values({
      id: "crs-unmapped",
      title: "Kursus Tanpa Pemetaan",
      category: "Matematika",
    });
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-unmapped",
      code: "UM-1101",
      title: "Kursus Tanpa Pemetaan",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-unmapped",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-unmapped",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-unmapped",
      courseId: "crs-unmapped",
      title: "Kuis Tanpa Pemetaan",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    const req3 = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-unmapped",
        templateId: "tmpl-unmapped",
      }),
    });

    const res3 = await createLiveSession(req3);
    expect(res3.status).toBe(409);

    const audits3 = await testDb.select().from(schema.auditMutasi);
    expect(audits3.length).toBe(3);
    expect(audits3[2].outcome).toBe("rejected");
    expect(audits3[2].reason).toBe("LEGACY_COURSE_MAPPING_UNAVAILABLE");

    const sessions3 = await testDb.select().from(schema.liveQuizSessions);
    expect(sessions3.length).toBe(0);
  });

  it("returns a uniform authorization rejection to outsiders regardless of ended state or invalid action", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-owner",
        name: "Tutor Owner",
        email: "owner@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-outsider",
        name: "Tutor Outsider",
        email: "outsider@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await testDb.insert(schema.pengguna).values([
      { id: "usr-owner", status: "active", createdAt: now, updatedAt: now },
      { id: "usr-outsider", status: "active", createdAt: now, updatedAt: now },
    ]);
    await testDb.insert(schema.penggunaPeran).values([
      { id: "pp-owner", penggunaId: "usr-owner", peranId: "peran-tutor", source: "seed", createdAt: now },
      { id: "pp-outsider", penggunaId: "usr-outsider", peranId: "peran-tutor", source: "seed", createdAt: now },
    ]);

    await seedCoursePair("mk-fisika", "crs-fisika", {
      code: "FI-1101",
      title: "Fisika Dasar 1",
    });
    await seedCoursePair("mk-lain", "crs-lain", {
      code: "LN-1101",
      title: "Mata Kuliah Lain",
    });
    await testDb.insert(schema.penugasanTutor).values([
      {
        id: "pt-owner",
        penggunaId: "usr-owner",
        mataKuliahId: "mk-fisika",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pt-outsider",
        penggunaId: "usr-outsider",
        mataKuliahId: "mk-lain",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Ended session owned by usr-owner plus an active session whose legacy course
    // has no active canonical mapping at all
    await testDb.insert(schema.courses).values({
      id: "crs-orphan",
      title: "Kursus Yatim",
      category: "Matematika",
    });
    await testDb.insert(schema.liveQuizSessions).values([
      {
        id: "sess-out-ended",
        courseId: "crs-fisika",
        tutorId: "usr-owner",
        code: "OUT001",
        state: "ended",
        questionsSnapshot: "[]",
        participantCount: 0,
      },
      {
        id: "sess-orphan-course",
        courseId: "crs-orphan",
        tutorId: "usr-owner",
        code: "ORF001",
        state: "lobby",
        questionsSnapshot: "[]",
        participantCount: 0,
      },
    ]);

    // 1. Outsider against an ENDED session gets the standard forbidden response,
    // never a state-revealing 410, with exactly one rejected-access audit
    mockSession = {
      user: { id: "usr-outsider", name: "Tutor Outsider", role: "teacher" },
    };

    const reqEnded = new NextRequest("http://localhost/api/live/sess-out-ended/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const resEnded = await controlLiveSession(reqEnded, {
      params: Promise.resolve({ sessionId: "sess-out-ended" }),
    });
    expect(resEnded.status).toBe(403);
    const endedBody = await resEnded.json();
    expect(endedBody.error).toBe("Forbidden: No course access");

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toContain("TUTOR_ACCESS_DENIED");
    expect(audits1[0].reason).not.toContain("LIVE_SESSION_ALREADY_ENDED");
    expect(audits1[0].courseId).toBe("mk-fisika");

    // 2. Outsider with an INVALID action gets the identical forbidden response,
    // never a 400 validation response or extra INVALID_CONTROL_ACTION audit
    const reqInvalid = new NextRequest("http://localhost/api/live/sess-out-ended/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "totally_invalid_action" }),
    });
    const resInvalid = await controlLiveSession(reqInvalid, {
      params: Promise.resolve({ sessionId: "sess-out-ended" }),
    });
    expect(resInvalid.status).toBe(403);
    const invalidBody = await resInvalid.json();
    expect(invalidBody).toEqual(endedBody);

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].outcome).toBe("rejected");
    expect(audits2[1].reason).toContain("TUTOR_ACCESS_DENIED");
    expect(audits2[1].reason).not.toContain("INVALID_CONTROL_ACTION");

    // 3. Even the owner is denied when the legacy course has no unique active canonical mapping
    mockSession = {
      user: { id: "usr-owner", name: "Tutor Owner", role: "teacher" },
    };

    const reqOrphan = new NextRequest("http://localhost/api/live/sess-orphan-course/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const resOrphan = await controlLiveSession(reqOrphan, {
      params: Promise.resolve({ sessionId: "sess-orphan-course" }),
    });
    expect(resOrphan.status).toBe(403);

    const audits3 = await testDb.select().from(schema.auditMutasi);
    expect(audits3.length).toBe(3);
    expect(audits3[2].outcome).toBe("rejected");
    expect(audits3[2].reason).toContain("COURSE_NOT_FOUND");
  });

  it("returns controlled 400 and structured rejected audit without body on malformed JSON or schema-invalid live creation", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-val",
      name: "Tutor Validation",
      email: "tutorval@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-val",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-val",
      penggunaId: "usr-tutor-val",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    mockSession = {
      user: { id: "usr-tutor-val", name: "Tutor Validation", role: "teacher" },
    };

    // 1. Malformed JSON (syntax error)
    const malformedReq = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-a-valid-json-string{:::",
    });

    const malformedRes = await createLiveSession(malformedReq);
    expect(malformedRes.status).toBe(400);
    const malformedData = await malformedRes.json();
    expect(malformedData.error).toBe("Invalid body");

    const audits1 = await testDb.select().from(schema.auditMutasi);
    expect(audits1.length).toBe(1);
    expect(audits1[0].action).toBe("live_session.create");
    expect(audits1[0].outcome).toBe("rejected");
    expect(audits1[0].reason).toBe("INVALID_BODY");
    expect(audits1[0].courseId).toBe("unknown");
    const snapshot1 = typeof audits1[0].afterSnapshot === "string" ? JSON.parse(audits1[0].afterSnapshot) : audits1[0].afterSnapshot;
    expect(snapshot1.snapshot).toBeNull();

    // 2. Schema invalid (missing fields)
    const invalidSchemaReq = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unexpectedKey: "no-course-or-template" }),
    });

    const invalidSchemaRes = await createLiveSession(invalidSchemaReq);
    expect(invalidSchemaRes.status).toBe(400);
    const invalidSchemaData = await invalidSchemaRes.json();
    expect(invalidSchemaData.error).toBe("Invalid body");

    const audits2 = await testDb.select().from(schema.auditMutasi);
    expect(audits2.length).toBe(2);
    expect(audits2[1].action).toBe("live_session.create");
    expect(audits2[1].outcome).toBe("rejected");
    expect(audits2[1].reason).toBe("INVALID_BODY");
    const snapshot2 = typeof audits2[1].afterSnapshot === "string" ? JSON.parse(audits2[1].afterSnapshot) : audits2[1].afterSnapshot;
    expect(snapshot2.snapshot).toBeNull();
  });

  it("passes verified legacy courseId (persistedCourseId) to realtime room init during live session creation", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-init",
      name: "Tutor Init",
      email: "tutorinit@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-init",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-init",
      penggunaId: "usr-tutor-init",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-biologi", "crs-biologi", {
      code: "BI-1101",
      title: "Biologi Umum",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-init",
      penggunaId: "usr-tutor-init",
      mataKuliahId: "mk-biologi",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-bio-1",
      courseId: "crs-biologi",
      title: "Kuis Biologi Sel",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-tutor-init", name: "Tutor Init", role: "teacher" },
    };

    let capturedInitBody: any = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes("/room/") && urlStr.includes("/init")) {
        if (init?.body) {
          capturedInitBody = JSON.parse(String(init.body));
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const req = new NextRequest("http://localhost/api/live/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "mk-biologi",
        templateId: "tmpl-bio-1",
      }),
    });

    const res = await createLiveSession(req);
    expect(res.status).toBe(200);
    expect(capturedInitBody).not.toBeNull();
    // Must pass legacy courseId crs-biologi to worker init, not canonical ID mk-biologi
    expect(capturedInitBody.courseId).toBe("crs-biologi");
  });

  it("verifies live control success audit uses canonical auditCourseId", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-audit",
      name: "Tutor Audit",
      email: "tutoraudit@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-audit",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-audit",
      penggunaId: "usr-tutor-audit",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-statistika", "crs-statistika", {
      code: "ST-1101",
      title: "Statistika Dasar",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-audit",
      penggunaId: "usr-tutor-audit",
      mataKuliahId: "mk-statistika",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-stat-1",
      courseId: "crs-statistika",
      tutorId: "usr-tutor-audit",
      code: "STA001",
      state: "lobby",
      questionsSnapshot: "[]",
      participantCount: 0,
    });

    mockSession = {
      user: { id: "usr-tutor-audit", name: "Tutor Audit", role: "teacher" },
    };

    const req = new NextRequest("http://localhost/api/live/sess-stat-1/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });

    const res = await controlLiveSession(req, {
      params: Promise.resolve({ sessionId: "sess-stat-1" }),
    });
    expect(res.status).toBe(200);

    const audits = await testDb.select().from(schema.auditMutasi);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("live_session.control");
    expect(audits[0].outcome).toBe("success");
    // Must record canonical courseId mk-statistika, not raw legacy crs-statistika
    expect(audits[0].courseId).toBe("mk-statistika");
  });

  it("verifies live callback derives legacyCourseId from stored session, persists legacy FK live_quiz_results, and triggers mastery recompute", async () => {
    const now = new Date();

    // Student and tutor users
    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-cb",
        name: "Tutor Callback",
        email: "tutorcb@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-student-1",
        name: "Student Satu",
        email: "student1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-aljabar", "crs-aljabar", {
      code: "MA-1201",
      title: "Aljabar Linear",
    });

    // Stored live session with legacy course crs-aljabar
    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-aljabar-1",
      courseId: "crs-aljabar",
      tutorId: "usr-tutor-cb",
      code: "ALJ001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Determinan dari matriks identitas?", options: ["0", "1"], correctIndex: 1 },
      ],
      participantCount: 0,
    });

    // 1. Unauthorized request without valid Bearer token -> 401
    const unauthReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "sess-aljabar-1" }),
    });
    const unauthRes = await callbackLiveSession(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Unknown session -> 404
    const unknownReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: "sess-non-existent-999",
        courseId: "untrusted-override-id",
        leaderboard: [],
        answersByQuestion: {},
        questions: [],
      }),
    });
    const unknownRes = await callbackLiveSession(unknownReq);
    expect(unknownRes.status).toBe(404);

    // 3. Valid callback with untrusted canonical courseId in body
    // Must ignore body.courseId and derive legacy crs-aljabar from stored session
    const validReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: "sess-aljabar-1",
        courseId: "mk-aljabar-canonical-untrusted",
        leaderboard: [
          { userId: "usr-student-1", name: "Student Satu", score: 1000, rank: 1 },
        ],
        answersByQuestion: {
          0: { "usr-student-1": { choice: 1, receivedTs: Date.now() } },
        },
        questions: [
          { prompt: "Determinan dari matriks identitas?", options: ["0", "1"], correctIndex: 1 },
        ],
      }),
    });

    const validRes = await callbackLiveSession(validReq);
    expect(validRes.status).toBe(200);

    // Verify session ended
    const [savedSess] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-aljabar-1"));
    expect(savedSess.state).toBe("ended");
    expect(savedSess.participantCount).toBe(1);

    // Verify results written with legacy FK crs-aljabar
    const results = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-aljabar-1"));
    expect(results.length).toBe(1);
    expect(results[0].studentId).toBe("usr-student-1");
    expect(results[0].courseId).toBe("crs-aljabar");
    expect(results[0].score).toBe(1000);
    expect(results[0].rank).toBe(1);

    // Verify learning events recorded with legacyCourseId
    expect(recordedEventsList.length).toBe(1);
    expect(recordedEventsList[0].courseId).toBe("crs-aljabar");
    expect(recordedEventsList[0].studentId).toBe("usr-student-1");
    expect(recordedEventsList[0].correctness).toBe(1);

    // Verify inngest mastery recompute triggered with legacyCourseId and correct event name
    expect(inngestSentEvents.length).toBe(1);
    expect(inngestSentEvents[0].name).toBe("mastery/recompute.requested");
    expect(inngestSentEvents[0].data.courseId).toBe("crs-aljabar");
    expect(inngestSentEvents[0].data.studentId).toBe("usr-student-1");

    // 4. Repeated callback call for the same session (idempotency check)
    const repeatReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: "sess-aljabar-1",
        courseId: "mk-aljabar-canonical-untrusted",
        leaderboard: [
          { userId: "usr-student-1", name: "Student Satu", score: 1000, rank: 1 },
        ],
        answersByQuestion: {
          0: { "usr-student-1": { choice: 1, receivedTs: Date.now() } },
        },
        questions: [
          { prompt: "Determinan dari matriks identitas?", options: ["0", "1"], correctIndex: 1 },
        ],
      }),
    });
    const repeatRes = await callbackLiveSession(repeatReq);
    expect(repeatRes.status).toBe(200);

    // Results in DB must still be 1 (no duplicate rows)
    const resultsAfterRepeat = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-aljabar-1"));
    expect(resultsAfterRepeat.length).toBe(1);

    // Learning events and Inngest events must NOT be recorded or fired again
    expect(recordedEventsList.length).toBe(1);
    expect(inngestSentEvents.length).toBe(1);
  });

  it("authenticates /init with HMAC and compensates orphan Durable Object if database insert fails", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-comp",
      name: "Tutor Compensation",
      email: "tutorcomp@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-comp",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-comp",
      penggunaId: "usr-tutor-comp",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-statistika", "crs-statistika", {
      code: "ST-1101",
      title: "Statistika Dasar",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-comp",
      penggunaId: "usr-tutor-comp",
      mataKuliahId: "mk-statistika",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-comp-1",
      courseId: "crs-statistika",
      title: "Kuis Statistika 1",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-tutor-comp", name: "Tutor Compensation", role: "teacher" },
    };

    const fetchCalls: Array<{ url: string; headers?: any; body?: any }> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: String(input),
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    const origInsert = testDb.insert.bind(testDb);
    (testDb as any).insert = (table: any) => {
      if (table === schema.liveQuizSessions) {
        return {
          values: () => Promise.reject(new Error("Simulated database failure")),
        };
      }
      return origInsert(table);
    };

    try {
      const req = new NextRequest("http://localhost/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "mk-statistika",
          templateId: "tmpl-comp-1",
        }),
      });

      const res = await createLiveSession(req);
      expect(res.status).toBe(500);

      // Verify init call had Authorization Bearer header
      const initCall = fetchCalls.find((c) => c.url.includes("/init"));
      expect(initCall).toBeDefined();
      expect(initCall?.headers?.Authorization).toBe(`Bearer ${(env as any).LIVE_HMAC_SECRET}`);

      // Verify compensation call to control with action 'end' was dispatched
      const compensationCall = fetchCalls.find((c) => c.url.includes("/control"));
      expect(compensationCall).toBeDefined();
      expect(compensationCall?.body?.action).toBe("end");
      expect(compensationCall?.headers?.Authorization).toBe(`Bearer ${(env as any).LIVE_HMAC_SECRET}`);

      // Verify mutation audit recorded failure
      const audits = await testDb
        .select()
        .from(schema.auditMutasi)
        .where(eq(schema.auditMutasi.actorId, "usr-tutor-comp"));
      expect(audits.length).toBe(1);
      expect(audits[0].outcome).toBe("failed");
      expect(audits[0].reason).toContain("DATABASE_INSERT_FAILED");
    } finally {
      (testDb as any).insert = origInsert;
    }
  });

  it("handles concurrent live callback processing with atomic idempotency and single dispatch of side effects", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-conc",
        name: "Tutor Concurrent",
        email: "tutorconc@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-student-conc-1",
        name: "Student Conc 1",
        email: "studentconc1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-student-conc-2",
        name: "Student Conc 2",
        email: "studentconc2@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-kalkulus-conc", "crs-kalkulus-conc", {
      code: "MK-CONC",
      title: "Kalkulus Konkuren",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-conc-1",
      courseId: "crs-kalkulus-conc",
      tutorId: "usr-tutor-conc",
      code: "CNC001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 0,
    });

    const payload = {
      sessionId: "sess-conc-1",
      courseId: "crs-kalkulus-conc",
      leaderboard: [
        { userId: "usr-student-conc-1", name: "Student Conc 1", score: 1000, rank: 1 },
        { userId: "usr-student-conc-2", name: "Student Conc 2", score: 800, rank: 2 },
      ],
      answersByQuestion: {
        0: {
          "usr-student-conc-1": { choice: 0, receivedTs: Date.now() },
          "usr-student-conc-2": { choice: 1, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
    };

    // Execute 5 concurrent callbacks simultaneously
    const requests = Array.from({ length: 5 }, () =>
      new NextRequest("http://localhost/api/live/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
        },
        body: JSON.stringify(payload),
      })
    );

    const responses = await Promise.all(requests.map((r) => callbackLiveSession(r)));
    for (const res of responses) {
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    }

    // Results in DB must be exactly 2 (one per student), no duplicates
    const results = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-conc-1"));
    expect(results.length).toBe(2);

    // Learning events and Inngest events must only be dispatched once
    expect(recordedEventsList.length).toBe(2);
    expect(inngestSentEvents.length).toBe(2);
  });

  it("propagates downstream dispatch failure with HTTP 500 and successfully retries downstream mastery delivery without duplicating result rows", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-retry",
        name: "Tutor Retry",
        email: "tutorretry@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-student-retry-1",
        name: "Student Retry 1",
        email: "studentretry1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-retry-can", "crs-retry-leg", {
      code: "MK-RETRY",
      title: "Retry Course",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-retry-1",
      courseId: "crs-retry-leg",
      tutorId: "usr-tutor-retry",
      code: "RTR001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 0,
    });

    const payload = {
      sessionId: "sess-retry-1",
      courseId: "crs-retry-leg",
      leaderboard: [
        { userId: "usr-student-retry-1", name: "Student Retry 1", score: 1000, rank: 1 },
      ],
      answersByQuestion: {
        0: {
          "usr-student-retry-1": { choice: 0, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
    };

    // 1. Simulate downstream Inngest outage: inngest.send throws an error
    const inngestModule = await import("@/lib/inngest");
    const originalSend = inngestModule.inngest.send;
    let shouldFailInngest = true;
    (inngestModule.inngest as any).send = mock(async (p: any) => {
      if (shouldFailInngest) {
        throw new Error("Inngest simulated outage");
      }
      inngestSentEvents.push(p);
      return {};
    });

    const failReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const failRes = await callbackLiveSession(failReq);
    expect(failRes.status).toBe(500);
    const failJson = await failRes.json();
    expect(failJson.error).toContain("downstream dispatch failed");

    // Results in DB must be stored atomically and deliveryStatus must be marked failed
    const [sessAfterFail] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-retry-1"));
    expect(sessAfterFail.deliveryStatus).toBe("failed");
    expect(sessAfterFail.state).toBe("ended");

    const resultsAfterFail = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-retry-1"));
    expect(resultsAfterFail.length).toBe(1);

    // 2. Downstream service recovers: retry callback
    shouldFailInngest = false;

    const retryReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const retryRes = await callbackLiveSession(retryReq);
    expect(retryRes.status).toBe(200);
    const retryJson = await retryRes.json();
    expect(retryJson.ok).toBe(true);

    // Delivery status is now delivered
    const [sessAfterRetry] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-retry-1"));
    expect(sessAfterRetry.deliveryStatus).toBe("delivered");
    expect(sessAfterRetry.deliveredAt).toBeDefined();

    // Results must not be duplicated
    const resultsAfterRetry = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-retry-1"));
    expect(resultsAfterRetry.length).toBe(1);

    // Inngest received exactly 1 recompute event
    expect(inngestSentEvents.length).toBe(1);
    expect(inngestSentEvents[0].name).toBe("mastery/recompute.requested");

    // 3. Repeated callback after delivery is already complete (idempotency)
    const repeatReq = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const repeatRes = await callbackLiveSession(repeatReq);
    expect(repeatRes.status).toBe(200);
    expect(inngestSentEvents.length).toBe(1);

    // Restore original mock
    (inngestModule.inngest as any).send = originalSend;
  });

  it("enforces exclusive lease claim on concurrent callbacks preventing duplicate side-effect dispatch and recovers on stale expired claims", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-lease",
        name: "Tutor Lease",
        email: "tutorlease@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-student-lease-1",
        name: "Student Lease 1",
        email: "studentlease1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-lease-can", "crs-lease-leg", {
      code: "MK-LEASE",
      title: "Lease Course",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-lease-1",
      courseId: "crs-lease-leg",
      tutorId: "usr-tutor-lease",
      code: "LSE001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 0,
    });

    const payload = {
      sessionId: "sess-lease-1",
      courseId: "crs-lease-leg",
      leaderboard: [
        { userId: "usr-student-lease-1", name: "Student Lease 1", score: 1000, rank: 1 },
      ],
      answersByQuestion: {
        0: {
          "usr-student-lease-1": { choice: 0, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
    };

    // Part A: Deterministic interleaving - pause Handler 1 after it claims the lease
    const inngestModule = await import("@/lib/inngest");
    const originalSend = inngestModule.inngest.send;

    let resolveHandler1: (() => void) | null = null;
    const handler1Paused = new Promise<void>((res) => {
      resolveHandler1 = res;
    });

    let handler1EnteredSend = false;
    let sendDispatchCount = 0;

    (inngestModule.inngest as any).send = mock(async (event: any) => {
      sendDispatchCount++;
      handler1EnteredSend = true;
      // Wait for Handler 2 to run while Handler 1 holds the lease
      await handler1Paused;
      return {};
    });

    // Start Handler 1 (will claim lease and pause inside inngest.send)
    const req1 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const handler1Promise = callbackLiveSession(req1);

    // Wait until Handler 1 has claimed the lease and entered inngest.send
    while (!handler1EnteredSend) {
      await new Promise((r) => setTimeout(r, 5));
    }

    // Verify DB session is now in processing state with active claim
    const [sessInFlight] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-lease-1"));
    expect(sessInFlight.deliveryStatus).toBe("processing");
    expect(sessInFlight.deliveryClaimedAt).toBeDefined();

    // Handler 2 runs while Handler 1 holds the active lease
    const req2 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const res2 = await callbackLiveSession(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);

    // Handler 2 must NOT have triggered any dispatch
    expect(sendDispatchCount).toBe(1);

    // Now unpause Handler 1 and let it complete
    resolveHandler1!();
    const res1 = await handler1Promise;
    expect(res1.status).toBe(200);

    // After Handler 1 finishes, delivery status is delivered
    const [sessDelivered] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-lease-1"));
    expect(sessDelivered.deliveryStatus).toBe("delivered");
    expect(sendDispatchCount).toBe(1);

    // Part B: Stale claim recovery
    // Create a second session with an expired lease (claimed 45s ago)
    const expiredClaimTime = new Date(Date.now() - 45_000);
    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-stale-lease",
      courseId: "crs-lease-leg",
      tutorId: "usr-tutor-lease",
      code: "STL001",
      state: "ended",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 1,
      deliveryStatus: "processing",
      deliveryClaimedAt: expiredClaimTime,
    });

    // Also simulate results already persisted by earlier crashed attempt
    await testDb.insert(schema.liveQuizResults).values({
      id: "res-stale-1",
      sessionId: "sess-stale-lease",
      studentId: "usr-student-lease-1",
      courseId: "crs-lease-leg",
      score: 1000,
      rank: 1,
      answersSnapshot: [],
    });

    // Restore standard mock for send
    let staleSendCount = 0;
    (inngestModule.inngest as any).send = mock(async (event: any) => {
      staleSendCount++;
      return {};
    });

    const stalePayload = {
      ...payload,
      sessionId: "sess-stale-lease",
    };

    const req3 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(stalePayload),
    });

    const res3 = await callbackLiveSession(req3);
    expect(res3.status).toBe(200);

    // Stale claim was reclaimed and dispatched
    expect(staleSendCount).toBe(1);

    const [sessStaleRecovered] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-stale-lease"));
    expect(sessStaleRecovered.deliveryStatus).toBe("delivered");
    expect(sessStaleRecovered.deliveredAt).toBeDefined();

    // Results in DB must still be 1 (no duplicate rows created during recovery)
    const staleResults = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-stale-lease"));
    expect(staleResults.length).toBe(1);

    // Restore original mock
    (inngestModule.inngest as any).send = originalSend;
  });

  it("prevents duplicate learning events on retry after partial downstream Inngest failure", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-part",
        name: "Tutor Part",
        email: "tutorpart@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-st-part-1",
        name: "Student Part 1",
        email: "stpart1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-st-part-2",
        name: "Student Part 2",
        email: "stpart2@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-part-can", "crs-part-leg", {
      code: "MK-PART",
      title: "Partial Failure Course",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-part-fail-1",
      courseId: "crs-part-leg",
      tutorId: "usr-tutor-part",
      code: "PRT001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
        { prompt: "Q2", options: ["C", "D"], correctIndex: 1 },
      ],
      participantCount: 0,
    });

    const payload = {
      sessionId: "sess-part-fail-1",
      courseId: "crs-part-leg",
      leaderboard: [
        { userId: "usr-st-part-1", name: "Student Part 1", score: 1000, rank: 1 },
        { userId: "usr-st-part-2", name: "Student Part 2", score: 800, rank: 2 },
      ],
      answersByQuestion: {
        0: {
          "usr-st-part-1": { choice: 0, receivedTs: Date.now() },
          "usr-st-part-2": { choice: 1, receivedTs: Date.now() },
        },
        1: {
          "usr-st-part-1": { choice: 1, receivedTs: Date.now() },
          "usr-st-part-2": { choice: 1, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
        { prompt: "Q2", options: ["C", "D"], correctIndex: 1 },
      ],
    };

    const inngestModule = await import("@/lib/inngest");
    const originalSend = inngestModule.inngest.send;

    // 1. First attempt: learning events succeed, but Inngest dispatch fails
    let inngestShouldFail = true;
    const sentEventsList: any[] = [];

    (inngestModule.inngest as any).send = mock(async (event: any) => {
      if (inngestShouldFail) {
        throw new Error("Inngest simulated network exception");
      }
      sentEventsList.push(event);
      return {};
    });

    const req1 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const res1 = await callbackLiveSession(req1);
    expect(res1.status).toBe(500);

    // Learning events in DB must be exactly 4 (2 students * 2 questions)
    const learningEventsAfterFail = await testDb
      .select()
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.courseId, "crs-part-leg"));
    expect(learningEventsAfterFail.length).toBe(4);

    // Results in DB must be exactly 2
    const resultsAfterFail = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-part-fail-1"));
    expect(resultsAfterFail.length).toBe(2);

    // Session is marked failed
    const [sessAfterFail] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-part-fail-1"));
    expect(sessAfterFail.deliveryStatus).toBe("failed");

    // 2. Second attempt (retry): Inngest succeeds
    inngestShouldFail = false;

    const req2 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const res2 = await callbackLiveSession(req2);
    expect(res2.status).toBe(200);

    // Learning events in DB must STILL be exactly 4 (no duplicate events created on retry)
    const learningEventsAfterRetry = await testDb
      .select()
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.courseId, "crs-part-leg"));
    expect(learningEventsAfterRetry.length).toBe(4);

    // Results in DB must still be 2
    const resultsAfterRetry = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-part-fail-1"));
    expect(resultsAfterRetry.length).toBe(2);

    // Inngest received exactly 2 student recompute events with stable idempotency IDs
    expect(sentEventsList.length).toBe(2);
    expect(sentEventsList.map((e) => e.id)).toEqual([
      "mastery-recompute-sess-part-fail-1-usr-st-part-1",
      "mastery-recompute-sess-part-fail-1-usr-st-part-2",
    ]);

    // Session is marked delivered
    const [sessAfterRetry] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-part-fail-1"));
    expect(sessAfterRetry.deliveryStatus).toBe("delivered");

    (inngestModule.inngest as any).send = originalSend;
  });

  it("enforces fencing token so expired owner cannot finalize and external dispatch uses stable idempotency IDs", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-fence",
        name: "Tutor Fence",
        email: "tutorfence@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-st-fence-1",
        name: "Student Fence 1",
        email: "stfence1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-fence-can", "crs-fence-leg", {
      code: "MK-FENCE",
      title: "Fence Course",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-fence-1",
      courseId: "crs-fence-leg",
      tutorId: "usr-tutor-fence",
      code: "FNC001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 0,
    });

    const payload = {
      sessionId: "sess-fence-1",
      courseId: "crs-fence-leg",
      leaderboard: [
        { userId: "usr-st-fence-1", name: "Student Fence 1", score: 1000, rank: 1 },
      ],
      answersByQuestion: {
        0: {
          "usr-st-fence-1": { choice: 0, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
    };

    const inngestModule = await import("@/lib/inngest");
    const originalSend = inngestModule.inngest.send;

    let resolveOwnerA: (() => void) | null = null;
    const ownerAPaused = new Promise<void>((res) => {
      resolveOwnerA = res;
    });

    let ownerAEnteredInngest = false;
    const dispatchedInngestEvents: any[] = [];

    (inngestModule.inngest as any).send = mock(async (event: any) => {
      dispatchedInngestEvents.push(event);
      if (!ownerAEnteredInngest) {
        ownerAEnteredInngest = true;
        // Pause Owner A to simulate TTL expiration and takeover
        await ownerAPaused;
      }
      return {};
    });

    // 1. Start Owner A
    const reqA = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const ownerAPromise = callbackLiveSession(reqA);

    // Wait until Owner A claims the lease and pauses
    while (!ownerAEnteredInngest) {
      await new Promise((r) => setTimeout(r, 5));
    }

    const [sessDuringA] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-fence-1"));
    const tokenA = sessDuringA.deliveryClaimToken;
    expect(tokenA).toBeDefined();

    // 2. Simulate lease expiration by updating deliveryClaimedAt to 45 seconds in the past
    await testDb
      .update(schema.liveQuizSessions)
      .set({
        deliveryClaimedAt: new Date(Date.now() - 45_000),
      })
      .where(eq(schema.liveQuizSessions.id, "sess-fence-1"));

    // 3. Owner B arrives, takes over the expired lease with a fresh token, and finishes delivery
    const reqB = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const resB = await callbackLiveSession(reqB);
    expect(resB.status).toBe(200);

    const [sessAfterB] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-fence-1"));
    expect(sessAfterB.deliveryStatus).toBe("delivered");
    const tokenB = sessAfterB.deliveryClaimToken;
    expect(tokenB).toBeDefined();
    expect(tokenB).not.toBe(tokenA); // Token was refreshed for Owner B

    // 4. Resume Owner A (expired owner)
    resolveOwnerA!();
    const resA = await ownerAPromise;
    expect(resA.status).toBe(200);

    // Terminal state in DB MUST remain finalized by Owner B
    const [sessFinal] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-fence-1"));
    expect(sessFinal.deliveryStatus).toBe("delivered");
    expect(sessFinal.deliveryClaimToken).toBe(tokenB); // Token A was prevented from overwriting

    // Exactly 1 learning event in DB (idempotent with deterministic ID)
    const learningEvents = await testDb
      .select()
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.courseId, "crs-fence-leg"));
    expect(learningEvents.length).toBe(1);

    // Inngest calls from both handlers carried identical stable event IDs
    expect(dispatchedInngestEvents.length).toBe(2);
    expect(dispatchedInngestEvents[0].id).toBe("mastery-recompute-sess-fence-1-usr-st-fence-1");
    expect(dispatchedInngestEvents[1].id).toBe("mastery-recompute-sess-fence-1-usr-st-fence-1");

    (inngestModule.inngest as any).send = originalSend;
  });

  it("generates delimiter-unambiguous learning-event IDs and preserves both inserts for tuples with hyphens", async () => {
    const id1 = buildLiveQuizLearningEventId("a-b", "c", 0);
    const id2 = buildLiveQuizLearningEventId("a", "b-c", 0);

    // Verify generated IDs are strictly distinct
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("le_lq_")).toBe(true);
    expect(id2.startsWith("le_lq_")).toBe(true);

    const now = new Date();
    await testDb.insert(schema.user).values([
      { id: "usr-c", name: "User C", email: "c@zyx.test", role: "student", createdAt: now, updatedAt: now },
      { id: "usr-b-c", name: "User B-C", email: "bc@zyx.test", role: "student", createdAt: now, updatedAt: now },
    ]);

    await testDb.insert(schema.courses).values({
      id: "crs-hyphen-test",
      title: "Hyphen Course",
      category: "Matematika",
    });

    // Insert both learning events into database
    await recordLearningEvents([
      {
        id: id1,
        studentId: "usr-c",
        courseId: "crs-hyphen-test",
        eventType: "quiz_answer",
        correctness: 1,
        weight: 1,
      },
      {
        id: id2,
        studentId: "usr-b-c",
        courseId: "crs-hyphen-test",
        eventType: "quiz_answer",
        correctness: 1,
        weight: 1,
      },
    ]);

    // Query DB: both inserts must survive and exist in DB
    const insertedEvents = await testDb
      .select()
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.courseId, "crs-hyphen-test"));
    expect(insertedEvents.length).toBe(2);
    expect(insertedEvents.map((e) => e.id).sort()).toEqual([id1, id2].sort());
  });

  it("forces two initial claimers observing the same claimable state to race CAS where exactly one wins and dispatches", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values([
      {
        id: "usr-tutor-cas",
        name: "Tutor CAS",
        email: "tutorcas@zyx.test",
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-st-cas-1",
        name: "Student CAS 1",
        email: "stcas1@zyx.test",
        role: "student",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await seedCoursePair("mk-cas-can", "crs-cas-leg", {
      code: "MK-CAS",
      title: "CAS Course",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-cas-1",
      courseId: "crs-cas-leg",
      tutorId: "usr-tutor-cas",
      code: "CAS001",
      state: "lobby",
      questionsSnapshot: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
      participantCount: 0,
      deliveryStatus: "pending",
      deliveryClaimToken: null,
    });

    const payload = {
      sessionId: "sess-cas-1",
      courseId: "crs-cas-leg",
      leaderboard: [
        { userId: "usr-st-cas-1", name: "Student CAS 1", score: 1000, rank: 1 },
      ],
      answersByQuestion: {
        0: {
          "usr-st-cas-1": { choice: 0, receivedTs: Date.now() },
        },
      },
      questions: [
        { prompt: "Q1", options: ["A", "B"], correctIndex: 0 },
      ],
    };

    const inngestModule = await import("@/lib/inngest");
    const originalSend = inngestModule.inngest.send;

    let inngestDispatchCount = 0;
    (inngestModule.inngest as any).send = mock(async (event: any) => {
      inngestDispatchCount++;
      return {};
    });

    // Run two concurrent callback requests simultaneously targeting the unstarted session
    const req1 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const req2 = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const [res1, res2] = await Promise.all([
      callbackLiveSession(req1),
      callbackLiveSession(req2),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Exactly one CAS winner dispatched side effects
    expect(inngestDispatchCount).toBe(1);

    // Results in DB must be exactly 1 row (from the single CAS winner)
    const results = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-cas-1"));
    expect(results.length).toBe(1);

    // Terminal status is delivered
    const [sess] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-cas-1"));
    expect(sess.deliveryStatus).toBe("delivered");
    expect(sess.deliveryClaimToken).toBeDefined();

    (inngestModule.inngest as any).send = originalSend;
  });

  it("structurally validates callback payload and rejects malformed leaderboard, questions, or answers with controlled 400 without mutations", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-val-cb",
      name: "Tutor Val CB",
      email: "tutorvalcb@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });

    await seedCoursePair("mk-val-cb", "crs-val-cb", {
      code: "MK-VALCB",
      title: "Validasi Callback",
    });

    await testDb.insert(schema.liveQuizSessions).values({
      id: "sess-val-cb-1",
      courseId: "crs-val-cb",
      tutorId: "usr-tutor-val-cb",
      code: "VCB001",
      state: "lobby",
      questionsSnapshot: "[]",
      participantCount: 0,
    });

    const validHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(env as any).LIVE_HMAC_SECRET}`,
    };

    // 1. Malformed JSON syntax
    const reqSyntax = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: "not-json-content{{{",
    });
    const resSyntax = await callbackLiveSession(reqSyntax);
    expect(resSyntax.status).toBe(400);
    expect((await resSyntax.json()).error).toBe("Invalid body");

    // 2. Missing sessionId
    const reqMissingSession = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: JSON.stringify({
        leaderboard: [],
        answersByQuestion: {},
        questions: [],
      }),
    });
    const resMissingSession = await callbackLiveSession(reqMissingSession);
    expect(resMissingSession.status).toBe(400);
    expect((await resMissingSession.json()).error).toBe("Invalid body");

    // 3. Malformed leaderboard: not an array
    const reqBadLeaderboard = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: JSON.stringify({
        sessionId: "sess-val-cb-1",
        leaderboard: "should-be-an-array",
      }),
    });
    const resBadLeaderboard = await callbackLiveSession(reqBadLeaderboard);
    expect(resBadLeaderboard.status).toBe(400);

    // 4. Malformed leaderboard entry: missing userId or invalid rank/score type
    const reqBadEntry = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: JSON.stringify({
        sessionId: "sess-val-cb-1",
        leaderboard: [{ name: "No UserId", score: "not-a-number", rank: -5 }],
      }),
    });
    const resBadEntry = await callbackLiveSession(reqBadEntry);
    expect(resBadEntry.status).toBe(400);

    // 5. Malformed answersByQuestion entry: invalid choice type
    const reqBadAnswers = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: JSON.stringify({
        sessionId: "sess-val-cb-1",
        leaderboard: [{ userId: "usr-1", name: "U1", score: 100, rank: 1 }],
        answersByQuestion: {
          0: { "usr-1": { choice: "invalid-choice-type", receivedTs: 12345 } },
        },
      }),
    });
    const resBadAnswers = await callbackLiveSession(reqBadAnswers);
    expect(resBadAnswers.status).toBe(400);

    // 6. Malformed questions entry: missing options array
    const reqBadQuestions = new NextRequest("http://localhost/api/live/callback", {
      method: "POST",
      headers: validHeaders,
      body: JSON.stringify({
        sessionId: "sess-val-cb-1",
        leaderboard: [{ userId: "usr-1", name: "U1", score: 100, rank: 1 }],
        questions: [{ prompt: "Q without options" }],
      }),
    });
    const resBadQuestions = await callbackLiveSession(reqBadQuestions);
    expect(resBadQuestions.status).toBe(400);

    // Verify session in DB remained completely unmutated (state still 'lobby', participantCount 0)
    const [sessInDb] = await testDb
      .select()
      .from(schema.liveQuizSessions)
      .where(eq(schema.liveQuizSessions.id, "sess-val-cb-1"));
    expect(sessInDb.state).toBe("lobby");
    expect(sessInDb.participantCount).toBe(0);

    const resultsInDb = await testDb
      .select()
      .from(schema.liveQuizResults)
      .where(eq(schema.liveQuizResults.sessionId, "sess-val-cb-1"));
    expect(resultsInDb.length).toBe(0);
  });

  it("compensates orphan Durable Object when database insert fails and records clear cleanup failure on non-2xx control response without masking DB error", async () => {
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "usr-tutor-comp-fail",
      name: "Tutor Compensation Fail",
      email: "tutorcompfail@zyx.test",
      role: "teacher",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.pengguna).values({
      id: "usr-tutor-comp-fail",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-comp-fail",
      penggunaId: "usr-tutor-comp-fail",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await seedCoursePair("mk-statistika-cf", "crs-statistika-cf", {
      code: "ST-1102",
      title: "Statistika Lanjut",
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-comp-fail",
      penggunaId: "usr-tutor-comp-fail",
      mataKuliahId: "mk-statistika-cf",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.quizTemplates).values({
      id: "tmpl-comp-fail-1",
      courseId: "crs-statistika-cf",
      title: "Kuis Statistika 2",
      category: "weekly",
      status: "published",
      selectionRules: { count: 5 },
    });

    mockSession = {
      user: { id: "usr-tutor-comp-fail", name: "Tutor Compensation Fail", role: "teacher" },
    };

    let controlAttempts = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes("/init")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/control")) {
        controlAttempts++;
        return new Response("Realtime DO cleanup internal error", { status: 500 });
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const origInsert = testDb.insert.bind(testDb);
    (testDb as any).insert = (table: any) => {
      if (table === schema.liveQuizSessions) {
        return {
          values: () => Promise.reject(new Error("Database disk full")),
        };
      }
      return origInsert(table);
    };

    try {
      const req = new NextRequest("http://localhost/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "mk-statistika-cf",
          templateId: "tmpl-comp-fail-1",
        }),
      });

      const res = await createLiveSession(req);
      // Returns 500 without masking DB error
      expect(res.status).toBe(500);
      const resBody = await res.json();
      expect(resBody.error).toBe("Gagal menyimpan sesi kuis");

      // Verify bounded retries (2 attempts)
      expect(controlAttempts).toBe(2);

      // Verify mutation audit recorded failure with both DB insert error and cleanup failure surfaced
      const audits = await testDb
        .select()
        .from(schema.auditMutasi)
        .where(eq(schema.auditMutasi.actorId, "usr-tutor-comp-fail"));
      expect(audits.length).toBe(1);
      expect(audits[0].outcome).toBe("failed");
      expect(audits[0].reason).toContain("DATABASE_INSERT_FAILED: Database disk full");
      expect(audits[0].reason).toContain("ORPHAN_CLEANUP_FAILED: HTTP 500");
    } finally {
      (testDb as any).insert = origInsert;
    }
  });

  describe("Realtime Worker Security Contracts", () => {
    function createMockToken(
      payload: {
        userId: string;
        name: string;
        sessionId: string;
        exp: number;
        isHost?: boolean;
      },
      secret: string = (env as any).LIVE_HMAC_SECRET,
    ): string {
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = createHmac("sha256", secret).update(b64).digest("hex");
      return `${b64}.${sig}`;
    }

    function createMockDurableObjectState() {
      const storageMap = new Map<string, any>();
      return {
        storage: {
          get: async <T>(key: string): Promise<T | undefined> => storageMap.get(key),
          put: async (key: string, value: any): Promise<void> => {
            storageMap.set(key, value);
          },
        },
        blockConcurrencyWhile: async (fn: () => Promise<void>) => {
          await fn();
        },
        acceptWebSocket: mock((_ws: any, _tags: string[]) => {}),
        getWebSockets: mock((_tag?: string) => []),
        getTags: mock((_ws: any) => []),
      };
    }

    it("verifies valid HMAC token and rejects invalid or expired token", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const validPayload = {
        userId: "usr-rt-1",
        name: "Realtime User",
        sessionId: "sess-rt-1",
        exp: Date.now() + 60_000,
        isHost: true,
      };
      const token = createMockToken(validPayload, secret);
      const verified = await verifyHmacToken(token, secret);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("usr-rt-1");
      expect(verified?.sessionId).toBe("sess-rt-1");
      expect(verified?.isHost).toBe(true);

      // Wrong secret
      const badSecretToken = createMockToken(validPayload, "wrong-secret-12345");
      expect(await verifyHmacToken(badSecretToken, secret)).toBeNull();

      // Expired token
      const expiredToken = createMockToken({ ...validPayload, exp: Date.now() - 1000 }, secret);
      expect(await verifyHmacToken(expiredToken, secret)).toBeNull();
    });

    it("rejects signed tokens with malformed runtime payload fields (empty userId/sessionId/name or non-finite exp)", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const basePayload = {
        userId: "usr-rt-1",
        name: "Realtime User",
        sessionId: "sess-rt-1",
        exp: Date.now() + 60_000,
        isHost: false,
      };

      // 1. Empty or whitespace-only userId
      const emptyUserToken = createMockToken({ ...basePayload, userId: "" }, secret);
      expect(await verifyHmacToken(emptyUserToken, secret)).toBeNull();

      const wsUserToken = createMockToken({ ...basePayload, userId: "   " }, secret);
      expect(await verifyHmacToken(wsUserToken, secret)).toBeNull();

      // 2. Empty or whitespace-only sessionId
      const emptySessionToken = createMockToken({ ...basePayload, sessionId: "" }, secret);
      expect(await verifyHmacToken(emptySessionToken, secret)).toBeNull();

      const wsSessionToken = createMockToken({ ...basePayload, sessionId: "   " }, secret);
      expect(await verifyHmacToken(wsSessionToken, secret)).toBeNull();

      // 3. Empty or whitespace-only name
      const emptyNameToken = createMockToken({ ...basePayload, name: "" }, secret);
      expect(await verifyHmacToken(emptyNameToken, secret)).toBeNull();

      const wsNameToken = createMockToken({ ...basePayload, name: "   " }, secret);
      expect(await verifyHmacToken(wsNameToken, secret)).toBeNull();

      // 4. Non-finite or non-numeric exp (NaN, Infinity, string)
      const nanExpToken = createMockToken({ ...basePayload, exp: NaN }, secret);
      expect(await verifyHmacToken(nanExpToken, secret)).toBeNull();

      const infExpToken = createMockToken({ ...basePayload, exp: Infinity }, secret);
      expect(await verifyHmacToken(infExpToken, secret)).toBeNull();

      const strExpToken = createMockToken({ ...basePayload, exp: "1234567890" as any }, secret);
      expect(await verifyHmacToken(strExpToken, secret)).toBeNull();
    });

    it("rejects /init when missing Authorization or when body sessionId mismatches URL room", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const ctx = createMockDurableObjectState();
      const room = new LiveQuizRoom(ctx as any, {
        LIVE_HMAC_SECRET: secret,
        NEXT_APP_URL: "https://realtime.zyx.test",
        LIVE_QUIZ_ROOM: {} as any,
      });

      // 1. Missing Authorization header -> 401
      const unauthReq = new Request("https://realtime.zyx.test/room/sess-room-1/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-room-1",
          courseId: "crs-1",
          questions: [],
        }),
      });
      const unauthRes = await room.fetch(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Mismatched sessionId in body vs URL room -> 400
      const mismatchReq = new Request("https://realtime.zyx.test/room/sess-room-1/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          sessionId: "sess-room-DIFFERENT",
          courseId: "crs-1",
          questions: [],
        }),
      });
      const mismatchRes = await room.fetch(mismatchReq);
      expect(mismatchRes.status).toBe(400);

      // 3. Valid init -> 200
      const validReq = new Request("https://realtime.zyx.test/room/sess-room-1/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          sessionId: "sess-room-1",
          courseId: "crs-1",
          questions: [{ prompt: "Q1", options: ["A", "B"], correctIndex: 0 }],
        }),
      });
      const validRes = await room.fetch(validReq);
      expect(validRes.status).toBe(200);
    });

    it("binds WebSocket token sessionId to target room and rejects mismatched token", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const ctx = createMockDurableObjectState();
      const room = new LiveQuizRoom(ctx as any, {
        LIVE_HMAC_SECRET: secret,
        NEXT_APP_URL: "https://realtime.zyx.test",
        LIVE_QUIZ_ROOM: {} as any,
      });

      // Token for session Room-A
      const tokenRoomA = createMockToken(
        {
          userId: "usr-student-rt",
          name: "Student RT",
          sessionId: "sess-room-A",
          exp: Date.now() + 60_000,
        },
        secret,
      );

      // Attempt to connect to Room-B with token for Room-A -> 403
      const connectReq = new Request(
        `https://realtime.zyx.test/room/sess-room-B/websocket?token=${encodeURIComponent(tokenRoomA)}`,
        { headers: { Upgrade: "websocket" } },
      );
      const connectRes = await room.fetch(connectReq);
      expect(connectRes.status).toBe(403);
    });

    it("treats non-2xx callback responses as failures and retries with bounded backoff", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const ctx = createMockDurableObjectState();
      const room = new LiveQuizRoom(ctx as any, {
        LIVE_HMAC_SECRET: secret,
        NEXT_APP_URL: "https://realtime.zyx.test",
        LIVE_QUIZ_ROOM: {} as any,
      });

      // Initialize room
      const initReq = new Request("https://realtime.zyx.test/room/sess-rt-retry/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          sessionId: "sess-rt-retry",
          courseId: "crs-rt",
          questions: [{ prompt: "Q1", options: ["A", "B"], correctIndex: 0 }],
        }),
      });
      await room.fetch(initReq);

      let fetchCount = 0;
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        if (urlStr.includes("/api/live/callback")) {
          fetchCount++;
          if (fetchCount < 3) {
            return new Response(JSON.stringify({ error: "Internal Server Error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const leaderboard = [{ userId: "usr-rt-1", name: "Student 1", score: 1000, rank: 1 }];
      const result = await room.sendCallback(leaderboard);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(fetchCount).toBe(3);
    });

    it("reports failure and enforces bounded retries when callback returns persistent non-2xx", async () => {
      const secret = (env as any).LIVE_HMAC_SECRET;
      const ctx = createMockDurableObjectState();
      const room = new LiveQuizRoom(ctx as any, {
        LIVE_HMAC_SECRET: secret,
        NEXT_APP_URL: "https://realtime.zyx.test",
        LIVE_QUIZ_ROOM: {} as any,
      });

      const initReq = new Request("https://realtime.zyx.test/room/sess-rt-fail/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          sessionId: "sess-rt-fail",
          courseId: "crs-rt",
          questions: [],
        }),
      });
      await room.fetch(initReq);

      let fetchCount = 0;
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        if (urlStr.includes("/api/live/callback")) {
          fetchCount++;
          return new Response(JSON.stringify({ error: "Service Unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const leaderboard = [{ userId: "usr-rt-1", name: "Student 1", score: 1000, rank: 1 }];
      const result = await room.sendCallback(leaderboard);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(fetchCount).toBe(3);
      expect(result.error).toContain("HTTP 503");
    });
  });
});
