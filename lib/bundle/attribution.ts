export const BUNDLE_UPLOADER_ID = "$UPLOADER";
export const BUNDLE_APPROVING_REVIEWER_ID = "$APPROVING_REVIEWER";

/**
 * Checks whether an identity string is a recognized authoring sentinel
 * ($UPLOADER, $APPROVING_REVIEWER) or a legacy authoring tool placeholder.
 */
export function isBundleIdentitySentinelOrPlaceholder(value: string): boolean {
  if (value === BUNDLE_UPLOADER_ID || value === BUNDLE_APPROVING_REVIEWER_ID) {
    return true;
  }
  if (value.startsWith("authoring-mcp") || value.startsWith("local-authoring")) {
    return true;
  }
  return false;
}

/**
 * Resolves an authoring sentinel or legacy placeholder into an authenticated user ID
 * based on the provided uploader and approving reviewer publication context.
 */
export function resolveBundleIdentity(
  value: string,
  context: { uploaderId: string; approvingReviewerId: string },
): string {
  if (value === BUNDLE_UPLOADER_ID) return context.uploaderId;
  if (value === BUNDLE_APPROVING_REVIEWER_ID) return context.approvingReviewerId;
  if (value.startsWith("authoring-mcp") || value.startsWith("local-authoring")) {
    return context.uploaderId;
  }
  return value;
}

