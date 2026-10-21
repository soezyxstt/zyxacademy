import { inngest } from "./client";
import { processProductV4VerificationJob } from "@/lib/bundle/product-v4-verification-service";
import { z } from "zod";

const input = z.object({ importId: z.string().min(1), runId: z.string().min(1), planHash: z.string().regex(/^[a-f0-9]{64}$/), attemptId: z.string().uuid() }).strict();
export const productVerificationWorker = inngest.createFunction({
  id: "product-v4-verification",
  triggers: [{ event: "product.verification.requested" }],
  retries: 2,
  concurrency: { limit: 1 },
}, async ({ event, step }) => {
  try {
    return await step.run("verify-exact-product-revision", () => processProductV4VerificationJob(input.parse(event.data)));
  } finally {
    const { closeProductV4BrowserRunner } = await import("@/lib/compute/product-v4-browser-runner");
    await closeProductV4BrowserRunner();
  }
});
