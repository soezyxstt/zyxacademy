import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { operateCloudTask, v4OperationQueueProvider } from "../../scripts/authoring/v4-queue-operations";
import { prepareTask } from "@/lib/queue/cloud-tasks";

const identity = { importId: "impor-product-revision-11111111-1111-4111-8111-111111111111", runId: "run", planHash: "a".repeat(64), attemptId: "22222222-2222-4222-8222-222222222222" };
const taskFor = (environment: "staging" | "production", purpose: "logic" | "pdf" = "logic") => prepareTask({ name: "product.verification.requested", id: `product-verification-${identity.planHash}-${identity.attemptId}`, data: { ...identity, purpose } }, environment).task;
function fixture(environment: "staging" | "production" = "staging", response: Record<string, unknown> = {}, status = 200, purpose: "logic" | "pdf" = "logic") {
  const calls: Array<{ url: string; method: string }> = [];
  let tokens = 0;
  return {
    calls, tokenCount: () => tokens,
    ports: { async accessToken() { tokens++; return "test-only-token"; }, fetch: (async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only-token");
      expect(init?.redirect).toBe("error");
      return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ name: taskFor(environment, purpose).name, dispatchCount: 0, responseCount: 0, ...response }, { status });
    }) as typeof fetch },
  };
}

test("maintenance selects the configured queue and rejects noop or unknown providers", () => {
  expect(v4OperationQueueProvider({ QUEUE_PROVIDER: "cloud-tasks" })).toBe("cloud-tasks");
  expect(v4OperationQueueProvider({ QUEUE_PROVIDER: "inngest" })).toBe("inngest");
  expect(v4OperationQueueProvider({})).toBe("inngest");
  for (const provider of ["noop", "memory", "other", ""]) expect(() => v4OperationQueueProvider({ QUEUE_PROVIDER: provider })).toThrow("PROVIDER_INVALID");
});

for (const environment of ["staging", "production"] as const) test(`Cloud Tasks inspection derives the exact ${environment} task and does not expose provider request fields`, async () => {
  const f = fixture(environment, { httpRequest: { headers: { Authorization: "provider-secret" }, body: "private-body" }, scheduleTime: "2026-11-26T01:00:00Z", dispatchCount: 2, responseCount: 1 });
  const result = await operateCloudTask({ ...identity, environment, action: "inspect" }, f.ports);
  expect(f.calls).toEqual([{ url: `https://cloudtasks.googleapis.com/v2/${taskFor(environment).name}`, method: "GET" }]);
  expect(result).toEqual({ provider: "cloud-tasks", present: true, dispatchCount: 2, responseCount: 1, scheduleTime: "2026-11-26T01:00:00.000Z" });
  expect(JSON.stringify(result)).not.toContain("provider-secret");
  expect(JSON.stringify(result)).not.toContain("private-body");
});

test("a missing queued delivery is not evidence that verification completed", async () => {
  const f = fixture("staging", {}, 404);
  const result = await operateCloudTask({ ...identity, environment: "staging", action: "inspect" }, f.ports);
  expect(result).toMatchObject({ provider: "cloud-tasks", present: false });
  expect("note" in result && result.note).toContain("does not establish");
  await expect(operateCloudTask({ ...identity, environment: "staging", action: "cancel", verificationStatus: "pending" }, f.ports)).rejects.toThrow("DELIVERY_NOT_FOUND");
  expect(f.calls.every(call => call.method === "GET")).toBe(true);
});

test("cancellation deletes only the exact pending delivery and never claims an in-flight process stopped", async () => {
  const f = fixture();
  const result = await operateCloudTask({ ...identity, environment: "staging", action: "cancel", verificationStatus: "pending" }, f.ports);
  expect(f.calls.map(call => call.method)).toEqual(["GET", "DELETE"]);
  expect(new Set(f.calls.map(call => call.url)).size).toBe(1);
  expect(result).toMatchObject({ deliveryDeleted: true, executionStopped: false });
  const active = fixture("staging", { dispatchCount: 1, responseCount: 0 });
  await expect(operateCloudTask({ ...identity, environment: "staging", action: "cancel", verificationStatus: "pending" }, active.ports)).rejects.toThrow("RUNNING_CANCEL_UNSUPPORTED");
  expect(active.calls.map(call => call.method)).toEqual(["GET"]);
  const running = fixture();
  await expect(operateCloudTask({ ...identity, environment: "staging", action: "cancel", verificationStatus: "running" }, running.ports)).rejects.toThrow("RUNNING_CANCEL_UNSUPPORTED");
  expect(running.tokenCount()).toBe(0);
  expect(running.calls).toEqual([]);
});

test("PDF and logic maintenance resolve their separate queues for the same exact attempt identity", async () => {
  const logic = taskFor("staging", "logic"), pdf = taskFor("staging", "pdf");
  expect(logic.name).toContain("/queues/zyx-staging-default/");
  expect(pdf.name).toContain("/queues/zyx-staging-pdf/");
  for (const purpose of ["logic", "pdf"] as const) {
    const f = fixture("staging", {}, 200, purpose);
    await operateCloudTask({ ...identity, purpose, environment: "staging", action: "cancel", verificationStatus: "pending" }, f.ports);
    expect(f.calls).toEqual(["GET", "DELETE"].map(method => ({ method, url: `https://cloudtasks.googleapis.com/v2/${taskFor("staging", purpose).name}` })));
  }
  const invalid = fixture();
  await expect(operateCloudTask({ ...identity, purpose: "invalid" as never, environment: "staging", action: "inspect" }, invalid.ports)).rejects.toThrow("PURPOSE_INVALID");
  expect(invalid.tokenCount()).toBe(0);
});

test("cross-environment responses and malformed attempt identities cannot delete a task", async () => {
  const wrong = fixture("production");
  await expect(operateCloudTask({ ...identity, environment: "staging", action: "cancel", verificationStatus: "pending" }, wrong.ports)).rejects.toThrow("IDENTITY_MISMATCH");
  expect(wrong.calls.map(call => call.method)).toEqual(["GET"]);
  for (const patch of [{ environment: "local" }, { attemptId: "../other" }, { planHash: "invalid" }]) {
    const f = fixture();
    await expect(operateCloudTask({ ...identity, environment: "staging", action: "inspect", ...patch }, f.ports)).rejects.toThrow();
    expect(f.tokenCount()).toBe(0);
  }
});

test("the active maintenance workflow uses the selected queue and excludes the legacy fixture copier", () => {
  const workflow = Bun.YAML.parse(readFileSync(".github/workflows/v4-verification.yml", "utf8")) as {
    on: { workflow_dispatch: { inputs: { action: { options: string[] }; purpose: { options: string[]; default: string } } } };
    jobs: Record<string, { env?: Record<string, string>; permissions?: Record<string, string>; steps: Array<{ name?: string; if?: string; uses?: string }> }>;
  };
  expect(workflow.on.workflow_dispatch.inputs.action.options).toEqual(["inspect", "retry", "evidence", "cancel"]);
  expect(workflow.on.workflow_dispatch.inputs.purpose).toMatchObject({ options: ["logic", "pdf"], default: "logic" });
  expect(Object.keys(workflow.jobs)).toEqual(["verify"]);
  expect(workflow.jobs.verify.env?.QUEUE_PROVIDER).toContain("vars.QUEUE_PROVIDER");
  expect(workflow.jobs.verify.permissions?.["id-token"]).toBe("write");
  const authentication = workflow.jobs.verify.steps.find(step => step.uses?.startsWith("google-github-actions/auth@"));
  expect(authentication?.if).toBe("env.QUEUE_PROVIDER == 'cloud-tasks'");
});
