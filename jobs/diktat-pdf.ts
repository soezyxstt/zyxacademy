import { inngest } from "./client";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { diktats } from "@/db/schema";
import { executeDiktatPDFGeneration } from "@/lib/compute/diktat-pdf";

export const diktatPdfWorker = inngest.createFunction(
  {
    id: "diktat-pdf-worker",
    name: "Diktat PDF Generation Worker",
    triggers: [{ event: "diktat/pdf.generate.requested" }],
    retries: 2,
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const { diktatId } = event.data as { diktatId: string };

    return step.run("compile-diktat-pdf", async () => {
      try {
        const result = await executeDiktatPDFGeneration(diktatId);
        if (!result.success) {
          await db
            .update(diktats)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(diktats.id, diktatId));
          throw new Error(result.errors?.join("; ") || `DIKTAT_GENERATION_FAILED_${diktatId}`);
        }
        return result;
      } catch (err: any) {
        await db
          .update(diktats)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(diktats.id, diktatId));
        throw err;
      }
    });
  }
);
