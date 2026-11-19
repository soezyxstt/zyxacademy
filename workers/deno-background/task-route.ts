import type { Context } from "hono";
import { OAuth2Client } from "google-auth-library";
import { failSourceReadPage, processSourceReadPage } from "@/jobs/source-read";

const verifier = new OAuth2Client();

export async function handleSourceReadTask(c: Context) {
  const env = process.env.ZYX_ENVIRONMENT;
  if (env !== "staging") return c.body(null, 404);
  const authorization = c.req.header("Authorization");
  const audience = process.env.INNGEST_SERVE_ORIGIN;
  if (!audience || !authorization?.startsWith("Bearer ")) return c.body(null, 401);
  try {
    const ticket = await verifier.verifyIdToken({ idToken: authorization.slice(7), audience });
    const claims = ticket.getPayload();
    if (!claims?.email_verified || claims.email !== `zyx-${env}-queue@zyx-academy.iam.gserviceaccount.com`) return c.body(null, 403);
  } catch {
    return c.body(null, 401);
  }
  const retry = c.req.header("X-CloudTasks-TaskRetryCount");
  if (!retry || !/^\d+$/.test(retry) || c.req.header("X-CloudTasks-QueueName") !== `zyx-${env}-pdf`) return c.body(null, 400);
  const body = await c.req.json().catch(() => null);
  if (body?.data?.courseId !== "neon-worker-smoke" ||
      typeof body.data.storageKey !== "string" ||
      !/^overhaul\/neon-worker-smoke\/[0-9a-f-]{36}\.pdf$/.test(body.data.storageKey)) return c.body(null, 400);
  try {
    await processSourceReadPage(body.data);
  } catch (error) {
    if (Number(retry) < 2) return c.body(null, 503);
    await failSourceReadPage(body.data, error);
  }
  return c.body(null, 204);
}
