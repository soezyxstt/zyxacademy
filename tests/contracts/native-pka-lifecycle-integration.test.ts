import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { seedAdminMcpAuthority } from "../helpers/admin-mcp-authority";
import * as schema from "@/db/schema";
import { pkaScheduleRevision } from "@/lib/pka/schedule-update";
import { pkaAnnouncementState } from "@/lib/pka/lifecycle";
import type { NotificationPayload } from "@/lib/notifications/types";

const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: database }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
process.env.QUEUE_PROVIDER = "noop";
process.env.BETTER_AUTH_URL = "https://pka.example.test";
process.env.NEXT_PUBLIC_APP_URL = "https://pka.example.test";
const pushes: string[][] = [];
const emails: { userId: string; category: string }[] = [];
let interrupt = false;
mock.module("@/lib/notifications/send", () => ({
  sendToMany: async (ids: string[], _payload: NotificationPayload) => {
    pushes.push(ids);
    if (interrupt) throw new Error("Lost provider response");
    return { attempted: ids.length, succeeded: ids.length, failedTokens: [], errors: [] };
  },
}));
mock.module("@/lib/email-preferences/send", () => ({
  sendOptionalEmail: async ({ userId, category }: { userId: string; category: string }) => {
    emails.push({ userId, category });
    return userId === "pka-opted-out" ? { status: "suppressed" } : { status: "sent", emailId: "fixture" };
  },
}));
const { writeNativePkaLifecycle } = await import("@/lib/native/academic/administration/pka-lifecycle-service");
const { updateNativePkaSchedule } = await import("@/lib/native/academic/administration/pka-schedule-service");
const { collectNativePkaDelivery, processNativePkaDelivery, readPkaDeliveryStatuses } = await import("@/lib/pka/native-delivery-queue");

const admin = { user: { id: "pka-admin" }, session: { id: "pka-admin-session" } };
const replacement = { user: admin.user, session: { id: "pka-admin-replacement" } };
const enrolled = { user: { id: "pka-learner" }, session: { id: "pka-learner-session" } };
const retroactive = {
  action: "create-schedule", title: "Sesi PKA lampau", sessionAt: "2025-03-01T15:00:00+07:00", meetLink: null,
} as const;

beforeAll(async () => {
  for (const identity of [admin, enrolled]) {
    const id = identity.user.id;
    await database.insert(schema.user).values({ id, email: `${id}@example.test`, name: id });
  }
  for (const identity of [admin, replacement]) {
    await seedAdminMcpAuthority(database, {
      userId: identity.user.id, sessionId: identity.session.id, actorId: identity.user.id, scopes: [], authMethod: "session",
    });
  }
  await database.insert(schema.user).values({ id: "pka-opted-out", email: "pka-opted-out@example.test", name: "Opt out" });
  await database.insert(schema.courses).values({ id: "tutorial-pka", title: "PKA", category: "Matematika" });
  await database.insert(schema.enrollments).values([enrolled.user.id, "pka-opted-out"].map(userId => ({
    id: `enrollment-${userId}`, userId, courseId: "tutorial-pka", expiresAt: new Date("2099-01-01"),
  })));
  await database.insert(schema.pkaRegistrations).values({
    id: "pka-withdrawn", userId: "pka-opted-out", fullName: "Opt out", faculty: "Fixture",
    email: "pka-opted-out@example.test", instagramUsername: "fixture", proofKey: "synthetic", receiveAnnouncements: false,
  });
  await database.insert(schema.session).values({
    id: enrolled.session.id, userId: enrolled.user.id, token: "pka-learner-fixture", expiresAt: new Date("2099-01-01"),
  });
});
afterAll(() => client.close());

test("only past schedule creation writes a silent schedule, with durable receipts scoped to the creating session", async () => {
  await expect(writeNativePkaLifecycle(retroactive, crypto.randomUUID(), enrolled)).rejects.toThrow("FORBIDDEN");
  expect(await database.select().from(schema.pkaSchedules)).toHaveLength(0);
  const requestId = crypto.randomUUID();
  const [first, replay] = await Promise.all([
    writeNativePkaLifecycle(retroactive, requestId, admin),
    writeNativePkaLifecycle(retroactive, requestId, admin),
  ]);
  expect(first).toEqual(replay);
  await expect(writeNativePkaLifecycle({ ...retroactive, title: "Berubah" }, requestId, admin)).rejects.toThrow("REQUEST_CONFLICT");
  const replacementWrite = await writeNativePkaLifecycle(retroactive, requestId, replacement);
  expect(first.id).not.toBe(replacementWrite.id);
  const rows = await database.select().from(schema.pkaSchedules);
  expect(rows).toHaveLength(2);
  expect(await collectNativePkaDelivery()).toHaveLength(0);
  expect(rows.every(row => row.sessionAt.toISOString() === "2025-03-01T08:00:00.000Z" && row.sentAt === null)).toBe(true);
});

test("confirmation cannot delete a revised schedule and successful deletion retries find its original receipt", async () => {
  const created = await writeNativePkaLifecycle(retroactive, crypto.randomUUID(), admin);
  const [before] = await database.select().from(schema.pkaSchedules).where(eq(schema.pkaSchedules.id, created.id));
  const command = { action: "delete-schedule", id: before.id, expectedRevision: pkaScheduleRevision(before.id, before).revision } as const;
  const key = crypto.randomUUID();
  await database.update(schema.pkaSchedules).set({ title: "Ubah menjelang konfirmasi" }).where(eq(schema.pkaSchedules.id, before.id));
  const result = await writeNativePkaLifecycle(command, key, admin);
  expect(result.status).toBe("conflict");
  if (result.status !== "conflict") throw new Error("Missing conflict");
  const accepted = { ...command, expectedRevision: result.current.revision };
  expect(await writeNativePkaLifecycle(accepted, key, admin)).toEqual({ status: "saved", id: before.id });
  expect(await writeNativePkaLifecycle(accepted, key, admin)).toEqual({ status: "saved", id: before.id });
  expect(await database.select().from(schema.pkaSchedules).where(eq(schema.pkaSchedules.id, before.id))).toHaveLength(0);
});

test("archive and pin share the row revision and keep the existing announcement and readership", async () => {
  const id = "native-pka-lifecycle-announcement";
  const [before] = await database.insert(schema.pkaAnnouncements).values({
    id, createdBy: admin.user.id, title: "Pengumuman PKA", body: "Pembahasan", sentAt: new Date("2025-03-01"),
  }).returning();
  await database.insert(schema.pkaAnnouncementReads).values({ announcementId: id, userId: enrolled.user.id });
  const command = { action: "announcement-state", id, value: true, expectedRevision: pkaAnnouncementState(before).revision } as const;
  expect(await writeNativePkaLifecycle({ ...command, field: "pinned" }, crypto.randomUUID(), admin)).toEqual({ status: "saved", id });
  const archive = await writeNativePkaLifecycle({ ...command, field: "archived" }, crypto.randomUUID(), admin);
  expect(archive.status).toBe("conflict");
  if (archive.status !== "conflict") throw new Error("Missing conflict");
  await writeNativePkaLifecycle({ ...command, field: "archived", expectedRevision: archive.current.revision }, crypto.randomUUID(), admin);
  const [final] = await database.select().from(schema.pkaAnnouncements).where(eq(schema.pkaAnnouncements.id, id));
  expect(final).toMatchObject({ isPinned: true, isArchived: true, body: before.body, sentAt: before.sentAt });
  expect(await database.select().from(schema.pkaAnnouncementReads).where(eq(schema.pkaAnnouncementReads.announcementId, id))).toHaveLength(1);
});

test("a new PKA announcement claims one delivery and uses separate push and optional email consent paths", async () => {
  const command = { action: "send-announcement", title: "Undangan pembahasan", body: "Pembahasan hari ini." } as const;
  const key = crypto.randomUUID();
  const result = await writeNativePkaLifecycle(command, key, admin);
  expect(result).toEqual({ status: "saved", id: result.id, delivery: "queued" });
  expect(await writeNativePkaLifecycle(command, key, admin)).toEqual(result);
  expect((await readPkaDeliveryStatuses([result.id], "announcements")).get(result.id)).toBe("queued");
  const queued = await collectNativePkaDelivery();
  expect(queued).toHaveLength(1);
  const [job] = queued;
  const attempts = await Promise.all([processNativePkaDelivery(job.id), processNativePkaDelivery(job.id)]);
  expect(attempts.filter(attempt => attempt.claimed)).toHaveLength(1);
  expect(pushes).toEqual([[enrolled.user.id]]);
  expect(emails.map(email => email.userId).sort()).toEqual([enrolled.user.id, "pka-opted-out"].sort());
  expect(emails.every(email => email.category === "course_updates")).toBe(true);
  expect((await readPkaDeliveryStatuses([result.id], "announcements")).get(result.id)).toBe("succeeded");
});

test("revised schedules and revoked sessions fail closed before delivery", async () => {
  const command = { ...retroactive, sessionAt: "2099-01-01T08:00:00Z" };
  const future = await writeNativePkaLifecycle(command, crypto.randomUUID(), admin);
  const [original] = await database.select().from(schema.pkaSchedules).where(eq(schema.pkaSchedules.id, future.id));
  const update = await updateNativePkaSchedule(future.id, {
    title: original.title, sessionAt: original.sessionAt.toISOString(), meetLink: "https://meet.example/path",
    expectedRevision: pkaScheduleRevision(future.id, original).revision,
  }, crypto.randomUUID(), replacement);
  expect(update.delivery).toBe("queued");
  await database.delete(schema.session).where(eq(schema.session.id, replacement.session.id));
  const pending = await collectNativePkaDelivery();
  expect(pending).toHaveLength(2);
  for (const job of pending) expect((await processNativePkaDelivery(job.id)).claimed).toBe(false);
  expect(pushes).toHaveLength(1);
  expect((await readPkaDeliveryStatuses([future.id], "sessions")).get(future.id)).toBe("failed");
});

test("an ambiguous delivery remains unknown and never repeats automatically", async () => {
  const result = await writeNativePkaLifecycle({
    action: "send-announcement", title: "Pemberitahuan", body: "Info PKA.",
  }, crypto.randomUUID(), admin);
  const [job] = await collectNativePkaDelivery();
  interrupt = true;
  try { await processNativePkaDelivery(job.id); } finally { interrupt = false; }
  expect((await processNativePkaDelivery(job.id)).claimed).toBe(false);
  expect((await readPkaDeliveryStatuses([result.id], "announcements")).get(result.id)).toBe("unknown");
  expect(pushes).toHaveLength(2);
});
