import { pruneOfflineChanges } from "@/lib/offline/server-events";
import { defineJob } from "./define-job";

export const offlineChangeRetentionCron = defineJob(
  { id: "offline-change-retention", retries: 3, concurrency: { limit: 1 }, triggers: [
    { cron: "30 18 * * *" }, { event: "offline/changes.prune-continue" },
  ] },
  async ({ step }) => {
    const result = await step.run("prune-offline-changes", () => pruneOfflineChanges());
    if (result.hasMore) await step.enqueueTask("continue-offline-retention", { name: "offline/changes.prune-continue", data: {} });
    return result;
  },
);
