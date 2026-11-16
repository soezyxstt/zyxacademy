import { processDiscussionAiRequests } from "@/lib/discussions/ai";
import { inngest } from "./client";

export const discussionAiCron = inngest.createFunction(
  { id: "discussion-ai-cron", retries: 2, concurrency: { limit: 1 }, triggers: [
    { cron: "*/5 * * * *" }, { event: "discussion/ai.continue" },
  ] },
  async ({ step }) => {
    const result = await step.run("process-discussion-ai", () => processDiscussionAiRequests({ limit: 20 }));
    if (result.processed === 20) {
      await step.sendEvent("continue-discussion-ai", { name: "discussion/ai.continue", data: {} });
    }
    return result;
  },
);
