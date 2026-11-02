import { inngest } from "./client";
import { failProductV4VerificationJob, processProductV4VerificationJob } from "@/lib/bundle/product-v4-verification-service";
import { z } from "zod";
import { executeProductV4VerificationCheck } from "@/lib/compute/product-v4-verification-executor";

const input = z.object({ importId: z.string().min(1), runId: z.string().min(1), planHash: z.string().regex(/^[a-f0-9]{64}$/), attemptId: z.string().uuid() }).strict();
export const productVerificationWorker = inngest.createFunction({
  id: "product-v4-verification",
  triggers: [{ event: "product.verification.requested" }],
  retries: 5,
  concurrency: { limit: 1 },
  onFailure: async ({ event }) => failProductV4VerificationJob(input.parse(event.data.event.data)),
}, async ({ event, step }) => {
  return processProductV4VerificationJob(input.parse(event.data), async <T>(id: string, execute: () => Promise<T>) => await step.run(id, async () => {
    let failed = false;
    try { return await execute(); }
    catch (error) { failed = true; throw error; }
    finally {
      const { closeProductV4BrowserRunner } = await import("@/lib/compute/product-v4-browser-runner");
      try { await closeProductV4BrowserRunner(); }
      catch (error) { if (!failed) throw error; }
    }
  }) as T, executeProductV4VerificationCheck);
});
