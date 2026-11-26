import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { build } from "esbuild";
import { activateProductV4FatalDiagnostics, installProductV4FatalDiagnostics, withProductV4FatalDiagnosticScope } from "../../workers/neon-background/product-v4-fatal-diagnostics";

const task = "a".repeat(64), originalRuntime = process.env.ZYX_COMPUTE_RUNTIME;
let lines: string[], errorSpy: ReturnType<typeof spyOn>, childSource: string;
beforeAll(async () => {
  process.env.ZYX_COMPUTE_RUNTIME = "neon";
  installProductV4FatalDiagnostics();
  const bundle = await build({ entryPoints: ["workers/neon-background/product-v4-fatal-diagnostics.ts"], bundle: true, write: false, platform: "node", format: "esm", target: "node20" });
  childSource = bundle.outputFiles[0].text;
});
beforeEach(() => {
  lines = [];
  errorSpy = spyOn(console, "error").mockImplementation((line: string) => { lines.push(line); });
});
afterEach(() => { errorSpy.mockRestore(); process.env.ZYX_COMPUTE_RUNTIME = "neon"; });
afterAll(() => { if (originalRuntime === undefined) delete process.env.ZYX_COMPUTE_RUNTIME; else process.env.ZYX_COMPUTE_RUNTIME = originalRuntime; });
function observe(error: unknown = new Error("private-message")) { Reflect.apply(process.emit, process, ["uncaughtExceptionMonitor", error, "uncaughtException"]); }

test("fatal metadata contains only allowlisted error names, bounded numeric frames and validated task hashes", async () => {
  const error = Object.assign(new TypeError("private-message https://private.invalid?token=private-token"), { stack: [
    "TypeError: private-message /index.mjs:999:999",
    "    at privateFunction (/private-path/node_modules/playwright-core/lib/coreBundle.js:63512:17)",
    "    at privateFunction (C:\\private-path\\node_modules\\playwright-core\\lib\\utilsBundle.js:111:5)",
    "    at privateFunction (file:///private-path/index.mjs:2:83)",
    "    at privateFunction (/private-path/index.mjs:3:84)",
    "    at privateFunction (/private-path/secret.js:9:10)",
  ].join("\n") });
  await withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); observe(error); });
  expect(lines.map(line => JSON.parse(line))).toEqual([{ event: "product_v4.process_fatal", job: "product-v4-verification", origin: "uncaughtException", activeTasks: [task], activeTaskCount: 1, errorType: "TypeError", frames: [
    { file: "coreBundle.js", line: 63512, column: 17 }, { file: "utilsBundle.js", line: 111, column: 5 }, { file: "index.mjs", line: 2, column: 83 },
  ] }]);
  expect(lines.join("\n")).not.toMatch(/private|https|token|secret|999/);
  lines.length = 0;
  await withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); observe({ name: "private-name", message: "private-message", stack: "private-stack" }); });
  expect(JSON.parse(lines[0]).errorType).toBe("UnknownError");
  expect(lines[0]).not.toContain("private");
  lines.length = 0;
  let reads = 0;
  await withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); observe({ get name() { return ++reads === 1 ? "Error" : "private-mutated-name"; } }); });
  expect(reads).toBe(1); expect(JSON.parse(lines[0]).errorType).toBe("Error");
});

test("no output outside an active eligible and authorized Neon request", async () => {
  activateProductV4FatalDiagnostics(task); observe();
  await withProductV4FatalDiagnosticScope(false, async () => { activateProductV4FatalDiagnostics(task); observe(); });
  await withProductV4FatalDiagnosticScope(true, async () => { observe(); activateProductV4FatalDiagnostics("private-invalid-task"); observe(); });
  process.env.ZYX_COMPUTE_RUNTIME = "deno";
  await withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); observe(); });
  expect(lines).toEqual([]);
});

test("scope cleanup preserves response and rejection identity and prevents late reactivation", async () => {
  const response = new Response(null, { status: 204 }), failure = new Error("private-original");
  expect(await withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); return response; })).toBe(response);
  observe();
  await expect(withProductV4FatalDiagnosticScope(true, async () => { activateProductV4FatalDiagnostics(task); throw failure; })).rejects.toBe(failure);
  observe();
  let late!: Promise<void>;
  await withProductV4FatalDiagnosticScope(true, async () => {
    activateProductV4FatalDiagnostics(task);
    late = new Promise(resolve => { setImmediate(() => { activateProductV4FatalDiagnostics(task); observe(); resolve(); }); });
  });
  await late;
  expect(lines).toEqual([]);
});

test("concurrent requests report at most three active tasks without assigning a fatal event to one task", async () => {
  const finish: (() => void)[] = [];
  const requests = ["a", "b", "c", "d"].map(value => withProductV4FatalDiagnosticScope(true, async () => {
    activateProductV4FatalDiagnostics(value.repeat(64));
    await new Promise<void>(resolve => { finish.push(resolve); });
  }));
  try {
    observe();
    const record = JSON.parse(lines[0]);
    expect(record.activeTasks).toEqual(["a", "b", "c"].map(value => value.repeat(64)));
    expect(record.activeTaskCount).toBe(4);
    expect(record.activeTasksTruncated).toBe(true);
    expect(record).not.toHaveProperty("task");
  } finally { finish.forEach(resolve => resolve()); await Promise.all(requests); }
  lines.length = 0; observe(); expect(lines).toEqual([]);
});

test("diagnostic sink and hostile error accessors cannot change request results", async () => {
  errorSpy.mockImplementation(() => { throw new Error("private-sink-error"); });
  const response = {};
  expect(await withProductV4FatalDiagnosticScope(true, async () => {
    activateProductV4FatalDiagnostics(task); observe();
    observe({ get name() { throw new Error("private-accessor-error"); } });
    return response;
  })).toBe(response);
});

async function child(mode: "throw" | "reject" | "exit" | "complete", monitored: boolean) {
  const script = `${childSource}\n
    const before = [process.listenerCount("uncaughtException"), process.listenerCount("unhandledRejection")];
    if (${monitored}) { installProductV4FatalDiagnostics(); installProductV4FatalDiagnostics(); }
    console.log(JSON.stringify({ before, after: [process.listenerCount("uncaughtException"), process.listenerCount("unhandledRejection")], monitors: process.listenerCount("uncaughtExceptionMonitor") }));
    void withProductV4FatalDiagnosticScope(true, async () => {
      activateProductV4FatalDiagnostics("${task}");
      if ("${mode}" === "complete") return;
      setImmediate(() => {
        if ("${mode}" === "exit") process.exit(7);
        const error = new TypeError("synthetic-private-fatal");
        if ("${mode}" === "reject") void Promise.reject(error); else throw error;
      });
      await new Promise(() => {});
    });`;
  const processChild = Bun.spawn(["node", "--input-type=module", "-"], { stdin: new Blob([script]), stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "", ZYX_COMPUTE_RUNTIME: "neon" } });
  const timer = setTimeout(() => processChild.kill(), 10_000);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(processChild.stdout).text(), new Response(processChild.stderr).text(), processChild.exited]);
    const records = stderr.split("\n").filter(line => line.startsWith('{"event":"product_v4.')).map(line => JSON.parse(line));
    return { code, listeners: JSON.parse(stdout.trim()), records };
  } finally { clearTimeout(timer); }
}

for (const mode of ["throw", "reject"] as const) test(`Node retains default fatal termination for ${mode}`, async () => {
  const [baseline, monitored] = await Promise.all([child(mode, false), child(mode, true)]);
  expect(baseline.code).toBe(1); expect(monitored.code).toBe(baseline.code);
  expect(monitored.listeners).toEqual({ before: [0, 0], after: [0, 0], monitors: 1 });
  expect(monitored.records.map(record => record.event)).toEqual(["product_v4.process_fatal", "product_v4.process_exit"]);
  expect(monitored.records[0].origin).toBe(mode === "throw" ? "uncaughtException" : "unhandledRejection");
  expect(monitored.records[1].exitCode).toBe(1);
  expect(JSON.stringify(monitored.records)).not.toContain("synthetic-private-fatal");
});

test("Node preserves explicit exit codes and normal completion emits no diagnostic", async () => {
  const [baseline, monitored, completed] = await Promise.all([child("exit", false), child("exit", true), child("complete", true)]);
  expect(baseline.code).toBe(7); expect(monitored.code).toBe(7);
  expect(monitored.records).toEqual([{ event: "product_v4.process_exit", job: "product-v4-verification", activeTasks: [task], activeTaskCount: 1, exitCode: 7 }]);
  expect(completed.code).toBe(0); expect(completed.records).toEqual([]);
});
