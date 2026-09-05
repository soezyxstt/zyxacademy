export function assertProductSectionReviews(input: {
  requiredSectionIds: readonly string[];
  reviewerId: string;
  reviews: readonly { reviewerId: string; targetType: string; targetId: string | null; status: string }[];
}): void {
  const relevant = input.reviews.filter((review) => review.reviewerId === input.reviewerId && review.targetType === "article_section" && review.targetId);
  const requestedChanges = new Set(relevant.filter((review) => review.status === "changes_requested").map((review) => review.targetId!));
  if (requestedChanges.size > 0) throw new Error(`PRODUCT_BUNDLE_SECTION_CHANGES_REQUESTED:${[...requestedChanges].sort().join(",")}`);
  const approved = new Set(relevant.filter((review) => review.status === "approved").map((review) => review.targetId!));
  const missing = input.requiredSectionIds.filter((sectionId) => !approved.has(sectionId));
  if (missing.length > 0) throw new Error(`PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED:${missing.join(",")}`);
}
