import type { Context } from "hono";
import { OAuth2Client } from "google-auth-library";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { queueTaskCheckpoints } from "@/db/schema";
import { queueJobs } from "@/jobs/define-job";
import { enqueueTask, prepareTask } from "@/lib/queue/cloud-tasks";
import { cronWindow } from "@/lib/queue/cron";
import { runQueueJob } from "@/lib/queue/run-job";

const verifier = new OAuth2Client();

async function authorize(c: Context) {
  const environment = process.env.ZYX_ENVIRONMENT;
  if ((environment !== "staging" && environment !== "production") || process.env.QUEUE_PROVIDER !== "cloud-tasks") return;
  const audience = process.env.INNGEST_SERVE_ORIGIN;
  const bearer = c.req.header("Authorization");
  if (!audience || !bearer?.startsWith("Bearer ") || process.env.NODE_ENV === "test") return;
  const ticket = await verifier.verifyIdToken({ idToken: bearer.slice(7), audience }).catch(() => null);
  const claims = ticket?.getPayload();
  if (claims?.email_verified && claims.email === `zyx-${environment}-queue@zyx-academy.iam.gserviceaccount.com`) return environment;
}

export async function dispatchQueueTask(c: Context) {
  const env = await authorize(c);
  if (!env) return c.body(null, 401);
  const name = c.req.param("eventName");
  if (!name || !queueJobs.has(name)) return c.body(null, 404);
  const body = await c.req.json().catch(() => null);
  if (!body?.data || typeof body.data !== "object" || Array.isArray(body.data) || typeof body.id !== "string") return c.body(null, 400);
  const task = c.req.header("X-CloudTasks-TaskName");
  const retry = c.req.header("X-CloudTasks-TaskRetryCount");
  const queue = c.req.header("X-CloudTasks-QueueName");
  const { parent } = prepareTask({ name, data: body.data, id: body.id }, env);
  if (!queue || !task || !/^[a-f0-9]{64}$/.test(task) || !retry || !/^\d+$/.test(retry) || queue !== parent.split("/").at(-1)) return c.body(null, 400);
  try {
    await runQueueJob(name, body.data, task, Number(retry), queue.endsWith("-pdf") ? 3 : 6);
  } catch {
    return c.body(null, 503);
  }
  return c.body(null, 204);
}

export async function dispatchCron(c: Context) {
  const env = await authorize(c);
  if (!env) return c.body(null, 401);
  if (c.req.header("X-CloudScheduler-JobName") !== `projects/zyx-academy/locations/asia-southeast1/jobs/zyx-${env}-dispatcher`) return c.body(null, 403);
  const scheduledAt = new Date(c.req.header("X-CloudScheduler-ScheduleTime") ?? "");
  if (!Number.isFinite(scheduledAt.getTime())) return c.body(null, 400);
  const now = Date.now();
  for (const entry of cronWindow(env, scheduledAt)) {
    await enqueueTask({ name: entry.job, id: `cron:${entry.job}:${entry.scheduledAt}`, data: {},
      delaySeconds: Math.max(0, (entry.scheduledAt - now) / 1000) });
  }
  await db.delete(queueTaskCheckpoints).where(lt(queueTaskCheckpoints.recordedAt, sql`now() - interval '35 days'`));
  return c.body(null, 204);
}
