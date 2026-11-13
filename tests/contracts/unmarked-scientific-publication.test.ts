import { expect, test } from "bun:test";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

test("actual V4 publication quality propagates raw mathematical prose as a blocker", async () => {
  const { bundle } = buildLocalVerificationFixture();
  const article = bundle.products.find((product) => product.productType === "article");
  if (!article || article.productType !== "article") throw Error("fixture missing");
  article.sections[0].blocks[0].parts = [{ id: "unmarked", kind: "markdown", markdown: "Jika 0 < |x-c| < delta, pilih epsilon > 0." }];
  const quality = await evaluateProductBundleQualityPolicy({ bundle });
  expect(quality.publicationReady).toBe(false);
  expect(quality.issues.some((issue) => issue.code === "PRODUCT_V4_UNMARKED_SCIENTIFIC_NOTATION" && issue.severity === "blocking")).toBe(true);
  const legacy = bundle.products.map((product) => product.productType === "article" ? { ...product, schemaVersion: "article.v3" as const } : { ...product, schemaVersion: "diktat.v3" as const });
  const legacyQuality = await evaluateProductBundleQualityPolicy(legacy);
  expect(legacyQuality.issues.some((issue) => issue.code === "PRODUCT_V4_UNMARKED_SCIENTIFIC_NOTATION")).toBe(false);
});
