import { generateDiscussionThreadTitle } from "@/lib/discussions/title-ai";
import { defineJob } from "./define-job";

export const discussionThreadTitleWorker = defineJob(
  {
    id: "discussion-thread-title",
    retries: 2,
    triggers: [{ event: "discussion/thread.title.requested" }],
  },
  async ({ event, step }) => {
    const { threadId, expectedTitle } = event.data as {
      threadId: string;
      expectedTitle: string;
    };
    return step.run("generate-discussion-thread-title", () =>
      generateDiscussionThreadTitle(threadId, expectedTitle),
    );
  },
);
