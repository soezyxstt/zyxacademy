import { inngest } from "./client";
import { generateProductDiktatPdfEvidence } from "@/lib/bundle/product-diktat-pdf";

export const productDiktatPdfWorker = inngest.createFunction(
  {
    id: "product-diktat-pdf-worker",
    name: "Product Diktat PDF Worker",
    triggers: [{ event: "product.diktat.pdf.requested" }],
    retries: 2,
    concurrency: { limit: 2 },
  },
  async ({ event, step }) => {
    const data = event.data as { importId: string; requestedBy: string };
    return step.run("render-product-diktat-pdf", () =>
      generateProductDiktatPdfEvidence({ ...data, throwOnFailure: true })
    );
  }
);
