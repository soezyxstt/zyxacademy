import { Hono } from "hono";
import "@/jobs/compute";
import { dispatchCron, dispatchQueueTask } from "./queue-routes";
import { healthHandler } from "./health";
import { validateWorkerEnv } from "./env";
import { handlePdfPagesRpc, handleSourcePackResolveRpc } from "./pdf-rpc";

validateWorkerEnv();

const app = new Hono();

app.get("/health", healthHandler);
app.post("/internal/tasks/:eventName", dispatchQueueTask);
app.post("/internal/cron/tick", dispatchCron);

// Internal compute RPC endpoints for web tier
app.post("/internal/pdf/pages", handlePdfPagesRpc);
app.post("/internal/authoring/source-pack/resolve", handleSourcePackResolveRpc);

export default app;
