import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup(allowed: boolean, errorCode: string | null = "DISCUSSION_AI_UNCERTAIN", status = "uncertain") {
  const calls: string[] = [];
  let selection: Record<string, string> = {};
  let conditions: unknown;
  const rows = [{ messageId: "m1", status, errorCode, resultText: "private recovery envelope" }];
  const db = { select(fields: Record<string, string>) {
    calls.push("select"); selection = fields;
    return { from: () => ({ innerJoin: () => ({ where: (value: unknown) => {
      conditions = value;
      return { limit: async () => rows.map((row) => Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column as keyof typeof row]]))) };
    } }) }) };
  } };
  const deps: Record<string, unknown> = {
    "drizzle-orm": { and: (...items: unknown[]) => items, eq: (a: unknown, b: unknown) => ["eq", a, b], inArray: (a: unknown, b: unknown) => ["in", a, b] },
    "@/db": { db },
    "@/db/schema": { discussionAiRequests: { messageId: "messageId", status: "status", errorCode: "errorCode", requestedById: "requestedById", kind: "kind" }, discussionMessages: { id: "id", threadId: "threadId" } },
    "@/lib/discussions/session": { getSessionDiscussionActor: async () => ({ id: "viewer" }) },
    "@/lib/discussions/access": { requireDiscussionThreadAccess: async () => { calls.push("authorize"); if (!allowed) throw new Error("denied"); } },
  };
  const exports: Record<string, any> = {};
  const output = ts.transpileModule(readFileSync("components/discussions/discussion-ai-status.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  return { list: exports.listDiscussionAiStatuses as (threadId: string, ids: string[]) => Promise<unknown>, calls, getSelection: () => selection, getConditions: () => conditions };
}

describe("discussion AI status projection", () => {
  test("checks thread authorization before querying", async () => {
    const context = setup(false);
    await expect(context.list("thread", ["m1"])).rejects.toThrow("denied");
    expect(context.calls).toEqual(["authorize"]);
  });
  test("returns a safe reason only for the requester and requested thread and page", async () => {
    const context = setup(true);
    expect(await context.list("thread", ["m1"])).toEqual([{ messageId: "m1", status: "uncertain", reason: "ai_uncertain" }]);
    expect(Object.keys(context.getSelection())).toEqual(["messageId", "status", "errorCode"]);
    expect(context.getConditions()).toEqual([["eq", "threadId", "thread"], ["eq", "kind", "zyra"], ["eq", "requestedById", "viewer"], ["in", "id", ["m1"]]]);
    expect(await setup(true, "private diagnostic", "failed").list("thread", ["m1"])).toEqual([{ messageId: "m1", status: "failed", reason: "ai_failed" }]);
    expect(await setup(true, "DISCUSSION_AI_ASSESSMENT_ACTIVE", "failed").list("thread", ["m1"])).toEqual([{ messageId: "m1", status: "failed", reason: "ai_assessmentActive" }]);
    expect(await setup(true, "private diagnostic", "pending").list("thread", ["m1"])).toEqual([{ messageId: "m1", status: "pending", reason: null }]);
    for (const [code, key] of [["DISCUSSION_AI_FREE_TEXT_ONLY", "ai_freeTextOnly"], ["DISCUSSION_AI_IMAGE_LIMIT", "ai_imageLimit"], ["DISCUSSION_AI_IMAGE_DISABLED", "ai_imageDisabled"], ["DISCUSSION_AI_IMAGE_UNAVAILABLE", "ai_imageUnavailable"], ["REQUEST_TOO_LARGE", "ai_requestTooLarge"], ["DISCUSSION_AI_QUOTA", "ai_quota"], ["DISCUSSION_AI_SOURCE_CHANGED", "ai_sourceChanged"]]) {
      expect(await setup(true, code, "failed").list("thread", ["m1"])).toEqual([{ messageId: "m1", status: "failed", reason: key }]);
    }
  });
  test("rejects an unbounded page before accessing data", async () => {
    const context = setup(true);
    await expect(context.list("thread", Array.from({ length: 31 }, (_, index) => String(index)))).rejects.toThrow();
    expect(context.calls).toEqual([]);
  });
});
