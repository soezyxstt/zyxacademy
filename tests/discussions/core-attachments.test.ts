import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDiscussionTestDb } from "./local-postgres";

const { client, testDb: db } = await createDiscussionTestDb();
const objects = new Map<string, Uint8Array>();
const deletedKeys: string[] = [];
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "discussion-test-secret" }));
mock.module("@/lib/storage", () => ({ storage: {
 download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes; },
 delete: async (key: string) => { deletedKeys.push(key); objects.delete(key); },
}, STORAGE_PROVIDER_MODE: "neon" }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
const images = await import("@/lib/discussions/images");
const service = await import("@/lib/discussions/service");
afterAll(() => client.close());

beforeAll(async () => {
 await db.insert(schema.peran).values({ id: "student-role", code: "murid" });
 await db.insert(schema.user).values({ id: "alice", name: "Alice", email: "alice@example.test", role: "student" });
 await db.insert(schema.pengguna).values({ id: "alice" });
 await db.insert(schema.penggunaPeran).values({ id: "alice-role", penggunaId: "alice", peranId: "student-role", source: "test" });
 await db.insert(schema.courses).values([
  { id: "legacy-a", title: "A", category: "Matematika" }, { id: "legacy-b", title: "B", category: "Fisika" },
 ]);
 await db.insert(schema.mataKuliah).values([
  { id: "course-a", code: "A", title: "A", legacyCourseId: "legacy-a" },
  { id: "course-b", code: "B", title: "B", legacyCourseId: "legacy-b" },
 ]);
 await db.insert(schema.enrollments).values({ id: "alice-enrollment", userId: "alice", courseId: "legacy-a", expiresAt: new Date("2099-01-01") });
 await db.insert(schema.discussionChannels).values([
  { id: "channel-a", kind: "course", title: "A", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "channel-b", kind: "course", title: "B", courseId: "course-b", legacyCourseId: "legacy-b" },
 ]);
 await db.insert(schema.discussionThreads).values([
  { id: "thread-a", channelId: "channel-a", authorId: "alice", title: "A", nextSeq: 62, answerCount: 30 },
  { id: "thread-b", channelId: "channel-b", authorId: "alice", title: "B", nextSeq: 2, answerCount: 1 },
 ]);
 const messages = Array.from({ length: 30 }, (_, i) => ({ id: `message-${i}`, threadId: "thread-a", authorId: "alice", kind: "human" as const,
  messageType: "answer" as const, body: `Body ${i}`, seq: i + 1, requestId: `request-${i}` }));
 await db.insert(schema.discussionMessages).values([...messages, { id: "secret", threadId: "thread-b", authorId: "alice", kind: "human", messageType: "answer", body: "Secret", seq: 1, requestId: "secret-request" }]);
 await db.insert(schema.discussionMessages).values(Array.from({ length: 30 }, (_, i) => ({ id: `forward-${i}`, threadId: "thread-a", authorId: "alice",
  kind: "human" as const, messageType: "forward" as const, body: "", seq: i + 31, requestId: `forward-request-${i}`, forwardedFromId: "message-0" })));
 await db.insert(schema.discussionAttachments).values([...messages.map((message, index) => ({ id: `image-${index}`, messageId: message.id, channelId: "channel-a",
  uploaderId: "alice", status: "attached" as const, storageKey: `object-${index}`, name: `${index}.png`, mime: "image/png", size: 10, width: 1, height: 1, expiresAt: new Date("2099-01-01") })),
  { id: "secret-image", messageId: "secret", channelId: "channel-b", uploaderId: "alice", status: "attached", storageKey: "secret-object", name: "secret.png", mime: "image/png", size: 10, width: 1, height: 1, expiresAt: new Date("2099-01-01") }]);
});

test("attachment metadata is batched and excludes inaccessible or revoked messages", async () => {
 const ids = Array.from({ length: 30 }, (_, index) => `message-${index}`);
 const originalQuery = client.query;
 let queries = 0;
 client.query = function (this: unknown, ...args: Parameters<typeof client.query>) { queries++; return originalQuery.apply(this, args); } as typeof client.query;
 try {
  const result = await images.listDiscussionAttachmentsForMessages("alice", [...ids, "secret"]);
  expect(result.size).toBe(30);
  expect(result.has("secret")).toBe(false);
  expect(result.get("message-0")?.[0]).toMatchObject({ id: "image-0", mime: "image/png" });
  expect(result.get("message-0")?.[0]).not.toHaveProperty("storageKey");
  expect(queries).toBeGreaterThan(0);
  expect(queries).toBeLessThan(30);
 } finally { client.query = originalQuery; }
 await db.update(schema.enrollments).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.enrollments.id, "alice-enrollment"));
 expect((await images.listDiscussionAttachmentsForMessages("alice", ids)).size).toBe(0);
 await db.update(schema.enrollments).set({ expiresAt: new Date("2099-01-01") }).where(eq(schema.enrollments.id, "alice-enrollment"));
});

test("repeated forwards reuse authorized source and attachment reads", async () => {
 const first = await service.getThread("alice", "thread-a");
 expect(first.messages.nextCursor).toBeTruthy();
 const originalQuery = client.query;
 let queries = 0;
 client.query = function (this: unknown, ...args: Parameters<typeof client.query>) { queries++; return originalQuery.apply(this, args); } as typeof client.query;
 try {
  const page = await service.getThread("alice", "thread-a", first.messages.nextCursor!);
  expect(page.messages.items).toHaveLength(30);
  expect(page.messages.items.every(item => item.forwardedFrom?.id === "message-0" && item.attachments[0]?.id === "image-0")).toBe(true);
  expect(queries).toBeGreaterThan(0);
  expect(queries).toBeLessThan(70);
 } finally { client.query = originalQuery; }
});

test("thread reopen skips observedSeq write transaction and returns readThroughSeq and scoped aiStatuses", async () => {
 await db.insert(schema.user).values({ id: "bob", name: "Bob", email: "bob@example.test", role: "student" }).onConflictDoNothing();
 await db.update(schema.discussionMessages).set({ askZyra: true }).where(eq(schema.discussionMessages.id, "message-0"));
 await db.insert(schema.discussionAiRequests).values([
  { id: "req-alice", messageId: "message-0", requestedById: "alice", kind: "zyra", status: "failed", errorCode: "DISCUSSION_AI_QUOTA", requestId: "req-alice" },
  { id: "req-bob", messageId: "message-1", requestedById: "bob", kind: "zyra", status: "pending", requestId: "req-bob" },
 ]).onConflictDoNothing();
 await db.update(schema.discussionMessages).set({ askZyra: true }).where(eq(schema.discussionMessages.id, "message-1"));
 await db.insert(schema.discussionThreadReads).values({ userId: "alice", threadId: "thread-a", throughSeq: 12, observedSeq: 30 })
  .onConflictDoUpdate({ target: [schema.discussionThreadReads.userId, schema.discussionThreadReads.threadId], set: { throughSeq: 12, observedSeq: 30 } });
 const sqlLog: string[] = [];
 const originalQuery = client.query;
 client.query = function (this: unknown, ...args: Parameters<typeof client.query>) {
  const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text ?? "";
  sqlLog.push(text);
  return originalQuery.apply(this, args);
 } as typeof client.query;
 try {
  const reopened = await service.getThread("alice", "thread-a");
  expect(reopened.readThroughSeq).toBe(12);
  expect(reopened.aiStatuses).toEqual([{ messageId: "message-0", status: "failed", reason: "ai_quota" }]);
  expect(sqlLog.some(query => /\bbegin\b/i.test(query))).toBe(false);
  expect(sqlLog.some(query => /insert into "discussion_thread_reads"/i.test(query))).toBe(false);
  expect(sqlLog.length).toBeLessThan(20);
 } finally { client.query = originalQuery; }
});

test("preview reads use current course access and enforce database metadata bounds", async () => {
 const previewKey = "discussions/channel-a/previews/image-0.webp";
 const preview = new Uint8Array([1, 2, 3]);
 objects.set(previewKey, preview);
 await db.update(schema.discussionAttachments).set({ previewStorageKey: previewKey, previewSize: preview.byteLength }).where(eq(schema.discussionAttachments.id, "image-0"));
 const result = await images.readDiscussionImage("alice", "image-0", true);
 expect(result?.bytes).toEqual(preview);
 expect(result?.image.previewAvailable).toBe(true);
 expect(result?.image).not.toHaveProperty("previewStorageKey");
 await expect(db.update(schema.discussionAttachments).set({ previewSize: 131073 }).where(eq(schema.discussionAttachments.id, "image-0")).execute()).rejects.toThrow();
 await db.update(schema.enrollments).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.enrollments.id, "alice-enrollment"));
 try { await expect(images.readDiscussionImage("alice", "image-0", true)).rejects.toThrow(); }
 finally { await db.update(schema.enrollments).set({ expiresAt: new Date("2099-01-01") }).where(eq(schema.enrollments.id, "alice-enrollment")); }
});

test("attached images survive expiry while expired ready images cannot be attached", async () => {
 const fullKey = "discussions/channel-a/images/claim.png", previewKey = "discussions/channel-a/previews/claim.webp";
 objects.set(fullKey, new Uint8Array([1])); objects.set(previewKey, new Uint8Array([2]));
 await db.insert(schema.discussionAttachments).values({ id: "claim", channelId: "channel-a", uploaderId: "alice", status: "ready", storageKey: fullKey,
  previewStorageKey: previewKey, previewSize: 1, name: "claim.png", mime: "image/png", size: 1, width: 1, height: 1, expiresAt: new Date("2099-01-01") });
 await db.transaction(tx => images.attachDiscussionImages(tx as unknown as Parameters<typeof images.attachDiscussionImages>[0], { actorId: "alice", channelId: "channel-a", messageId: "message-0", attachmentIds: ["claim"] }));
 await db.update(schema.discussionAttachments).set({ expiresAt: new Date(0) }).where(eq(schema.discussionAttachments.id, "claim"));
 await images.sweepDiscussionImages();
 expect(objects.has(fullKey)).toBe(true);
 expect(objects.has(previewKey)).toBe(true);
 expect(deletedKeys).not.toContain(fullKey);
 await db.insert(schema.discussionAttachments).values({ id: "expired", channelId: "channel-a", uploaderId: "alice", status: "ready", storageKey: "expired-full",
  previewStorageKey: "expired-preview", previewSize: 1, name: "expired.png", mime: "image/png", size: 1, width: 1, height: 1, expiresAt: new Date(0) });
 await images.sweepDiscussionImages();
 expect(deletedKeys).toEqual(expect.arrayContaining(["expired-full", "expired-preview"]));
 await expect(db.transaction(tx => images.attachDiscussionImages(tx as unknown as Parameters<typeof images.attachDiscussionImages>[0], { actorId: "alice", channelId: "channel-a", messageId: "message-0", attachmentIds: ["expired"] }))).rejects.toThrow();
});
