import { collectNativePkaDelivery, pkaDeliveryBatch, pkaDeliveryJob, pkaDeliveryOutbox, processNativePkaDelivery } from "@/lib/pka/native-delivery-queue";
import { defineJob } from "./define-job";

export const pkaDeliveryWorker = defineJob({
  id: pkaDeliveryJob, name: "Native PKA communications", retries: 0,
  concurrency: { limit: 1 }, triggers: [{ event: pkaDeliveryOutbox }, { cron: "*/5 * * * *" }],
}, async ({ step }) => {
  const jobs = await step.run("collect-pka-delivery", collectNativePkaDelivery);
  for (const job of jobs) {
    await step.run(`deliver-${job.id}`, () => processNativePkaDelivery(job.id));
  }
  if (jobs.length === pkaDeliveryBatch) await step.enqueueTask("continue-pka-delivery", { name: pkaDeliveryOutbox, data: {} });
  return { queued: jobs.length };
});
