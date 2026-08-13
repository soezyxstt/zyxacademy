import { describe, expect, test } from "bun:test";
import {
  BUNDLE_APPROVING_REVIEWER_ID,
  BUNDLE_UPLOADER_ID,
  resolveBundleIdentity,
} from "@/lib/bundle/attribution";

describe("external bundle attribution", () => {
  test("resolves privacy-safe actor sentinels at publication time", () => {
    const context = { uploaderId: "uploader-1", approvingReviewerId: "reviewer-1" };
    expect(resolveBundleIdentity(BUNDLE_UPLOADER_ID, context)).toBe("uploader-1");
    expect(resolveBundleIdentity(BUNDLE_APPROVING_REVIEWER_ID, context)).toBe("reviewer-1");
    expect(resolveBundleIdentity("known-identity", context)).toBe("known-identity");
  });
});
