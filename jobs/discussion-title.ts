import { generateDiscussionThreadTitle } from "@/lib/discussions/title-ai";
import { inngest } from "./client";

export const discussionThreadTitleWorker = inngest.createFunction(
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
