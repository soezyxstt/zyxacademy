import { afterEach, expect, spyOn, test } from "bun:test";
import { logProductV4BrowserStart, logProductV4QueueFailure } from "@/lib/compute/product-v4-diagnostics";

const task = "a".repeat(64);
const restore: Array<() => void> = [];
afterEach(() => { for (const reset of restore.splice(0)) reset(); });
function capture(method: "error" | "info") {
  const lines: string[] = [];
  const spy = spyOn(console, method).mockImplementation((line: string) => { lines.push(line); });
  restore.push(() => spy.mockRestore());
  return lines;
}

test("failure diagnostics keep only known categories, task identity and bounded worker locations", () => {
  const lines = capture("error");
  const cause = Object.assign(new Error("postgresql://user:credential@private.invalid/db"), { code: "57P01" });
  const error = new TypeError("VERIFICATION_BROWSER_CONNECT_FAILED https://private.invalid/?token=credential", { cause });
  error.stack = "credential\n at connect (https://private.invalid/index.mjs:1:12345)\n at secret (/opt/function/index.mjs:2:99)\n at secret (/opt/function/index.mjs:3:88)\n at secret (/opt/function/index.mjs:4:77)";
  logProductV4QueueFailure("queue", error, task, "3");
  expect(JSON.parse(lines[0])).toEqual({ event: "product_v4.queue_failure", boundary: "queue", job: "product-v4-verification", task, retry: 3,
    errorType: "TypeError", failureCode: "VERIFICATION_BROWSER_CONNECT_FAILED", workerFrames: [{ line: 1, column: 12345 }, { line: 2, column: 99 }, { line: 3, column: 88 }],
    cause: { errorType: "Error", failureCode: "57P01" },
  });
  expect(lines.join("\n")).not.toMatch(/credential|private\.invalid|postgresql|https|connect|secret|opt\/function/);
});

test("unrecognized messages, names, codes and malformed task metadata never enter logs", () => {
  const lines = capture("error");
  logProductV4QueueFailure("request", { name: "PRIVATE_NAME", message: "SECRET_ALL_CAPS", code: "PRIVATE_CODE", body: "private body", url: "https://private.invalid" }, "private task", "private retry");
  expect(JSON.parse(lines[0])).toEqual({ event: "product_v4.queue_failure", boundary: "request", job: "product-v4-verification", errorType: "UnknownError", failureCode: "UNCLASSIFIED" });
  for (const retry of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1e3", "999999999999999999999"]) {
    logProductV4QueueFailure("queue", new Error("QUEUE_JOB_BUSY"), task, retry);
    expect(JSON.parse(lines.at(-1)!)).not.toHaveProperty("retry");
  }
});

test("logging and hostile exception properties cannot replace the application failure", () => {
  const spy = spyOn(console, "error").mockImplementation(() => { throw new Error("logger unavailable"); });
  restore.push(() => spy.mockRestore());
  expect(() => logProductV4QueueFailure("queue", new Error("QUEUE_JOB_BUSY"), task, 0)).not.toThrow();
  expect(() => logProductV4QueueFailure("request", Object.defineProperty({}, "name", { get() { throw new Error("private getter"); } }))).not.toThrow();
});

test("browser start markers contain only valid plan and check hashes", () => {
  const lines = capture("info");
  logProductV4BrowserStart(task, "b".repeat(64));
  logProductV4BrowserStart("private plan", "b".repeat(64));
  logProductV4BrowserStart(task, "private check");
  expect(lines.map(line => JSON.parse(line))).toEqual([{ event: "product_v4.browser_start", phase: "browser_execute", planHash: task, checkId: "b".repeat(64) }]);
});
