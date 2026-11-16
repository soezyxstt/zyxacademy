import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let row: Row | null;
let messageDeleted: Date | null;
let channelAllowed: boolean;
let messageAllowed: boolean;
let downloads: number;
let downloadedKeys: string[];
let downloadedBytes: Uint8Array;
let actorTransaction: unknown;
let attachments: Row[];
const attachmentTable = new Proxy({}, { get: (_, key) => key });
const messageTable = new Proxy({}, { get: (_, key) => key });
const threadTable = new Proxy({}, { get: (_, key) => key });
const predicate = (field: string | symbol, expected: unknown) => (item: Row) => item[field as string] === expected;

mock.module("drizzle-orm", () => ({
  eq: predicate,
  and: (...conditions: Array<(item: Row) => boolean>) => (item: Row) => conditions.every((condition) => condition(item)),
  inArray: (field: string, values: unknown[]) => (item: Row) => values.includes(item[field]),
  isNull: (field: string) => (item: Row) => item[field] === null,
  gt: (field: string, value: Date) => (item: Row) => item[field] > value,
  lte: (field: string, value: Date) => (item: Row) => item[field] <= value,
  asc: (field: unknown) => field,
  sql: () => new Date(),
}));
mock.module("@/db/schema", () => ({ discussionAttachments: attachmentTable, discussionMessages: messageTable, discussionThreads: threadTable, gamificationSocialRateLimits: attachmentTable }));
mock.module("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => row ? [row] : [] }) }) }) } }));
mock.module("@/lib/storage", () => ({
  STORAGE_PROVIDER_MODE: "neon",
  storage: { download: async (key: string) => { downloads++; downloadedKeys.push(key); return downloadedBytes; } },
}));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionActor: async (id: string, tx?: unknown) => { actorTransaction = tx; return { id, role: "student" }; },
  requireDiscussionChannelAccess: async () => { if (!channelAllowed) throw new Error("denied"); return { id: "channel" }; },
  requireDiscussionMessageAccess: async () => {
    if (!messageAllowed) throw new Error("denied");
    return { channel: { id: "channel" }, message: { deletedAt: messageDeleted } };
  },
}));

const { attachDiscussionImages, readDiscussionImage } = await import("@/lib/discussions/images");

function fakeTransaction() {
  return {
    select: () => {
      let table: unknown;
      let filter: (item: Row) => boolean = () => true;
      const result = () => table === messageTable ? [{ id: "message", authorId: "owner", deletedAt: messageDeleted, channelId: "channel" }] : attachments.filter(filter);
      const query = {
        from(value: unknown) { table = value; return this; },
        innerJoin() { return this; },
        where(value: (item: Row) => boolean) { filter = value; return this; },
        for: async () => result(),
        then(resolve: (value: Row[]) => void) { resolve(result()); },
      };
      return query;
    },
    update: () => ({ set: (values: Row) => ({ where: (filter: (item: Row) => boolean) => ({ returning: async () => {
      const matched = attachments.filter(filter);
      for (const item of matched) Object.assign(item, values);
      return matched.map((item) => ({ id: item.id }));
    } }) }) }),
  } as any;
}

beforeEach(() => {
  row = { id: "image", channelId: "channel", uploaderId: "owner", messageId: null, status: "ready", expiresAt: new Date(Date.now() + 60_000), name: "a.png", mime: "image/png", size: 3, width: 1, height: 1, storageKey: "discussions/channel/images/x.png" };
  attachments = [{ ...row }];
  messageDeleted = null;
  channelAllowed = true;
  messageAllowed = true;
  downloads = 0;
  downloadedKeys = [];
  downloadedBytes = new Uint8Array([1, 2, 3]);
  actorTransaction = undefined;
});

describe("discussion image authorization", () => {
  test("ready images require both uploader and current channel access", async () => {
    expect(await readDiscussionImage("other", "image")).toBeNull();
    channelAllowed = false;
    await expect(readDiscussionImage("owner", "image")).rejects.toThrow();
    expect(downloads).toBe(0);
    channelAllowed = true;
    const result = await readDiscussionImage("owner", "image");
    expect(result?.image.url).toBe("/api/discussions/attachments/image");
    expect(result?.image).not.toHaveProperty("storageKey");
    expect(downloads).toBe(1);
  });

  test("attached images require current message access and do not expose deleted messages", async () => {
    row!.status = "attached";
    row!.messageId = "message";
    messageAllowed = false;
    await expect(readDiscussionImage("viewer", "image")).rejects.toThrow();
    messageAllowed = true;
    messageDeleted = new Date();
    expect(await readDiscussionImage("viewer", "image")).toBeNull();
    row!.channelId = "another-channel";
    messageDeleted = null;
    expect(await readDiscussionImage("viewer", "image")).toBeNull();
    expect(downloads).toBe(0);
    row!.channelId = "channel";
    expect(await readDiscussionImage("viewer", "image")).not.toBeNull();
  });

  test("preview and original both recheck access and read only their own bounded object", async () => {
    row!.previewStorageKey = "discussions/channel/previews/x.webp";
    row!.previewSize = 3;
    expect(await readDiscussionImage("other", "image", true)).toBeNull();
    channelAllowed = false;
    await expect(readDiscussionImage("owner", "image", true)).rejects.toThrow();
    expect(downloads).toBe(0);
    channelAllowed = true;
    const result = await readDiscussionImage("owner", "image", true);
    expect(result?.image.previewAvailable).toBe(true);
    expect(result?.image).not.toHaveProperty("previewStorageKey");
    expect(downloadedKeys).toEqual([row!.previewStorageKey]);
    row!.status = "attached";
    row!.messageId = "message";
    messageAllowed = false;
    await expect(readDiscussionImage("viewer", "image", true)).rejects.toThrow();
    await expect(readDiscussionImage("viewer", "image")).rejects.toThrow();
    expect(downloads).toBe(1);
    messageAllowed = true;
    messageDeleted = new Date();
    expect(await readDiscussionImage("viewer", "image", true)).toBeNull();
    messageDeleted = null;
    row!.channelId = "another-channel";
    expect(await readDiscussionImage("viewer", "image", true)).toBeNull();
    row!.channelId = "channel";
    expect(await readDiscussionImage("viewer", "image")).not.toBeNull();
    expect(downloadedKeys.at(-1)).toBe(row!.storageKey);
    row!.previewSize = 128 * 1024 + 1;
    expect(await readDiscussionImage("viewer", "image", true)).toBeNull();
    expect(downloads).toBe(2);
    row!.previewSize = 3;
    downloadedBytes = new Uint8Array([1, 2]);
    expect(await readDiscussionImage("viewer", "image", true)).toBeNull();
  });

  test("legacy rows without previews never fetch the original for a thumbnail", async () => {
    expect(await readDiscussionImage("owner", "image", true)).toBeNull();
    expect(downloads).toBe(0);
    expect((await readDiscussionImage("owner", "image"))?.image.previewAvailable).toBe(false);
    expect(downloadedKeys).toEqual([row!.storageKey]);
  });

  test("claim rejects duplicate, foreign, expired and already-claimed attachments", async () => {
    const input = { actorId: "owner", channelId: "channel", messageId: "message", attachmentIds: ["image"] };
    await expect(attachDiscussionImages(fakeTransaction(), { ...input, attachmentIds: ["image", "image"] })).rejects.toThrow();
    attachments[0].uploaderId = "other";
    await expect(attachDiscussionImages(fakeTransaction(), input)).rejects.toThrow();
    attachments[0].uploaderId = "owner";
    attachments[0].expiresAt = new Date(0);
    await expect(attachDiscussionImages(fakeTransaction(), input)).rejects.toThrow();
    attachments[0].expiresAt = new Date(Date.now() + 60_000);
    const tx = fakeTransaction();
    await attachDiscussionImages(tx, input);
    expect(actorTransaction).toBe(tx);
    expect(attachments[0].status).toBe("attached");
    await expect(attachDiscussionImages(fakeTransaction(), input)).rejects.toThrow();
  });

  test("generic proxy denies private keys before fetching or resolving public paths", () => {
    const route = readFileSync("app/api/storage/file/[...key]/route.ts", "utf8");
    expect(route.indexOf("if (isPrivateAttachmentKey(requestedKey) || isPrivateAttachmentKey(key))")).toBeGreaterThan(-1);
    expect(route.indexOf("if (isPrivateAttachmentKey(requestedKey) || isPrivateAttachmentKey(key))")).toBeLessThan(route.indexOf("const command = new GetObjectCommand"));
    expect(route.indexOf("if (isPrivateAttachmentKey(requestedKey) || isPrivateAttachmentKey(key))")).toBeLessThan(route.indexOf("const diktatAuthorization = await resolveDiktatAuthorization(key)"));
  });
});
