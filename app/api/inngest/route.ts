import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { webFunctions } from "@/jobs/web";

/**
 * Next.js App Router API Route Handler for Inngest webhooks.
 * Registers only web-tier functions (empty) to ensure Vercel never executes compute jobs.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: webFunctions,
});

