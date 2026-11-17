import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("image sweep registers bounded batches and continues full batches", async () => {
  let inspected = 50;
  let limit = 0;
  let configuration: Record<string, any> = {};
  let handler: (input: { step: unknown }) => Promise<unknown> = async () => {};
  const events: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "./client": { inngest: { createFunction: (options: Record<string, any>, run: typeof handler) => { configuration = options; handler = run; return {}; } } },
    "@/lib/discussions/image-sweep": { sweepDiscussionImages: async (input: { limit: number }) => { limit = input.limit; return { inspected, deleted: inspected, failed: 0 }; } },
  };
  const exports = {};
  const output = ts.transpileModule(readFileSync("jobs/discussion-image-sweep.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  const step = { run: async (_name: string, work: () => Promise<unknown>) => work(), sendEvent: async (_name: string, event: unknown) => events.push(event) };
  await handler({ step });
  expect(configuration.id).toBe("discussion-image-sweep");
  expect(configuration.concurrency.limit).toBe(1);
  expect(configuration.triggers).toContainEqual({ cron: "*/10 * * * *" });
  expect(limit).toBe(50);
  expect(events).toEqual([{ name: "discussion/images.sweep-continue", data: {} }]);
  inspected = 49;
  await handler({ step });
  expect(events).toHaveLength(1);
});
