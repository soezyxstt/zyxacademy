import { inngest } from "./client";
import { generateMistakeFeedback } from "@/lib/mistake-feedback";

export const feedbackWorker = inngest.createFunction(
  {
    id: "quiz-feedback-worker",
    name: "Quiz Feedback Worker",
    triggers: [{ event: "quiz/feedback.requested" }],
  },
  async ({ event, step }) => {
    const { attemptId } = event.data as { attemptId: string };

    await step.run("generate-feedback", async () => {
      await generateMistakeFeedback(attemptId);
    });

    return { attemptId };
  }
);
