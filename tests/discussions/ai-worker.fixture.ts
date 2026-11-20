import { beforeEach, describe, expect, it, mock } from "bun:test";
import { getTableName } from "drizzle-orm";

type Row = Record<string, any>;
const state: {
  request: Row; message: Row; channel: Row; thread: Row; attachments: Row[];
  prior: Row[]; original: Row | null; originalChannel: Row | null;
  actor: Row; courseAllowed: boolean; activeAssessment: boolean; providerCalls: Row[]; published: Row[]; storageBytes?: number;
  providerMode: "success" | "unknown" | "uncertain" | "quota" | "edit" | "revoke" | "malformed"; publishFails: boolean;
} = {} as any;

function resultFor(table: unknown): Row[] {
  const name = getTableName(table as any);
  if (name === "discussion_ai_requests") {
    if (state.request.status === "pending") return [{ ...state.request }];
    if (state.request.status === "processing" && state.request.startedAt < new Date(Date.now() - 15 * 60 * 1000)) return [{ ...state.request }];
    return [];
  }
  if (name === "discussion_messages") return state.prior.map((item) => ({ ...item }));
  if (name === "discussion_threads") return [{ ...state.thread }];
  if (name === "discussion_attachments") return state.attachments.map((item) => ({ ...item }));
  if (name === "student_quiz_attempts") return state.activeAssessment ? [{ id: "active" }] : [];
  return [];
}

const db: any = {
  select() {
    let table: unknown;
    let locked = false;
    const rows = () => locked && getTableName(table as any) === "discussion_messages" ? [{ ...state.message }] : resultFor(table);
    const query: any = {
      from(value: unknown) { table = value; return query; },
      where() { return query; }, orderBy() { return query; }, for() { locked = true; return query; },
      limit() { return Promise.resolve(rows()); },
      then(resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows()).then(resolve, reject);
      },
    };
    return query;
  },
  update(table: unknown) {
    let values: Row;
    let applied = false;
    const apply = () => {
      if (!applied && getTableName(table as any) === "discussion_ai_requests") Object.assign(state.request, values);
      if (!applied && getTableName(table as any) === "discussion_threads") Object.assign(state.thread, values);
      applied = true;
      return [{ ...state.request }];
    };
    return {
      set(value: Row) {
        values = value;
        return { where() { return {
          returning: async () => apply(),
          then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(apply()).then(resolve, reject),
        }; } };
      },
    };
  },
  async transaction<T>(fn: (tx: typeof db) => Promise<T>) { return fn(db); },
};

mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionActor: async () => {
    if (!state.actor) throw new Error("DISCUSSION_UNAVAILABLE");
    return { ...state.actor };
  },
  requireDiscussionThreadAccess: async () => ({ channel: { ...state.channel }, thread: { ...state.thread } }),
  requireDiscussionMessageAccess: async (_actor: Row, messageId: string) => messageId === state.message.id
    ? { channel: { ...state.channel }, thread: { ...state.thread }, message: { ...state.message } }
    : state.original && messageId === state.original.id
      ? { channel: { ...state.originalChannel }, thread: { ...state.thread }, message: { ...state.original } }
      : Promise.reject(new Error("DISCUSSION_UNAVAILABLE")),
}));
const publish = async (id: string, answer: string, expectedSources: Row[]) => {
    if (state.publishFails) throw new Error("temporary database failure");
    state.published.push({ id, answer, expectedSources });
    state.request.status = "completed";
  };
mock.module("@/lib/discussions/ai-publication", () => ({ publishDiscussionZyraAnswer: publish }));
mock.module("@/lib/prompt-executor", () => ({
  PromptExecutor: class {
    static async run(input: Row) {
      state.providerCalls.push(input);
      if (state.providerMode === "unknown") throw new Error("timeout");
      if (state.providerMode === "uncertain") return { success: false, outcome: "uncertain", violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"] };
      if (state.providerMode === "quota") return { success: false, outcome: "quota_exceeded" };
      if (state.providerMode === "edit") { state.message.revision++; state.message.body = "edited"; }
      if (state.providerMode === "revoke") state.actor = null as any;
      if (input.feature === "discussion-staff-classification") {
        return { success: true, data: state.providerMode === "malformed" ? { label: "bug", role: "admin" } : { label: "operations" } };
      }
      return { success: true, data: { answer: "Perhatikan konsep dasarnya." } };
    }
  },
}));
mock.module("@/lib/student/course-access", () => ({
  resolveCourseEntitlementsBatch: async (_userId: string, ids: string[]) => new Map(state.courseAllowed ? ids.map(id => [id, { tier: "free", hasFullContentAccess: true, hasCourseAccess: true, capabilities: { canAskZyra: true } }]) : []),
}));
mock.module("@/lib/storage", () => ({ storage: { download: async () => {
  const bytes = new Uint8Array(state.storageBytes ?? 8);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  return bytes;
} } }));
mock.module("@/lib/tutor/answer-sanitizer", () => ({ sanitizeAnswer: (value: string) => value }));

const { processDiscussionAiRequests, classifyDiscussionWithStaffBudget } = await import("@/lib/discussions/ai");

beforeEach(() => {
  Object.assign(state, {
    request: { id: "request-1", messageId: "message-1", requestedById: "student-1", kind: "zyra", status: "pending",
      requestId: "stable-request", resultText: null, attempts: 0, startedAt: null, createdAt: new Date() },
    actor: { id: "student-1", role: "student" }, courseAllowed: true,
    channel: { id: "channel-1", kind: "global", courseId: null, legacyCourseId: null },
    thread: { id: "thread-1", channelId: "channel-1", labels: [], status: "open" },
    message: { id: "message-1", threadId: "thread-1", seq: 1, revision: 1, authorId: "student-1", kind: "human",
      messageType: "question", body: "Bagaimana konsep ini?", askZyra: true, deletedAt: null, forwardedFromId: null },
    attachments: [], prior: [], original: null, originalChannel: null, activeAssessment: false,
    providerCalls: [], published: [], providerMode: "success", publishFails: false, storageBytes: undefined,
  });
});

describe("discussion AI worker with local fakes", () => {
  it("rejects a revoked course scope without provisioning an identity or dispatching", async () => {
    state.channel.courseId = "course";
    state.channel.kind = "course";
    state.courseAllowed = false;
    await processDiscussionAiRequests();
    expect(state.providerCalls).toHaveLength(0);
    expect(state.published).toHaveLength(0);
    expect(state.request.errorCode).toBe("DISCUSSION_AI_SOURCE_CHANGED");
  });
  it("passes the invoking student and stable free key once and publishes only once", async () => {
    expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
    expect(await processDiscussionAiRequests()).toMatchObject({ processed: 0 });
    expect(state.providerCalls).toHaveLength(1);
    expect(state.providerCalls[0]).toMatchObject({ userId: "student-1", idempotencyKey: "zyra-free:discussion:request-1",
      maxAttempts: 1, singleDispatch: true, cachePolicy: "bypass" });
    expect(state.published).toHaveLength(1);
    expect(state.published[0]).toMatchObject({ answer: "Perhatikan konsep dasarnya.", expectedSources: [{ id: "message-1", revision: 1 }] });
  });

  it("marks unknown dispatch outcomes uncertain and does not call the provider again", async () => {
    state.providerMode = "unknown";
    expect(await processDiscussionAiRequests()).toMatchObject({ uncertain: 1 });
    expect(state.request.status).toBe("uncertain");
    await processDiscussionAiRequests();
    expect(state.providerCalls).toHaveLength(1);
    expect(state.published).toHaveLength(0);
  });

  it("maps a typed uncertain executor result without retrying", async () => {
    state.providerMode = "uncertain";
    expect(await processDiscussionAiRequests()).toMatchObject({ uncertain: 1 });
    expect(state.request.errorCode).toBe("DISCUSSION_AI_UNCERTAIN");
    expect(await processDiscussionAiRequests()).toMatchObject({ processed: 0 });
    expect(state.providerCalls).toHaveLength(1);
  });

  it("does not dispatch a previously attempted request reset to pending", async () => {
    state.request.attempts = 1;
    expect(await processDiscussionAiRequests()).toMatchObject({ uncertain: 1 });
    expect(state.providerCalls).toHaveLength(0);
  });

  it("recovers a stored result after publication fails without a second provider call", async () => {
    state.publishFails = true;
    expect(await processDiscussionAiRequests()).toMatchObject({ uncertain: 1 });
    expect(state.request.status).toBe("processing");
    expect(state.request.resultText).toBeString();
    state.request.startedAt = new Date(Date.now() - 16 * 60 * 1000);
    state.publishFails = false;
    expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
    expect(state.providerCalls).toHaveLength(1);
    expect(state.published).toHaveLength(1);
  });

  it("does not publish when the source changes or access is revoked", async () => {
    state.providerMode = "edit";
    await processDiscussionAiRequests();
    expect(state.published).toHaveLength(0);
    expect(state.request.errorCode).toBe("DISCUSSION_AI_SOURCE_CHANGED");
    state.request = { ...state.request, status: "pending", attempts: 0, resultText: null, startedAt: null };
    state.providerMode = "revoke";
    await processDiscussionAiRequests();
    expect(state.published).toHaveLength(0);
    expect(state.request.errorCode).toBe("DISCUSSION_AI_SOURCE_CHANGED");
  });

  it("rejects free images and active assessments before any charge", async () => {
    state.attachments = [{ id: "image-1", messageId: "message-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }];
    await processDiscussionAiRequests();
    expect(state.request.errorCode).toBe("DISCUSSION_AI_FREE_TEXT_ONLY");
    expect(state.providerCalls).toHaveLength(0);
    state.request = { ...state.request, status: "pending", attempts: 0, resultText: null, startedAt: null };
    state.attachments = [];
    state.activeAssessment = true;
    await processDiscussionAiRequests();
    expect(state.request.errorCode).toBe("DISCUSSION_AI_ASSESSMENT_ACTIVE");
    expect(state.providerCalls).toHaveLength(0);
  });

  it("keeps a free text invocation usable when an earlier message has an image", async () => {
    state.message.seq = 2;
    state.prior = [{ ...state.message, id: "prior-1", seq: 1, authorId: "other-student", askZyra: false, body: "Gunakan pemfaktoran." }];
    state.attachments = [{ id: "prior-image", messageId: "prior-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }];
    expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
    expect(state.providerCalls).toHaveLength(1);
    expect(state.providerCalls[0].providerParts ?? []).toHaveLength(0);
    expect(state.providerCalls[0].variables.prompt).toContain("Sebagian gambar sebelumnya tidak disertakan");
    expect(state.providerCalls[0].variables.prompt).toContain("Gunakan pemfaktoran.");
  });

  it("keeps a text invocation usable with more than four prior images and prioritizes its own images", async () => {
    state.actor = { id: "staff-1", role: "tutor" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.message.seq = 3;
    state.prior = [1, 2].map(seq => ({ ...state.message, id: `prior-${seq}`, seq, askZyra: false }));
    state.attachments = Array.from({ length: 6 }, (_, index) => ({ id: `prior-image-${index}`, messageId: index < 4 ? "prior-1" : "prior-2", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }));
    const previousFlag = process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
    process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = "1";
    try {
      expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
      expect(state.providerCalls[0].providerParts).toHaveLength(4);
      expect(state.providerCalls[0].variables.prompt).toContain("[1,1,2,2]");
      expect(state.providerCalls[0].variables.prompt).toContain("Sebagian gambar sebelumnya tidak disertakan");
      state.request = { ...state.request, status: "pending", attempts: 0, resultText: null, startedAt: null };
      state.attachments.push({ ...state.attachments[0], id: "own-image", messageId: "message-1" });
      expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
      expect(state.providerCalls[1].providerParts).toHaveLength(4);
      expect(state.providerCalls[1].variables.prompt).toContain("[1,2,2,3]");
    } finally { if (previousFlag === undefined) delete process.env.FEATURE_ZYRA_IMAGE_INPUT_V1; else process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = previousFlag; }
  });

  it("omits earlier images beyond the byte budget while reserving the invoking images", async () => {
    state.actor = { id: "staff-1", role: "tutor" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.message.seq = 2;
    state.prior = [{ ...state.message, id: "prior-1", seq: 1, askZyra: false }];
    state.storageBytes = 5 * 1024 * 1024;
    state.attachments = Array.from({ length: 4 }, (_, index) => ({ id: `image-${index}`, messageId: index === 3 ? "message-1" : "prior-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: state.storageBytes, width: 1, height: 1 }));
    const previousFlag = process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
    process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = "1";
    try {
      expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
      expect(state.providerCalls[0].providerParts).toHaveLength(3);
      expect(state.providerCalls[0].variables.prompt).toContain("[1,1,2]");
      expect(state.providerCalls[0].variables.prompt).toContain("Sebagian gambar sebelumnya tidak disertakan");
      state.request = { ...state.request, status: "pending", attempts: 0, resultText: null, startedAt: null };
      state.attachments[3].messageId = "prior-1";
      expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 });
      expect(state.providerCalls[1].providerParts).toHaveLength(3);
      expect(state.providerCalls[1].variables.prompt).toContain("[1,1,1]");
    } finally { if (previousFlag === undefined) delete process.env.FEATURE_ZYRA_IMAGE_INPUT_V1; else process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = previousFlag; }
  });

  it("passes a sanitized image to an eligible staff actor with cache bypass", async () => {
    state.actor = { id: "staff-1", role: "tutor" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.attachments = [{ id: "image-1", messageId: "message-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }];
    const previousFlag = process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
    process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = "1";
    try { expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1 }); }
    finally { if (previousFlag === undefined) delete process.env.FEATURE_ZYRA_IMAGE_INPUT_V1; else process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = previousFlag; }
    expect(state.providerCalls[0]).toMatchObject({ userId: "staff-1", premium: true, cachePolicy: "bypass",
      providerParts: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }] });
    expect(state.providerCalls[0].variables.prompt).toContain("[1]");
  });

  it("honors the existing Zyra image-input switch before reading bytes or charging", async () => {
    state.actor = { id: "staff-1", role: "tutor" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.attachments = [{ id: "image-1", messageId: "message-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }];
    const previousFlag = process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
    process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = "0";
    try {
      await processDiscussionAiRequests();
      expect(state.request.errorCode).toBe("DISCUSSION_AI_IMAGE_DISABLED");
      expect(state.providerCalls).toHaveLength(0);
      expect(state.published).toHaveLength(0);
    } finally {
      if (previousFlag === undefined) delete process.env.FEATURE_ZYRA_IMAGE_INPUT_V1;
      else process.env.FEATURE_ZYRA_IMAGE_INPUT_V1 = previousFlag;
    }
  });

  it("rejects inconsistent stored image metadata before dispatch", async () => {
    state.actor = { id: "staff-1", role: "tutor" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.attachments = [{ id: "image-1", messageId: "message-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 9, width: 1, height: 1 }];
    expect(await processDiscussionAiRequests()).toMatchObject({ failed: 1 });
    expect(state.request.errorCode).toBe("DISCUSSION_AI_IMAGE_UNAVAILABLE");
    expect(state.providerCalls).toHaveLength(0);
  });

  it("hydrates authorized forwarded text and images without forwarding private content outward", async () => {
    state.actor = { id: "staff-1", role: "admin" };
    state.request.requestedById = "staff-1";
    state.message.authorId = "staff-1";
    state.message.seq = 2;
    state.prior = [{ ...state.message, id: "forward-1", seq: 1, body: "", messageType: "forward", forwardedFromId: "original-1" }];
    state.original = { ...state.message, id: "original-1", seq: 1, body: "Penjelasan asal", forwardedFromId: null };
    state.originalChannel = { ...state.channel };
    state.attachments = [{ id: "image-1", messageId: "original-1", channelId: "channel-1", status: "attached", storageKey: "private", mime: "image/png", size: 8, width: 1, height: 1 }];
    await processDiscussionAiRequests();
    expect(state.providerCalls[0].variables.prompt).toContain("Penjelasan asal");
    expect(state.providerCalls[0].providerParts).toHaveLength(1);
    expect(state.published[0].expectedSources).toEqual(expect.arrayContaining([
      { id: "forward-1", revision: 1 }, { id: "original-1", revision: 1 }, { id: "message-1", revision: 1 },
    ]));

    state.request = { ...state.request, status: "pending", attempts: 0, resultText: null, startedAt: null };
    state.originalChannel = { ...state.channel, id: "private-channel", kind: "academic" };
    state.attachments[0].channelId = "private-channel";
    await processDiscussionAiRequests();
    expect(state.providerCalls[1].variables.prompt).not.toContain("Penjelasan asal");
    expect(state.providerCalls[1].providerParts).toHaveLength(0);
  });

  it("requires an explicit staff identity and falls back on malformed classification", async () => {
    await expect(classifyDiscussionWithStaffBudget({ actorId: "student-1", messageId: "message-1", requestId: "classify-1" }))
      .rejects.toThrow("DISCUSSION_AI_STAFF_REQUIRED");
    expect(state.providerCalls).toHaveLength(0);
    state.actor = { id: "staff-1", role: "admin" };
    state.message.body = "Aplikasi gagal saat masuk";
    state.providerMode = "malformed";
    expect(await classifyDiscussionWithStaffBudget({ actorId: "staff-1", messageId: "message-1", requestId: "classify-1" }))
      .toEqual({ label: "bug", source: "fallback" });
    expect(state.providerCalls[0]).toMatchObject({ userId: "staff-1", feature: "discussion-staff-classification", maxAttempts: 1, singleDispatch: true });
    expect(state.thread.labels).toEqual(["bug"]);
    expect(state.channel.kind).toBe("global");
  });

  it("classifies an automatic label deterministically without invoking student AI", async () => {
    state.request.kind = "label";
    state.message.body = "Aplikasi gagal saat masuk";
    expect(await processDiscussionAiRequests()).toMatchObject({ completed: 1, automaticLabelProvider: "requires_operational_budget_identity" });
    expect(state.providerCalls).toHaveLength(0);
    expect(state.thread.labels).toEqual(["bug"]);
    expect(state.request.resultText).toBe("bug");
  });
});
