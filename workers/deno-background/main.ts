import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "@/jobs/client";
import { computeFunctions } from "@/jobs/compute";
import { dispatchCron, dispatchQueueTask } from "./queue-routes";
import { handleSourceReadTask } from "./task-route";
import { healthHandler } from "./health";
import { validateWorkerEnv } from "./env";
import { handlePdfPagesRpc, handleSourcePackResolveRpc } from "./pdf-rpc";

const env = validateWorkerEnv();

const app = new Hono();

app.get("/health", healthHandler);
if (process.env.QUEUE_PROVIDER === "cloud-tasks") {
  app.post("/internal/tasks/:eventName", dispatchQueueTask);
  app.post("/internal/cron/tick", dispatchCron);
} else {
  app.post("/internal/tasks/source.pdf.page.requested", handleSourceReadTask);
}

// Internal compute RPC endpoints for Vercel web tier
app.post("/internal/pdf/pages", handlePdfPagesRpc);
app.post("/internal/authoring/source-pack/resolve", handleSourcePackResolveRpc);

// A signed legacy delivery can finish while staging producers switch revisions.
if (process.env.QUEUE_PROVIDER !== "cloud-tasks" || env.INNGEST_SIGNING_KEY) app.on(
  ["GET", "POST", "PUT"],
  "/api/inngest",
  serve({
    client: inngest,
    functions: computeFunctions,
    serveOrigin: env.INNGEST_SERVE_ORIGIN,
    servePath: env.INNGEST_SERVE_PATH,
  })
);

export default app;
