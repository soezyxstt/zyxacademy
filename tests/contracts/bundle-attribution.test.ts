import { describe, expect, test } from "bun:test";
import {
  BUNDLE_APPROVING_REVIEWER_ID,
  BUNDLE_UPLOADER_ID,
  isBundleIdentitySentinelOrPlaceholder,
  resolveBundleIdentity,
} from "@/lib/bundle/attribution";
import { explainBundleError } from "@/lib/bundle/admin-errors";

describe("external bundle attribution", () => {
  test("resolves privacy-safe actor sentinels at publication time", () => {
    const context = { uploaderId: "uploader-1", approvingReviewerId: "reviewer-1" };
    expect(resolveBundleIdentity(BUNDLE_UPLOADER_ID, context)).toBe("uploader-1");
    expect(resolveBundleIdentity(BUNDLE_APPROVING_REVIEWER_ID, context)).toBe("reviewer-1");
    expect(resolveBundleIdentity("authoring-mcp-kimia-bab1", context)).toBe("uploader-1");
    expect(resolveBundleIdentity("authoring-mcp", context)).toBe("uploader-1");
    expect(resolveBundleIdentity("local-authoring-draft", context)).toBe("uploader-1");
    expect(resolveBundleIdentity("local-authoring-v2", context)).toBe("uploader-1");
    expect(resolveBundleIdentity("known-identity", context)).toBe("known-identity");
  });

  test("identifies sentinels and legacy placeholders correctly", () => {
    expect(isBundleIdentitySentinelOrPlaceholder(BUNDLE_UPLOADER_ID)).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder(BUNDLE_APPROVING_REVIEWER_ID)).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder("authoring-mcp-kimia-bab1")).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder("authoring-mcp")).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder("local-authoring-draft")).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder("local-authoring-v2")).toBe(true);
    expect(isBundleIdentitySentinelOrPlaceholder("user-real-id")).toBe(false);
  });

  test("translates creator and publication errors into human-friendly sentence-case Indonesian", () => {
    expect(explainBundleError("IDEA_BUNDLE_CREATOR_NOT_FOUND")).toBe("Atribusi creator belum dapat dipetakan.");
    expect(explainBundleError("PRODUCT_BUNDLE_CREATOR_NOT_FOUND")).toBe("Atribusi creator belum dapat dipetakan.");
    expect(explainBundleError("IDEA_BUNDLE_CREATOR_UNKNOWN:foo")).toBe("Identitas creator dalam bundle tidak dikenal atau belum terdaftar.");
    expect(explainBundleError("PRODUCT_BUNDLE_CREATOR_UNKNOWN:bar")).toBe("Identitas creator dalam bundle tidak dikenal atau belum terdaftar.");
    expect(explainBundleError("IDEA_BUNDLE_ALREADY_PUBLISHED")).toBe("Bundle ini sudah terbit sebelumnya.");
    expect(explainBundleError("IDEA_BUNDLE_UPLOADER_NOT_FOUND")).toBe("Akun pengunggah bundle tidak ditemukan.");
  });
});

