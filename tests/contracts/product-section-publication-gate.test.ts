import { describe, expect, it } from "bun:test";
import { assertProductSectionReviews } from "@/lib/bundle/product-review-gate";

const approved = (reviewerId: string, targetId: string) => ({ reviewerId, targetType: "article_section", targetId, status: "approved" });

describe("Product V3 section publication gate", () => {
  it("requires every section approval from the same admin who publishes", () => {
    expect(() => assertProductSectionReviews({ requiredSectionIds: ["overview", "topic", "summary"], reviewerId: "admin-a", reviews: [approved("admin-a", "overview"), approved("admin-a", "topic"), approved("admin-a", "summary")] })).not.toThrow();
    expect(() => assertProductSectionReviews({ requiredSectionIds: ["overview", "topic"], reviewerId: "admin-b", reviews: [approved("admin-a", "overview"), approved("admin-a", "topic")] })).toThrow("PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED");
  });

  it("rejects a changes requested section even when another review approved it", () => {
    expect(() => assertProductSectionReviews({ requiredSectionIds: ["topic"], reviewerId: "admin-a", reviews: [approved("admin-a", "topic"), { reviewerId: "admin-a", targetType: "article_section", targetId: "topic", status: "changes_requested" }] })).toThrow("PRODUCT_BUNDLE_SECTION_CHANGES_REQUESTED");
  });

  it("ignores block reviews and approvals from another reviewer", () => {
    expect(() => assertProductSectionReviews({ requiredSectionIds: ["topic"], reviewerId: "admin-a", reviews: [{ reviewerId: "admin-a", targetType: "article_block", targetId: "topic", status: "approved" }, approved("admin-b", "topic")] })).toThrow("PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED");
  });
});
