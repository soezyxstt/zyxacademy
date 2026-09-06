import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "@/jobs/client";
import { computeFunctions } from "@/jobs/compute";
import { healthHandler } from "./health";
import { validateWorkerEnv } from "./env";
import { handlePdfPagesRpc, handleSourcePackResolveRpc } from "./pdf-rpc";

const env = validateWorkerEnv();

const app = new Hono();

app.get("/health", healthHandler);

// Internal compute RPC endpoints for Vercel web tier
app.post("/internal/pdf/pages", handlePdfPagesRpc);
app.post("/internal/authoring/source-pack/resolve", handleSourcePackResolveRpc);

app.on(
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

// When invoked directly by Deno runtime
if ((import.meta as any).main) {
  // @ts-ignore Deno global is present at runtime
  Deno.serve(app.fetch);
}
