import { inngest } from "./client";
import { dispatchDiscussionEvents } from "@/lib/discussions/notifications";

export const discussionNotificationsWorker = inngest.createFunction(
 { id: "discussion-notifications", retries: 3, concurrency: { limit: 1 }, triggers: [{ cron: "* * * * *" }, { event: "discussion/notifications.continue" }] },
 async ({ step }) => {
  const result = await step.run("dispatch-discussion-events", () => dispatchDiscussionEvents({ limit: 20 }));
  if (result.hasMore) {
   await step.sendEvent("continue-discussion-notifications", { name: "discussion/notifications.continue", data: {} });
  }
  return result;
 },
);
