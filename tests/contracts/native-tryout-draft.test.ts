import { afterAll, beforeAll, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
const delegate = new Proxy({} as typeof fixture.testDb, {
  get(_target, key) {
    const value = Reflect.get(fixture.testDb, key);
    return typeof value === "function" ? value.bind(fixture.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: delegate }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));

import { handleAdminTryoutDraftCommand } from "@/lib/native/academic/assessment/tryout-draft-command";
import { saveTryoutDraftFromNative } from "@/lib/native/academic/assessment/tryout-draft-service";
import { tryoutMetadataRevision } from "@/lib/tutor/tryout-authoring";

const admin = { user: { id: "draft-admin" }, session: { id: "draft-admin-session" } };
const tutor = { user: { id: "draft-tutor" }, session: { id: "draft-tutor-session" } };
const origin = "http://localhost:3000";
const base = {
  courseId: "mk-bio", title: "Draf tryout biologi", timeLimitMinutes: 90, maxAttempts: 2,
  openAt: "2026-11-28T09:00:00.000+07:00", closeAt: "2026-11-29T09:00:00.000+07:00", expectedRevision: null,
};
const activeUntil = () => new Date(Date.now() + 600_000);

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  const db = fixture.testDb;
  const now = new Date();
  await db.insert(schema.user).values([
    { id: admin.user.id, role: "admin", email: "tryout-admin@example.test", name: "Admin", createdAt: now, updatedAt: now },
    { id: tutor.user.id, role: "teacher", email: "tryout-tutor@example.test", name: "Tutor", createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.pengguna).values([{ id: admin.user.id, status: "active" }, { id: tutor.user.id, status: "active" }]);
  await db.insert(schema.peran).values([{ id: "p-tryout-admin", code: "admin" }, { id: "p-tryout-tutor", code: "tutor" }]).onConflictDoNothing();
  const roles = await db.select().from(schema.peran);
  await db.insert(schema.penggunaPeran).values([
    { id: "draft-admin-role", penggunaId: admin.user.id, peranId: roles.find((role) => role.code === "admin")!.id, source: "seed" },
    { id: "draft-tutor-role", penggunaId: tutor.user.id, peranId: roles.find((role) => role.code === "tutor")!.id, source: "seed" },
  ]);
  await db.insert(schema.session).values([admin, tutor].map((viewer) => ({
    id: viewer.session.id, token: viewer.session.id, expiresAt: activeUntil(), userId: viewer.user.id,
  })));
  await db.insert(schema.courses).values([
    { id: "bio", title: "Biologi", category: "Biologi" },
    { id: "fisika", title: "Fisika", category: "Fisika" },
  ]);
  await db.insert(schema.mataKuliah).values([
    { id: "mk-bio", code: "BI-01", title: "Biologi", legacyCourseId: "bio", status: "active" },
    { id: "mk-fisika", code: "FI-01", title: "Fisika", legacyCourseId: "fisika", status: "active" },
  ]);
}, 60_000);
afterAll(async () => { await fixture?.client.close(); });

function command(method: "POST" | "PATCH", key: string, body: unknown, options: {
  slug?: string; examId?: string; viewer?: typeof admin | null; admitAdmin?: boolean; requestOrigin?: string;
} = {}) {
  const parts = ["admin", options.slug ?? "bio", "tryouts", ...(options.examId ? [options.examId] : [])];
  const request = new Request(`${origin}/api/native/academic-assessment/${parts.join("/")}`, {
    method, body: JSON.stringify(body), headers: {
      "content-type": "application/json", origin: options.requestOrigin ?? origin, "idempotency-key": key,
    },
  });
  return handleAdminTryoutDraftCommand(request, parts, origin, {
    session: async () => options.viewer === undefined ? admin : options.viewer,
    hasAdmin: async (id) => options.admitAdmin ?? (id === admin.user.id),
    save: saveTryoutDraftFromNative,
  });
}

it("creates only draft tryouts and replays the same request across a compatible course alias", async () => {
  const key = "admin-native-create-tryout";
  expect((await command("POST", key, base, { requestOrigin: "https://other.test" })).status).toBe(403);
  expect((await command("POST", key, { ...base, status: "published" })).status).toBe(422);
  expect((await command("POST", key, { ...base, closeAt: base.openAt })).status).toBe(422);
  expect((await command("POST", key, { ...base, maxAttempts: 0 })).status).toBe(422);
  expect((await command("POST", key, base, { viewer: null })).status).toBe(401);
  expect((await command("POST", key, base, { viewer: tutor, admitAdmin: true })).status).toBe(403);
  expect((await command("POST", key, { ...base, courseId: "mk-fisika" })).status).toBe(409);

  const response = await command("POST", key, base);
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const receipt = await response.json();
  expect((await (await command("POST", key, base, { slug: "mk-bio" })).json())).toEqual(receipt);
  expect((await command("POST", key, { ...base, title: "Judul lain" })).status).toBe(409);
  const [exam] = await fixture.testDb.select().from(schema.exams).where(eq(schema.exams.id, receipt.examId));
  expect(exam).toMatchObject({ courseId: "bio", type: "tryout", status: "draft", title: base.title });
  expect(exam.openAt?.toISOString()).toBe("2026-11-28T02:00:00.000Z");
  expect(receipt).toMatchObject({ requestId: key, revision: tryoutMetadataRevision(exam) });
  const audits = await fixture.testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, exam.id));
  expect(audits).toHaveLength(1);
});

it("edits only the locked course draft and preserves settings through replay and conflicts", async () => {
  const db = fixture.testDb;
  const [prior] = await db.insert(schema.exams).values({
    id: "draft-edit", courseId: "bio", type: "tryout", title: "Draf lama", status: "draft",
    settings: { timeLimitMinutes: 90, maxAttempts: 2, randomization: { perAttempt: true } },
  }).returning();
  await db.insert(schema.exams).values([
    { id: "ended-tryout", courseId: "bio", type: "tryout", title: "Tryout selesai", status: "ended" },
    { id: "different-course", courseId: "fisika", type: "tryout", title: "Tryout lain", status: "draft" },
    { id: "old-quiz", courseId: "bio", type: "quiz", title: "Kuis", status: "draft" },
  ]);
  const key = "admin-native-update-tryout";
  const draft = { ...base, title: "Draf baru", expectedRevision: tryoutMetadataRevision(prior) };
  const edit = (requestId: string, data = draft, examId = prior.id) => command("PATCH", requestId, data, { examId });
  expect((await edit(key, draft, "different-course")).status).toBe(404);
  expect((await edit(key, draft, "old-quiz")).status).toBe(404);
  expect((await edit(key, draft, "ended-tryout")).status).toBe(409);
  expect((await command("PATCH", key, base, { examId: prior.id })).status).toBe(422);

  const updated = await edit(key);
  expect(updated.status).toBe(200);
  const receipt = await updated.json();
  expect(await (await edit(key)).json()).toEqual(receipt);
  expect((await edit(key, { ...draft, title: "Percobaan lain" })).status).toBe(409);
  expect((await edit("admin-native-stale-revision")).status).toBe(409);
  const [saved] = await db.select().from(schema.exams).where(eq(schema.exams.id, prior.id));
  expect(receipt).toMatchObject({ examId: prior.id, revision: tryoutMetadataRevision(saved) });
  expect(saved.title).toBe("Draf baru");
  expect(saved.status).toBe("draft");
  expect(saved.settings).toMatchObject({ randomization: { perAttempt: true } });

  await db.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id, admin.session.id));
  try {
    expect((await edit(key)).status).toBe(401);
  } finally {
    await db.update(schema.session).set({ expiresAt: activeUntil() }).where(eq(schema.session.id, admin.session.id));
  }
  const [membership] = await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.id, "draft-admin-role")).returning();
  try {
    expect((await edit(key)).status).toBe(403);
  } finally {
    await db.insert(schema.penggunaPeran).values(membership);
  }
});
