import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDiscussionTestDb } from "./local-postgres";

const { client, testDb: db } = await createDiscussionTestDb();
let generatedTitle = "Strategi faktorisasi limit aljabar";
let generateCalls = 0;

mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/ai/model-settings-store", () => ({
  configuredModelChain: async () => ["gemini-2.5-flash"],
}));
mock.module("@/lib/ai/provider/model-registry", () => ({
  ROUTE_POLICY: { default: "default" },
  getModelEntry: () => ({ family: "generate" }),
  modelSupportsAiGateway: () => false,
}));
mock.module("@/lib/gemini-keys", () => ({
  geminiKeyPool: {
    getBestKey: () => ({ id: "key-1", client: { models: {} } }),
    markSuccess: () => {},
    markFailure: () => {},
  },
}));
mock.module("@/lib/ai/provider/gemini-generate-adapter", () => ({
  createGeminiGenerateAdapter: () => ({
    generate: async () => {
      generateCalls++;
      return { text: generatedTitle };
    },
  }),
}));
mock.module("@/lib/ai/provider/gemini-interactions-adapter", () => ({
  createGeminiInteractionsAdapter: () => ({
    generate: async () => ({ text: generatedTitle }),
  }),
}));

const { cleanGeneratedTitle, generateDiscussionThreadTitle } = await import("@/lib/discussions/title-ai");

afterAll(() => client.close());

beforeAll(async () => {
  await db.insert(schema.user).values({ id: "alice", name: "Alice", email: "alice@example.test" });
  await db.insert(schema.discussionChannels).values({ id: "global", kind: "global", title: "Umum" });
});

describe("discussion AI title generation", () => {
  test("cleanGeneratedTitle normalizes quotes, prefixes, markdown, whitespace, and bounds", () => {
    expect(cleanGeneratedTitle('  "Judul: **Cara menghitung limit**." \n  ')).toBe("Cara menghitung limit");
    expect(cleanGeneratedTitle("Title: `Turunan fungsi komposit`...")).toBe("Turunan fungsi komposit");
    expect(cleanGeneratedTitle("   ")).toBeNull();
    expect(cleanGeneratedTitle('"".')).toBeNull();

    const long = Array.from({ length: 20 }, (_, i) => `kata${i}`).join(" ");
    const cleaned = cleanGeneratedTitle(long)!;
    expect(cleaned.length).toBeLessThanOrEqual(120);
    expect(cleaned.endsWith(" ")).toBe(false);
  });

  test("generateDiscussionThreadTitle updates only when open and title matches expectedInitialTitle", async () => {
    await db.insert(schema.discussionThreads).values({
      id: "thread-open",
      channelId: "global",
      authorId: "alice",
      title: "Kenapa limit nol per nol difaktorkan?",
      status: "open",
    });
    await db.insert(schema.discussionMessages).values({
      id: "msg-open",
      threadId: "thread-open",
      authorId: "alice",
      kind: "human",
      messageType: "question",
      body: "Kenapa limit nol per nol difaktorkan? Saya masih bingung kapan memakai cara ini.",
      seq: 1,
      requestId: "req-open",
    });

    generateCalls = 0;
    generatedTitle = '"Judul: Faktorisasi bentuk limit 0/0."';
    const result = await generateDiscussionThreadTitle("thread-open", "Kenapa limit nol per nol difaktorkan?");
    expect(result).toEqual({ updated: true, title: "Faktorisasi bentuk limit 0/0" });
    expect(generateCalls).toBe(1);

    const [updated] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, "thread-open"));
    expect(updated.title).toBe("Faktorisasi bentuk limit 0/0");

    // Re-running with old expectedInitialTitle skips before calling Gemini.
    const stale = await generateDiscussionThreadTitle("thread-open", "Kenapa limit nol per nol difaktorkan?");
    expect(stale).toEqual({ updated: false, reason: "source_changed" });
    expect(generateCalls).toBe(1);
  });

  test("skips resolved threads, deleted questions, and empty AI results without overwriting", async () => {
    await db.insert(schema.discussionThreads).values([
      { id: "thread-resolved", channelId: "global", authorId: "alice", title: "Judul awal", status: "resolved" },
      { id: "thread-deleted", channelId: "global", authorId: "alice", title: "Lampiran gambar", status: "open" },
      { id: "thread-empty-ai", channelId: "global", authorId: "alice", title: "Judul tetap", status: "open" },
    ]);
    await db.insert(schema.discussionMessages).values([
      { id: "msg-resolved", threadId: "thread-resolved", authorId: "alice", kind: "human", messageType: "question", body: "Isi pertanyaan", seq: 1, requestId: "req-res" },
      { id: "msg-deleted", threadId: "thread-deleted", authorId: "alice", kind: "human", messageType: "question", body: "Isi terhapus", seq: 1, requestId: "req-del", deletedAt: new Date(), deletedById: "alice" },
      { id: "msg-empty-ai", threadId: "thread-empty-ai", authorId: "alice", kind: "human", messageType: "question", body: "Mengapa integral ini divergen?", seq: 1, requestId: "req-emp" },
    ]);

    const beforeCalls = generateCalls;
    expect(await generateDiscussionThreadTitle("thread-resolved", "Judul awal")).toEqual({ updated: false, reason: "source_changed" });
    expect(await generateDiscussionThreadTitle("thread-deleted", "Lampiran gambar")).toEqual({ updated: false, reason: "no_question_body" });
    expect(generateCalls).toBe(beforeCalls);

    generatedTitle = "   ";
    expect(await generateDiscussionThreadTitle("thread-empty-ai", "Judul tetap")).toEqual({ updated: false, reason: "no_change" });
    const [unchanged] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, "thread-empty-ai"));
    expect(unchanged.title).toBe("Judul tetap");
  });
});
