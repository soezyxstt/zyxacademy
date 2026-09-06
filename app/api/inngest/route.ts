import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { allFunctions } from "@/jobs";

/**
 * Next.js App Router API Route Handler for Inngest webhooks.
 * Registers background functions for execution.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
});

