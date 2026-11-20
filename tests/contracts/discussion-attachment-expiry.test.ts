import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

mock.module("@/db", () => ({ db: {} }));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionActor: async (id: string) => ({ id, role: "student" }),
  requireDiscussionMessageAccess: async () => ({}),
  requireDiscussionChannelAccess: async () => ({}),
}));
mock.module("@/lib/storage", () => ({ storage: {}, STORAGE_PROVIDER_MODE: "neon" }));
mock.module("@/lib/discussions/image-sweep", () => ({ deleteDiscussionImageObjects: async () => {}, sweepDiscussionImages: async () => {} }));
const { attachDiscussionImages } = await import("@/lib/discussions/images");

function transaction(responses: unknown[][], claimed: unknown[] = []) {
  const predicates: unknown[] = [];
  const tx = {
    select: () => {
      const response = responses.shift() ?? [];
      return {
        from() { return this; }, innerJoin() { return this; },
        where(condition: unknown) { predicates.push(condition); return this; },
        async for() { return response; },
        then(resolve: (rows: unknown[]) => void) { resolve(response); },
      };
    },
    update: () => ({ set: () => ({ where: (condition: unknown) => { predicates.push(condition); return { returning: async () => claimed }; } }) }),
  };
  return { tx: tx as unknown as Parameters<typeof attachDiscussionImages>[0], predicates };
}

const message = [{ id: "message", authorId: "alice", channelId: "channel", deletedAt: null }];
const input = { actorId: "alice", channelId: "channel", messageId: "message", attachmentIds: ["valid", "expired"] };

test("only verified owned expired or swept unattached uploads receive the recoverable code", async () => {
  const valid = transaction([message, [], [{ id: "valid" }], [{ id: "expired" }]]);
  await expect(attachDiscussionImages(valid.tx, input)).rejects.toThrow("DISCUSSION_ATTACHMENT_EXPIRED");
  const condition = new PgDialect().sqlToQuery(valid.predicates.at(-1) as never);
  for (const value of ["expired", "alice", "channel", "ready", "deleting", "failed"]) expect(condition.params).toContain(value);
  expect(condition.params).not.toContain("valid");
  expect(condition.sql).toContain("clock_timestamp()");
  expect(condition.sql).toContain('"message_id" is null');

  const forged = transaction([message, [], [{ id: "valid" }], []]);
  await expect(attachDiscussionImages(forged.tx, input)).rejects.toThrow("DISCUSSION_IMAGE_SCOPE");
  const mixed = transaction([message, [], [], [{ id: "expired" }]]);
  await expect(attachDiscussionImages(mixed.tx, input)).rejects.toThrow("DISCUSSION_IMAGE_SCOPE");
});

test("expiry between checking and claiming reports a recoverable expiry", async () => {
  const race = transaction([message, [], [{ id: "valid" }, { id: "expired" }], [{ id: "expired" }]], [{ id: "valid" }]);
  await expect(attachDiscussionImages(race.tx, input)).rejects.toThrow("DISCUSSION_ATTACHMENT_EXPIRED");
});
