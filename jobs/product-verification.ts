import { defineJob } from "./define-job";
import { failProductV4VerificationJob, processProductV4VerificationJob } from "@/lib/bundle/product-v4-verification-worker";
import { z } from "zod";
import { executeProductV4VerificationCheck } from "@/lib/compute/product-v4-verification-executor";

const input = z.object({ importId: z.string().min(1), runId: z.string().min(1), planHash: z.string().regex(/^[a-f0-9]{64}$/), attemptId: z.string().uuid(), purpose: z.enum(["logic", "pdf"]).default("logic") }).strict();

let pdfSteps = Promise.resolve();
function runPdfStep<T>(execute: () => Promise<T>): Promise<T> {
  // Cloud Tasks can dispatch two PDF jobs to one process. Keep its shared browser
  // exclusive through cleanup, including steps that fail before opening a page.
  const result = pdfSteps.then(async () => {
    let failed = false;
    try { return await execute(); }
    catch (error) { failed = true; throw error; }
    finally {
      const { closeProductV4BrowserRunner } = await import("@/lib/compute/product-v4-browser-runner");
      try { await closeProductV4BrowserRunner(); }
      catch (error) { if (!failed) throw error; }
    }
  });
  pdfSteps = result.then(() => undefined, () => undefined);
  return result;
}

export const productVerificationWorker = defineJob({
  id: "product-v4-verification",
  triggers: [{ event: "product.verification.requested" }],
  retries: 5,
  concurrency: { limit: 1, key: "event.data.purpose" },
  onFailure: async ({ event }) => failProductV4VerificationJob(input.parse(event.data.event.data)),
}, async ({ event, step }) => {
  const job = input.parse(event.data);
  return processProductV4VerificationJob(job, async <T>(id: string, execute: () => Promise<T>) => await step.run(id,
    () => job.purpose === "pdf" ? runPdfStep(execute) : execute()) as T, executeProductV4VerificationCheck);
});
