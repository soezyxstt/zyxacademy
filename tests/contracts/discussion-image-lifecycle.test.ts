import { beforeEach, describe, expect, mock, test } from "bun:test";
import sharp from "sharp";
import * as imagePolicy from "@/lib/discussions/image-policy";

type Row = Record<string, any>;
let rows: Row[] = [];
let uploadFails = false;
let previewUploadFails = false;
let previewGenerationFails = false;
let deleteFails = false;
let previewDeleteFails = false;
let originalDeleteFails = false;
let readyUpdateFails = false;
let deleteCalls = 0;
let deletedKeys: string[] = [];
let objects = new Map<string, Uint8Array>();
let rateAttempts = 0;
const table = new Proxy({}, { get: (_, key) => key });
const eq = (field: string, value: unknown) => (row: Row) => row[field] === value;
const and = (...conditions: Array<(row: Row) => boolean>) => (row: Row) => conditions.every((condition) => condition(row));
const realImagePolicy = { ...imagePolicy };
mock.module("@/lib/discussions/image-policy", () => ({ ...realImagePolicy, makeDiscussionImagePreview: async (input: Uint8Array) => {
  if (previewGenerationFails) throw new Error("preview generation failed");
  return realImagePolicy.makeDiscussionImagePreview(input);
} }));

mock.module("drizzle-orm", () => ({
  eq, and,
  or: (...conditions: Array<(row: Row) => boolean>) => (row: Row) => conditions.some(condition => condition(row)),
  inArray: (field: string, values: unknown[]) => (row: Row) => values.includes(row[field]),
  isNull: (field: string) => (row: Row) => row[field] === null,
  gt: (field: string, value: Date) => (row: Row) => row[field] > value,
  lte: (field: string, value: Date) => (row: Row) => row[field] <= value,
  asc: (field: unknown) => field,
  sql: (strings: TemplateStringsArray) => strings.join("").includes("on conflict (user_id") ? "rate" : strings[0].includes("count(*)") ? "count" : new Date(),
}));
mock.module("@/db/schema", () => ({ discussionAttachments: table, discussionMessages: table, discussionThreads: table, gamificationSocialRateLimits: table }));

function select(selection: Row = {}) {
  let filter: (row: Row) => boolean = () => true;
  let maximum = Infinity;
  const result = () => {
    const found = rows.filter(filter).slice(0, maximum);
    return selection.value === "count" ? [{ value: found.length }] : found.map((row) => ({ ...row }));
  };
  return {
    from() { return this; },
    where(value: (row: Row) => boolean) { filter = value; return this; },
    orderBy() { return this; },
    limit(value: number) { maximum = value; return this; },
    for: async () => result(),
    then(resolve: (value: Row[]) => void) { resolve(result()); },
  };
}

function update() {
  return { set: (values: Row) => ({ where: (filter: (row: Row) => boolean) => {
    const apply = () => {
      if (values.status === "ready" && readyUpdateFails) throw new Error("ready update failed");
      const matched = rows.filter(filter);
      for (const row of matched) Object.assign(row, values);
      return matched.map((row) => ({ ...row }));
    };
    return { returning: async () => apply(), then(resolve: (value: Row[]) => void) { resolve(apply()); } };
  } }) };
}

const db = {
  select,
  update,
  insert: () => ({ values: async (row: Row) => { rows.push({ ...row }); } }),
  delete: () => ({ where: async (filter: (row: Row) => boolean) => { rows = rows.filter((row) => !filter(row)); } }),
  execute: async (query: unknown) => query === "rate" ? { rows: [{ attempts: ++rateAttempts }] } : { rows: [] },
  transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
};
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionActor: async (id: string) => ({ id, role: "student" }),
  requireDiscussionChannelAccess: async () => ({ id: "channel" }),
  requireDiscussionMessageAccess: async () => ({ channel: { id: "channel" }, message: { deletedAt: null } }),
}));
mock.module("@/lib/storage", () => ({
  STORAGE_PROVIDER_MODE: "neon",
  storage: {
    upload: async (bytes: Uint8Array, _name: string, mime: string, options: { key: string }) => {
      expect(rows[0]?.status).toBe("pending");
      expect(rows[0]?.previewStorageKey).toContain("/previews/");
      objects.set(options.key, bytes);
      if (options.key === rows[0].previewStorageKey) {
        expect(mime).toBe("image/webp");
        if (previewUploadFails) throw new Error("preview upload failed");
      } else if (uploadFails) throw new Error("upload failed");
    },
    delete: async (key: string) => { deleteCalls++; deletedKeys.push(key); if (deleteFails || (previewDeleteFails && key.includes("/previews/")) || (originalDeleteFails && key.includes("/images/"))) throw new Error("delete failed"); objects.delete(key); },
  },
}));

const { uploadDiscussionImage, sweepDiscussionImages } = await import("@/lib/discussions/images");

beforeEach(() => { rows = []; uploadFails = false; previewUploadFails = false; previewGenerationFails = false; deleteFails = false; previewDeleteFails = false; originalDeleteFails = false; readyUpdateFails = false; deleteCalls = 0; deletedKeys = []; objects = new Map(); rateAttempts = 0; });

describe("discussion image lifecycle", () => {
  test("records a pending row before storage and only then marks it ready", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const result = await uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) });
    expect(rows[0].status).toBe("ready");
    expect(result.id).toBe(rows[0].id);
    expect(result).not.toHaveProperty("storageKey");
    expect(result).not.toHaveProperty("previewStorageKey");
    expect(result.previewAvailable).toBe(true);
    expect(objects.size).toBe(2);
    expect(rows[0].previewSize).toBe(objects.get(rows[0].previewStorageKey)?.byteLength);
    expect(rows[0].previewSize).toBeLessThanOrEqual(128 * 1024);
    const metadata = await sharp(objects.get(rows[0].previewStorageKey)!).metadata();
    expect(metadata.format).toBe("webp");
    expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(480);
  });

  test("invalid bytes reserve a bounded pending slot and never reach storage upload", async () => {
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File(["bad"], "a.png", { type: "image/png" }) })).rejects.toThrow();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(deleteCalls).toBe(2);
  });

  test("preview generation failure cannot leave a ready row or storage objects", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    previewGenerationFails = true;
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) })).rejects.toThrow("preview generation failed");
    expect(rows[0].status).toBe("failed");
    expect(objects.size).toBe(0);
    expect(deletedKeys).toEqual(expect.arrayContaining([rows[0].storageKey, rows[0].previewStorageKey]));
  });

  test("failure publishing ready metadata compensates both completed uploads", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    readyUpdateFails = true;
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) })).rejects.toThrow("ready update failed");
    expect(rows[0].status).toBe("failed");
    expect(objects.size).toBe(0);
    expect(deletedKeys).toEqual(expect.arrayContaining([rows[0].storageKey, rows[0].previewStorageKey]));
  });

  test("rate limits repeated upload attempts before reserving or decoding", async () => {
    rateAttempts = 24;
    const file = new File(["bad"], "a.png", { type: "image/png" });
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file })).rejects.toThrow("DISCUSSION_IMAGE_RATE_LIMIT");
    expect(rows).toHaveLength(0);
    expect(deleteCalls).toBe(0);
  });

  test("failed deletion remains discoverable, is retried, and is checked twice", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    uploadFails = true;
    deleteFails = true;
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) })).rejects.toThrow();
    expect(rows[0].status).toBe("deleting");
    rows[0].expiresAt = new Date(0);
    deleteFails = false;
    expect(await sweepDiscussionImages({ limit: 1 })).toEqual({ inspected: 1, deleted: 1, failed: 0 });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    rows[0].expiresAt = new Date(0);
    expect(await sweepDiscussionImages({ limit: 1 })).toEqual({ inspected: 1, deleted: 1, failed: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("expired");
    expect(deleteCalls).toBe(6);
    rows[0].expiresAt = new Date(0);
    expect(await sweepDiscussionImages({ limit: 1 })).toEqual({ inspected: 0, deleted: 0, failed: 0 });
  });

  test("an uncertain preview upload deletes both objects or retries both after a partial cleanup failure", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    previewUploadFails = true;
    previewDeleteFails = true;
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) })).rejects.toThrow("preview upload failed");
    expect(rows[0].status).toBe("deleting");
    expect(objects.size).toBe(1);
    expect(objects.has(rows[0].previewStorageKey)).toBe(true);
    expect(deletedKeys).toEqual(expect.arrayContaining([rows[0].storageKey, rows[0].previewStorageKey]));
    rows[0].expiresAt = new Date(0);
    previewDeleteFails = false;
    expect(await sweepDiscussionImages({ limit: 1 })).toEqual({ inspected: 1, deleted: 1, failed: 0 });
    expect(objects.size).toBe(0);
    expect(rows[0].status).toBe("failed");
  });

  test("a failed original deletion does not prevent preview deletion", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    previewUploadFails = true;
    originalDeleteFails = true;
    await expect(uploadDiscussionImage({ actorId: "owner", channelId: "channel", file: new File([png], "a.png", { type: "image/png" }) })).rejects.toThrow();
    expect(rows[0].status).toBe("deleting");
    expect(objects.has(rows[0].storageKey)).toBe(true);
    expect(objects.has(rows[0].previewStorageKey)).toBe(false);
    rows[0].expiresAt = new Date(0);
    originalDeleteFails = false;
    expect(await sweepDiscussionImages({ limit: 1 })).toEqual({ inspected: 1, deleted: 1, failed: 0 });
    expect(objects.size).toBe(0);
  });

  test("sweep obeys its bound and leaves other expired rows for later", async () => {
    rows = ["one", "two", "three"].map((id) => ({ id, status: "ready", storageKey: id, expiresAt: new Date(0) }));
    expect(await sweepDiscussionImages({ limit: 2 })).toEqual({ inspected: 2, deleted: 2, failed: 0 });
    expect(rows.filter((row) => row.status === "ready")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "failed")).toHaveLength(2);
  });
});
