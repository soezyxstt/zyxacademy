import { expect, test } from "bun:test";
import { isReviewItemNavigation } from "@/components/admin/material-review-navigation";

const review = "https://example.test/admin/materials/review/product/import-one?tab=product&item=one";
test("only the question parameter may vary inside one review", () => {
  expect(isReviewItemNavigation(review, review.replace("item=one", "item=two"))).toBe(true);
  expect(isReviewItemNavigation(review, review.replace("&item=one", ""))).toBe(true);
  expect(isReviewItemNavigation(review, "https://example.test/admin/materials/review/product/import-one?item=two&tab=product")).toBe(true);
  for (const target of [review.replace("import-one", "import-two"), review.replace("tab=product", "tab=idea"), `${review}&productType=diktat`, `${review}#other-section`, review.replace("example.test", "another.test"), "invalid"]) expect(isReviewItemNavigation(review, target)).toBe(false);
  expect(isReviewItemNavigation(review.replace("&item=one", ""), review.replace("&item=one", ""))).toBe(false);
});
