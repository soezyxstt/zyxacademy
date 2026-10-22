import { inngest } from "./client";
import { failProductV4VerificationJob, processProductV4VerificationJob } from "@/lib/bundle/product-v4-verification-service";
import { z } from "zod";

const input = z.object({ importId: z.string().min(1), runId: z.string().min(1), planHash: z.string().regex(/^[a-f0-9]{64}$/), attemptId: z.string().uuid() }).strict();
export const productVerificationWorker = inngest.createFunction({
  id: "product-v4-verification",
  triggers: [{ event: "product.verification.requested" }],
  retries: 2,
  concurrency: { limit: 1 },
  onFailure: async ({ event }) => failProductV4VerificationJob(input.parse(event.data.event.data)),
}, async ({ event, step }) => {
  return processProductV4VerificationJob(input.parse(event.data), (id, execute) => step.run(id, async () => {
    try { return await execute(); }
    finally {
      const { closeProductV4BrowserRunner } = await import("@/lib/compute/product-v4-browser-runner");
      await closeProductV4BrowserRunner();
    }
  }));
});
