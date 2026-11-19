import { defineJob } from "./define-job";
import { ADMIN_OPERATION_BATCH, collectAdminOperations, processAdminOperation } from "@/lib/admin-mcp/external-jobs";
export const adminOperationsWorker = defineJob({
  id: "admin-operations-outbox", name: "Admin operations outbox", retries: 0,
  concurrency: { limit: 1 }, triggers: [{ cron: "* * * * *" }, { event: "admin/operations.continue" }],
}, async ({ step }) => {
  const jobs = await step.run("collect-queued", collectAdminOperations);
  let processed = 0;
  for (const job of jobs) { await step.run(`execute-${job.id}`, async () => {
    const { executeAdminOperation } = await import("@/lib/admin-mcp/external-executor");
    return processAdminOperation(job.id, executeAdminOperation);
  }); processed++; }
  if (processed === ADMIN_OPERATION_BATCH) await step.enqueueTask("continue-admin-operations", { name: "admin/operations.continue", data: {} });
  return { processed };
});
