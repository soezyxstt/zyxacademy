import { persistProductV4PdfEvidence as persist } from "./product-v4-pdf-evidence-shared";
import type { ProductV4VerificationSnapshot } from "@/lib/bundle/product-v4-verification-core";
import type { ProductV4VerificationPlan } from "@/lib/bundle/product-v4-verification";
export { deriveProductV4PdfEvidence } from "./product-v4-pdf-evidence-shared";
export async function persistProductV4PdfEvidence(input: { snapshot: ProductV4VerificationSnapshot; plan: ProductV4VerificationPlan; attemptId: string; receipt: unknown }) {
  const { buildProductV4RuntimeBinding } = await import("./product-v4-runtime-binding");
  return persist(input, buildProductV4RuntimeBinding);
}
