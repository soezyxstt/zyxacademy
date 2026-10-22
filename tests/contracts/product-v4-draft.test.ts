import { expect, test } from "bun:test";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

test("V4 finalization preserves edited visual definitions and refreshes content identity", () => {
  const { bundle } = buildLocalVerificationFixture();
  const draft = createProductBundleDraft(bundle);
  const article = draft.products.find(product => product.productType === "article");
  if (article?.productType !== "article" || !article.visuals?.length) throw new Error("VISUAL_FIXTURE_REQUIRED");
  const visual = article.visuals[0];
  visual.label = "Grafik yang direvisi";
  const finalized = finalizeProductBundleDraft(bundle, draft);
  const saved = finalized.bundle.products.find(product => product.productType === "article");
  expect(saved?.productType === "article" && saved.visuals?.[0].label).toBe("Grafik yang direvisi");
  expect(finalized.bundle.dependencies.some(dependency => dependency.freshness === "STALE")).toBe(true);
  expect(finalized.bundle.manifest.bundleChecksum).not.toBe(bundle.manifest.bundleChecksum);
});
