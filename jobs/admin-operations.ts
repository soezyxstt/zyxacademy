import { inngest } from "./client";
import { collectAdminOperations, processAdminOperation } from "@/lib/admin-mcp/external-jobs";
export const adminOperationsWorker = inngest.createFunction({
  id: "admin-operations-outbox", name: "Admin operations outbox", retries: 0,
  concurrency: { limit: 1 }, triggers: [{ cron: "* * * * *" }],
}, async ({ step }) => {
  const jobs = await step.run("collect-queued", collectAdminOperations);
  let processed = 0;
  for (const job of jobs) { await step.run(`execute-${job.id}`, async () => {
    const { executeAdminOperation } = await import("@/lib/admin-mcp/external-executor");
    return processAdminOperation(job.id, executeAdminOperation);
  }); processed++; }
  return { processed };
});
