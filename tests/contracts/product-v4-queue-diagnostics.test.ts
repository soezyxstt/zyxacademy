import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { PRODUCT_V4_QUEUE_EVENT, PRODUCT_V4_QUEUE_PATH } from "@/lib/compute/product-v4-diagnostics";

const task = "a".repeat(64);
let authorized = true, jobFailure: unknown, requestFailure: unknown;
const runQueueJob = mock(async (..._args: unknown[]) => { if (jobFailure !== undefined) throw jobFailure; });
mock.module("google-auth-library", () => ({ OAuth2Client: class {
  async verifyIdToken() { return { getPayload: () => authorized ? { email_verified: true, email: "zyx-staging-queue@zyx-academy.iam.gserviceaccount.com" } : undefined }; }
} }));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/lib/db", () => ({ pool: {} }));
mock.module("@neon/functions", () => ({ attachDatabasePool() {} }));
mock.module("@/jobs/define-job", () => ({ queueJobs: new Map([[PRODUCT_V4_QUEUE_EVENT, {}], ["other.event", {}]]) }));
mock.module("@/lib/queue/run-job", () => ({ runQueueJob }));
const { dispatchQueueTask } = await import("../../workers/deno-background/queue-routes");
const app = new Hono().post("/internal/tasks/:eventName", dispatchQueueTask);
mock.module("../../workers/deno-background/main", () => ({ default: { async fetch(request: Request) {
  if (requestFailure !== undefined) throw requestFailure;
  return app.fetch(request);
} } }));

const settings = { ZYX_ENVIRONMENT: "staging", QUEUE_PROVIDER: "cloud-tasks", NODE_ENV: "production", COMPUTE_SERVICE_SECRET: "synthetic-only", INNGEST_SERVE_ORIGIN: "https://worker.invalid", ZYX_COMPUTE_BUILD_RUNTIME: "synthetic-only" };
const original = Object.fromEntries([...Object.keys(settings), "ZYX_COMPUTE_RUNTIME"].map(key => [key, process.env[key]]));
Object.assign(process.env, settings);
const { default: worker } = await import("../../workers/neon-background/main");
afterAll(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

let errors: string[];
let errorSpy: ReturnType<typeof spyOn>, infoSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  authorized = true; jobFailure = undefined; requestFailure = undefined; errors = [];
  runQueueJob.mockClear();
  errorSpy = spyOn(console, "error").mockImplementation((line: string) => { errors.push(line); });
  infoSpy = spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { errorSpy.mockRestore(); infoSpy.mockRestore(); });
function request(path = PRODUCT_V4_QUEUE_PATH, override: Record<string, string> = {}) {
  return new Request(`https://worker.invalid${path}?token=private-query`, { method: "POST", headers: { Authorization: "Bearer synthetic-only", "Content-Type": "application/json", "X-CloudTasks-TaskName": task, "X-CloudTasks-TaskRetryCount": "3", "X-CloudTasks-QueueName": "zyx-staging-default", ...override }, body: JSON.stringify({ id: "synthetic-delivery", data: { privateBody: "private-body" } }) });
}

test("authorized V4 failures retain empty503 and exact retry arguments with sanitized diagnostics", async () => {
  jobFailure = Object.assign(new Error("private failure https://private.invalid"), { code: "ECONNRESET" });
  const response = await worker.fetch(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("");
  expect(runQueueJob.mock.calls[0]).toEqual([PRODUCT_V4_QUEUE_EVENT, { privateBody: "private-body" }, task, 3, 6]);
  expect(errors.map(line => JSON.parse(line))).toEqual([{ event: "product_v4.queue_failure", boundary: "queue", job: "product-v4-verification", task, retry: 3, errorType: "Error", failureCode: "ECONNRESET" }]);
  expect(errors.join("\n")).not.toMatch(/private|Bearer|synthetic-only|https/);
});

test("auth, malformed delivery, successful delivery and other jobs retain their prior responses", async () => {
  authorized = false;
  expect((await worker.fetch(request())).status).toBe(401);
  authorized = true;
  expect((await worker.fetch(request(PRODUCT_V4_QUEUE_PATH, { "X-CloudTasks-TaskName": "invalid" }))).status).toBe(400);
  expect(runQueueJob).not.toHaveBeenCalled();
  expect((await worker.fetch(request())).status).toBe(204);
  jobFailure = new Error("private failure");
  expect((await worker.fetch(request("/internal/tasks/other.event"))).status).toBe(503);
  expect(errors).toEqual([]);
});

test("rejected app.fetch logs only V4 metadata and rethrows the identical error", async () => {
  requestFailure = new TypeError("private request failure");
  try { await worker.fetch(request()); throw new Error("expected rejection"); }
  catch (error) { expect(error).toBe(requestFailure); }
  expect(errors.map(line => JSON.parse(line))).toEqual([{ event: "product_v4.queue_failure", boundary: "request", job: "product-v4-verification", task, retry: 3, errorType: "TypeError", failureCode: "UNCLASSIFIED" }]);
  expect(runQueueJob).not.toHaveBeenCalled();
  errors.length = 0;
  await expect(worker.fetch(request("/other"))).rejects.toBe(requestFailure);
  expect(errors).toEqual([]);
});

test("a failed diagnostic sink does not change503 or rejected-fetch behavior", async () => {
  errorSpy.mockImplementation(() => { throw new Error("logger unavailable"); });
  jobFailure = new Error("QUEUE_JOB_BUSY");
  expect((await worker.fetch(request())).status).toBe(503);
  requestFailure = new Error("original rejection");
  await expect(worker.fetch(request())).rejects.toBe(requestFailure);
});
