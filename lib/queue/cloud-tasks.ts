import { createHash, randomUUID } from "node:crypto";

export interface QueueEvent {
  name: string;
  data: Record<string, unknown>;
  id?: string;
  delaySeconds?: number;
  queue?: "default" | "pdf";
}

const pdfEvents = new Set(["source.pdf.page.requested", "source.figure.requested", "product.diktat/pdf.generate.requested", "pdf/thumbnail.requested", "diktat/pdf.generate.requested"]);
const workerBranches = { staging: "br-gentle-scene-azq0gp91", production: "br-wandering-butterfly-azi11h8r" };

export function prepareTask(event: QueueEvent, environment: keyof typeof workerBranches, now = Date.now()) {
  if (!Object.hasOwn(workerBranches, environment)) throw new Error("QUEUE_ENVIRONMENT_INVALID");
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(event.name)) throw new Error("QUEUE_EVENT_INVALID");
  const origin = `https://${workerBranches[environment]}-zyxcompute.compute.c-3.ap-southeast-1.aws.neon.tech`;
  const queue = event.queue ?? (pdfEvents.has(event.name) ? "pdf" : "default");
  const parent = `projects/zyx-academy/locations/asia-southeast1/queues/zyx-${environment}-${queue}`;
  let id = event.id ?? randomUUID();
  let delay = event.delaySeconds ?? 0;
  if (["mastery/recompute.requested", "mastery/idea-recompute.requested.v1"].includes(event.name)) {
    const subject = event.data.ideaId ?? event.data.courseId;
    if (typeof event.data.studentId !== "string" || typeof subject !== "string") throw new Error("QUEUE_MASTERY_TARGET_REQUIRED");
    id = JSON.stringify([event.data.studentId, subject, Math.floor(now / 30_000)]);
    delay = Math.max(delay, 30);
  }
  if (!Number.isFinite(delay) || delay < 0 || delay > 30 * 86400) throw new Error("QUEUE_DELAY_INVALID");
  const hash = createHash("sha256").update(JSON.stringify([event.name, id])).digest("hex");
  const task = {
    name: `${parent}/tasks/${hash}`,
    ...(delay ? { scheduleTime: new Date(now + delay * 1000).toISOString() } : {}),
    httpRequest: {
      httpMethod: "POST",
      url: `${origin}/internal/tasks/${encodeURIComponent(event.name)}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ id, data: event.data })).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `zyx-${environment}-queue@zyx-academy.iam.gserviceaccount.com`,
        audience: origin,
      },
    },
  };
  return { parent, task };
}

let auth: import("google-auth-library").GoogleAuth | undefined;

export async function enqueueTask(event: QueueEvent) {
  if (process.env.NODE_ENV === "test" || ["noop", "memory"].includes(process.env.QUEUE_PROVIDER ?? "")) {
    return event.id ?? randomUUID();
  }
  if (process.env.QUEUE_PROVIDER !== "cloud-tasks") throw new Error("CLOUD_TASKS_PROVIDER_REQUIRED");
  const environment = process.env.ZYX_ENVIRONMENT;
  if (environment !== "production" && environment !== "staging") throw new Error("QUEUE_ENVIRONMENT_REQUIRED");
  if (process.env.ZYX_COMPUTE_RUNTIME === "neon") {
    const secret = process.env.COMPUTE_SERVICE_SECRET;
    if (!secret) throw new Error("QUEUE_RELAY_AUTH_REQUIRED");
    const origin = environment === "staging" ? "https://staging.zyxacademy.com" : "https://www.zyxacademy.com";
    const response = await fetch(`${origin}/api/internal/queue`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, id: event.id ?? randomUUID() }),
    });
    if (!response.ok) throw new Error(`QUEUE_RELAY_FAILED:${response.status}`);
    const result = await response.json();
    if (typeof result.id !== "string") throw new Error("QUEUE_RELAY_RESULT_INVALID");
    return result.id as string;
  }
  const { parent, task } = prepareTask(event, environment);
  const { GoogleAuth } = await import("google-auth-library");
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-tasks"] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("CLOUD_TASKS_AUTH_REQUIRED");
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  if (!response.ok && response.status !== 409) throw new Error(`CLOUD_TASKS_CREATE_FAILED:${response.status}`);
  return task.name;
}
