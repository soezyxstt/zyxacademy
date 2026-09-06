import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "@/jobs/client";
import { allFunctions } from "@/jobs";
import { healthHandler } from "./health";
import { validateWorkerEnv } from "./env";

const env = validateWorkerEnv();

const app = new Hono();

app.get("/health", healthHandler);

app.on(
  ["GET", "POST", "PUT"],
  "/api/inngest",
  serve({
    client: inngest,
    functions: allFunctions,
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
