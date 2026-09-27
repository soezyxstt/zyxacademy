import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectProductDiktatPdf, productDiktatFailureCode } from "@/lib/compute/product-diktat-inspector";

test("PDF setup failures remain retryable after inspection wrapping", () => {
  const error = new Error("PRODUCT_DIKTAT_PDF_INSPECTION_FAILED", {
    cause: new Error("PDF worker setup failed"),
  });
  assert.equal(productDiktatFailureCode(error), "RENDER_UNAVAILABLE");
});

test("a rejected PDF is classified as invalid output", async () => {
  await assert.rejects(inspectProductDiktatPdf(new Uint8Array([1, 2, 3])), (cause: unknown) => {
    assert.ok(cause instanceof Error);
    const error = new Error("PRODUCT_DIKTAT_PDF_INSPECTION_FAILED", { cause });
    assert.equal(productDiktatFailureCode(error), "INVALID_PDF_OUTPUT");
    return true;
  });
});
