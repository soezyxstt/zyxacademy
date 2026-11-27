import { defineJob } from "./define-job";
import { ADMIN_OPERATION_BATCH, collectAdminOperations, processAdminOperation } from "@/lib/admin-mcp/external-jobs";
import { NATIVE_BROADCAST_BATCH, collectNativeBroadcasts, processNativeBroadcast } from "@/lib/native/academic/administration/broadcast-service";

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
  const broadcasts = await step.run("collect-native-broadcasts", collectNativeBroadcasts);
  for (const { id } of broadcasts) {
    await step.run(`execute-native-broadcast-${id}`, () => processNativeBroadcast(id));
  }
  if (processed === ADMIN_OPERATION_BATCH || broadcasts.length === NATIVE_BROADCAST_BATCH) await step.enqueueTask("continue-admin-operations", { name: "admin/operations.continue", data: {} });
  return { processed };
});
