import { expect, mock, test } from "bun:test";

type Job = { importId: string; runId: string; planHash: string; attemptId: string; purpose?: string };
type Context = { event: { data: Job }; step: { run<T>(id: string, execute: () => Promise<T>): Promise<T> } };
type Definition = { concurrency: { limit: number; key: string }; onFailure(input: { event: { data: { event: { data: Job } } } }): Promise<unknown> };
let definition!: Definition;
let run!: (input: Context) => Promise<unknown>;
const processed: Job[] = [], failed: Job[] = [];
let browserImports = 0, browserCloses = 0;
let executeJob = async (_job: Job) => "complete";
let cleanupBrowser = async () => {};
mock.module("@/jobs/define-job", () => ({ defineJob: (config: Definition, handler: typeof run) => { definition = config; run = handler; return {}; } }));
mock.module("@/lib/bundle/product-v4-verification-worker", () => ({
  failProductV4VerificationJob: async (job: Job) => { failed.push(job); },
  processProductV4VerificationJob: async (job: Job, checkpoint: (id: string, operation: () => Promise<string>) => Promise<string>) => {
    processed.push(job);
    return checkpoint("check", () => executeJob(job));
  },
}));
mock.module("@/lib/compute/product-v4-verification-executor", () => ({ executeProductV4VerificationCheck: async () => { throw new Error("NOT_USED"); } }));
mock.module("@/lib/compute/product-v4-browser-runner", () => {
  browserImports++;
  return { closeProductV4BrowserRunner: async () => { browserCloses++; await cleanupBrowser(); } };
});
await import("@/jobs/product-verification");

const identity: Job = { importId: "import", runId: "run", planHash: "a".repeat(64), attemptId: "11111111-1111-4111-8111-111111111111" };
const context = (purpose?: string, runId = identity.runId): Context => ({ event: { data: { ...identity, runId, ...(purpose ? { purpose } : {}) } }, step: { run: (_id, execute) => execute() } });
const signal = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

test("logic queue payload defaults safely and never imports or closes a browser", async () => {
  expect(await run(context())).toBe("complete");
  expect(await run(context("logic"))).toBe("complete");
  expect(processed.map(job => job.purpose)).toEqual(["logic", "logic"]);
  expect(browserImports).toBe(0);
  expect(browserCloses).toBe(0);
  expect(definition.concurrency).toEqual({ limit: 1, key: "event.data.purpose" });
});

test("explicit PDF queue payload and failure retain their purpose", async () => {
  expect(await run(context("pdf"))).toBe("complete");
  expect(processed.at(-1)?.purpose).toBe("pdf");
  expect(browserCloses).toBe(1);
  await definition.onFailure({ event: { data: { event: context("pdf").event } } });
  await definition.onFailure({ event: { data: { event: context().event } } });
  expect(failed.map(job => job.purpose)).toEqual(["pdf", "logic"]);
  const count = processed.length;
  await expect(run(context("invalid"))).rejects.toThrow();
  expect(processed).toHaveLength(count);
});

test("concurrent PDF jobs wait through browser cleanup while logic proceeds independently", async () => {
  const started = signal(), finishFirst = signal(), closing = signal(), finishClose = signal();
  const events: string[] = [];
  let browserOwner: string | undefined;
  const closesBefore = browserCloses;
  executeJob = async job => {
    events.push(`start:${job.runId}`);
    if (job.purpose === "pdf") {
      expect(browserOwner).toBeUndefined();
      browserOwner = job.runId;
    }
    if (job.runId === "first") { started.resolve(); await finishFirst.promise; }
    events.push(`complete:${job.runId}`);
    return job.runId;
  };
  cleanupBrowser = async () => {
    const owner = browserOwner;
    events.push(`close-start:${owner}`);
    if (owner === "first") { closing.resolve(); await finishClose.promise; }
    expect(browserOwner).toBe(owner);
    browserOwner = undefined;
    events.push(`close-end:${owner}`);
  };
  const first = run(context("pdf", "first"));
  let second: Promise<unknown> | undefined;
  try {
    await started.promise;
    second = run(context("pdf", "second"));
    expect(await run(context("logic", "logic"))).toBe("logic");
    expect(events).toEqual(["start:first", "start:logic", "complete:logic"]);
    expect(browserCloses).toBe(closesBefore);
    finishFirst.resolve();
    await closing.promise;
    expect(events).not.toContain("start:second");
    finishClose.resolve();
    expect(await Promise.all([first, second])).toEqual(["first", "second"]);
    expect(events.slice(3)).toEqual(["complete:first", "close-start:first", "close-end:first", "start:second", "complete:second", "close-start:second", "close-end:second"]);
    expect(browserOwner).toBeUndefined();
    expect(browserCloses).toBe(closesBefore + 2);
  } finally {
    finishFirst.resolve(); finishClose.resolve();
    await Promise.allSettled([first, ...(second ? [second] : [])]);
    executeJob = async () => "complete"; cleanupBrowser = async () => {};
  }
});

test("execution and cleanup failures release the PDF queue without replacing the original error", async () => {
  try {
    for (const failExecution of [true, false]) {
      let closes = 0;
      executeJob = async job => {
        if (job.runId === "failed" && failExecution) throw new Error("EXECUTION_FAILED");
        return job.runId;
      };
      cleanupBrowser = async () => { if (++closes === 1) throw new Error("CLEANUP_FAILED"); };
      const settled = await Promise.allSettled([run(context("pdf", "failed")), run(context("pdf", "next"))]);
      expect(settled[0]).toMatchObject({ status: "rejected", reason: new Error(failExecution ? "EXECUTION_FAILED" : "CLEANUP_FAILED") });
      expect(settled[1]).toEqual({ status: "fulfilled", value: "next" });
      expect(closes).toBe(2);
    }
  } finally { executeJob = async () => "complete"; cleanupBrowser = async () => {}; }
});
