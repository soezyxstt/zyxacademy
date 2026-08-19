export const BUNDLE_UPLOADER_ID = "$UPLOADER";
export const BUNDLE_APPROVING_REVIEWER_ID = "$APPROVING_REVIEWER";

export function resolveBundleIdentity(
  value: string,
  context: { uploaderId: string; approvingReviewerId: string },
): string {
  if (value === BUNDLE_UPLOADER_ID) return context.uploaderId;
  if (value === BUNDLE_APPROVING_REVIEWER_ID) return context.approvingReviewerId;
  return value;
}
