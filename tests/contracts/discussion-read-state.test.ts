import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup(allowed: boolean, rows: Array<{ throughSeq: number }> = [{ throughSeq: 42 }]) {
  const calls: string[] = [];
  let conditions: unknown;
  const deps: Record<string, unknown> = {
    "drizzle-orm": { and: (...items: unknown[]) => items, eq: (a: unknown, b: unknown) => [a, b] },
    "@/db": { db: { select: () => ({ from: () => ({ where: (value: unknown) => {
      calls.push("select"); conditions = value; return { limit: async () => rows };
    } }) }) } },
    "@/db/schema": { discussionThreadReads: { threadId: "threadId", userId: "userId", throughSeq: "throughSeq" } },
    "@/lib/discussions/session": { getSessionDiscussionActor: async () => ({ id: "viewer" }) },
    "@/lib/discussions/access": { requireDiscussionThreadAccess: async () => { calls.push("authorize"); if (!allowed) throw new Error("denied"); } },
  };
  const exports: Record<string, any> = {};
  const output = ts.transpileModule(readFileSync("components/discussions/discussion-read-state.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  return { read: exports.getDiscussionReadThrough as (threadId: string) => Promise<number>, calls, conditions: () => conditions };
}

test("read baseline is authorized and scoped to the current actor and thread", async () => {
  const denied = setup(false);
  await expect(denied.read("thread")).rejects.toThrow("denied");
  expect(denied.calls).toEqual(["authorize"]);
  const allowed = setup(true);
  expect(await allowed.read("thread")).toBe(42);
  expect(allowed.conditions()).toEqual([["threadId", "thread"], ["userId", "viewer"]]);
  expect(await setup(true, []).read("thread")).toBe(0);
});
