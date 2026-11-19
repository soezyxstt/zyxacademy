import { defineJob } from "./define-job";
import { dispatchDiscussionEvents } from "@/lib/discussions/notifications";

export const discussionNotificationsWorker = defineJob(
 { id: "discussion-notifications", retries: 3, concurrency: { limit: 1 }, triggers: [{ cron: "* * * * *" }, { event: "discussion/notifications.continue" }] },
 async ({ step }) => {
  const result = await step.run("dispatch-discussion-events", () => dispatchDiscussionEvents({ limit: 20 }));
  if (result.hasMore) {
   await step.enqueueTask("continue-discussion-notifications", { name: "discussion/notifications.continue", data: {} });
  }
  return result;
 },
);
