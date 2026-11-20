import { defineJob } from "./define-job";
import { processGamificationOutbox } from "@/lib/gamification/processor";

export const gamificationOutboxCron = defineJob(
  { id: "gamification-outbox-cron", retries: 3, concurrency: { limit: 1 }, triggers: [{ cron: "*/5 * * * *" }, { event: "gamification/outbox.continue" }] },
  async ({ step }) => {
    const result = await step.run("process-outbox", () => processGamificationOutbox({ limit: 100 }));
    if (result.failed > 0) throw new Error("Gamification outbox processing failed");
    if (result.processed + result.rejected === 100) {
      await step.enqueueTask("continue-outbox", { name: "gamification/outbox.continue", data: {} });
    }
    return result;
  },
);
