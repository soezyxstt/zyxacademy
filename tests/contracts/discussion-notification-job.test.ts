import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("continues due work even when a bounded batch contains failures", async () => {
 let result = { processed: 0, failed: 20, hasMore: true };
 let limit = 0;
 let configuration: Record<string, any> = {};
 let handler: (input: { step: unknown }) => Promise<unknown> = async () => {};
 const events: unknown[] = [];
 const dependencies: Record<string, unknown> = {
  "./define-job": { defineJob: (options: Record<string, any>, run: typeof handler) => { configuration = options; handler = run; return {}; } },
  "@/lib/discussions/notifications": { dispatchDiscussionEvents: async (input: { limit: number }) => { limit = input.limit; return result; } },
 };
 const output = ts.transpileModule(readFileSync("jobs/discussion-notifications.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
 runInNewContext(output, { exports: {}, require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
 const step = { run: async (_name: string, work: () => Promise<unknown>) => work(), enqueueTask: async (_name: string, event: unknown) => events.push(event) };
 await handler({ step });
 expect(configuration.concurrency.limit).toBe(1);
 expect(limit).toBe(20);
 expect(events).toEqual([{ name: "discussion/notifications.continue", data: {} }]);
 result = { processed: 0, failed: 1, hasMore: false };
 await handler({ step });
 expect(events).toHaveLength(1);
});
