import { sweepDiscussionImages } from "@/lib/discussions/image-sweep";
import { defineJob } from "./define-job";

export const discussionImageSweepCron = defineJob(
  { id: "discussion-image-sweep", retries: 2, concurrency: { limit: 1 }, triggers: [
    { cron: "*/10 * * * *" }, { event: "discussion/images.sweep-continue" },
  ] },
  async ({ step }) => {
    const result = await step.run("sweep-discussion-images", () => sweepDiscussionImages({ limit: 50 }));
    if (result.inspected === 50) await step.enqueueTask("continue-discussion-image-sweep", { name: "discussion/images.sweep-continue", data: {} });
    return result;
  },
);
