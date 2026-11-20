import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const counts = { total: { unreadThreads: 2, activeThreads: 3 }, scopes: {
  global: { unreadThreads: 0, activeThreads: 0 }, course: { unreadThreads: 2, activeThreads: 3 },
  technical: { unreadThreads: 0, activeThreads: 0 }, academic: { unreadThreads: 0, activeThreads: 0 },
}, course: { unreadThreads: 2, activeThreads: 3 } };
function setup(signedIn: boolean, accessFails = false) {
  const checks: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "@/lib/auth": { auth: { api: { getSession: async () => signedIn ? { user: { id: "viewer" } } : null } } },
    "@/lib/discussions/session": { getSessionDiscussionActor: async () => { checks.push("provision"); return { id: "viewer", role: "student" }; } },
    "@/lib/discussions/service": { getDiscussionCounts: async (id: string, options: unknown) => {
      checks.push({ id, options });
      if (accessFails) throw new Error("private detail");
      return counts;
    } },
  };
  const exports: Record<string, any> = {};
  const output = ts.transpileModule(readFileSync("app/api/discussions/counts/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, Response, URL, require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return { get: exports.GET as (request: Request) => Promise<Response>, checks };
}

describe("discussion counts route", () => {
  test("requires a session before querying", async () => {
    const context = setup(false);
    expect((await context.get(new Request("https://example.test/api/discussions/counts"))).status).toBe(401);
    expect(context.checks).toEqual([]);
  });
  test("returns bounded aggregates and forwards the requested course scope", async () => {
    const context = setup(true);
    const response = await context.get(new Request("https://example.test/api/discussions/counts?courseId=legacy-a"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(counts);
    expect(context.checks).toEqual(["provision", { id: "viewer", options: { courseId: "legacy-a" } }]);
  });
  test("does not expose internal errors if the access check fails", async () => {
    const response = await setup(true, true).get(new Request("https://example.test/api/discussions/counts"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Jumlah diskusi belum tersedia." });
  });
});
