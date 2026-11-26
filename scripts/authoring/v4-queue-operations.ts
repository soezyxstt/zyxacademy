import { prepareTask } from "../../lib/queue/cloud-tasks";

type Identity = { importId: string; runId: string; planHash: string; attemptId: string };
type Ports = { fetch(url: string, init: RequestInit): Promise<Response>; accessToken(): Promise<string> };
const defaultPorts: Ports = {
  fetch: (...args) => fetch(...args),
  async accessToken() {
    const { GoogleAuth } = await import("google-auth-library");
    const token = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-tasks"] }).getAccessToken();
    if (!token) throw new Error("V4_OPERATION_QUEUE_AUTH_REQUIRED");
    return token;
  },
};

export function v4OperationQueueProvider(env: Record<string, string | undefined> = process.env) {
  const provider = env.QUEUE_PROVIDER ?? "inngest";
  if (provider !== "cloud-tasks" && provider !== "inngest") throw new Error("V4_OPERATION_QUEUE_PROVIDER_INVALID");
  return provider;
}

export async function operateCloudTask(input: Identity & { environment: string; action: "inspect" | "cancel"; verificationStatus?: string }, ports: Ports = defaultPorts) {
  if (input.environment !== "staging" && input.environment !== "production") throw new Error("V4_OPERATION_ENVIRONMENT_INVALID");
  if (!/^[a-f0-9]{64}$/.test(input.planHash) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.attemptId)) throw new Error("V4_OPERATION_ATTEMPT_INVALID");
  if (input.action === "cancel" && input.verificationStatus !== "pending") throw new Error("V4_OPERATION_CLOUD_TASKS_RUNNING_CANCEL_UNSUPPORTED");
  const { task } = prepareTask({ name: "product.verification.requested", id: `product-verification-${input.planHash}-${input.attemptId}`, data: { importId: input.importId, runId: input.runId, planHash: input.planHash, attemptId: input.attemptId } }, input.environment);
  const url = `https://cloudtasks.googleapis.com/v2/${task.name}`;
  const headers = { Authorization: `Bearer ${await ports.accessToken()}` };
  const response = await ports.fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) {
    if (input.action === "cancel") throw new Error("V4_OPERATION_QUEUE_DELIVERY_NOT_FOUND");
    return { provider: "cloud-tasks", present: false, note: "A missing delivery does not establish whether verification ran. Read the exact attempt state and receipt." };
  }
  if (!response.ok) throw new Error("V4_OPERATION_QUEUE_INSPECT_FAILED");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error("V4_OPERATION_QUEUE_RESPONSE_INVALID");
  const observed = value as Record<string, unknown>;
  if (observed.name !== task.name) throw new Error("V4_OPERATION_QUEUE_IDENTITY_MISMATCH");
  const count = (value: unknown) => value === undefined ? 0 : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const dispatchCount = count(observed.dispatchCount), responseCount = count(observed.responseCount);
  if (dispatchCount === null || responseCount === null || responseCount > dispatchCount) throw new Error("V4_OPERATION_QUEUE_RESPONSE_INVALID");
  if (input.action === "inspect") return { provider: "cloud-tasks", present: true, dispatchCount, responseCount,
    scheduleTime: typeof observed.scheduleTime === "string" && Number.isFinite(Date.parse(observed.scheduleTime)) ? new Date(observed.scheduleTime).toISOString() : null };
  if (dispatchCount !== responseCount) throw new Error("V4_OPERATION_CLOUD_TASKS_RUNNING_CANCEL_UNSUPPORTED");
  const removed = await ports.fetch(url, { method: "DELETE", headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!removed.ok) throw new Error(removed.status === 404 ? "V4_OPERATION_QUEUE_DELIVERY_CHANGED" : "V4_OPERATION_QUEUE_CANCEL_FAILED");
  return { provider: "cloud-tasks", deliveryDeleted: true, executionStopped: false,
    note: "Removed the exact queued delivery. A concurrent dispatch may already be running; this does not revoke its attempt or change publication readiness." };
}
