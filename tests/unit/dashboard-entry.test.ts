import { describe, expect, test } from "bun:test";
import {
  getSafeEntryReturnPath,
  isAppEntryVisitedPath,
  isDocumentGetNavigation,
  isNativeMarketingRedirectPath,
  isNativeUserAgent,
  resolveRoleDashboardPath,
} from "@/lib/auth/dashboard-entry";

describe("resolveRoleDashboardPath", () => {
  test("routes single roles to their matching dashboard", () => {
    expect(resolveRoleDashboardPath(["admin"])).toBe("/admin");
    expect(resolveRoleDashboardPath(["tutor"])).toBe("/tutor");
    expect(resolveRoleDashboardPath(["murid"])).toBe("/dashboard");
  });

  test("follows admin -> tutor -> student priority for multi-role users", () => {
    expect(resolveRoleDashboardPath(["murid", "tutor", "admin"])).toBe("/admin");
    expect(resolveRoleDashboardPath(["tutor", "admin"])).toBe("/admin");
    expect(resolveRoleDashboardPath(["murid", "admin"])).toBe("/admin");
    expect(resolveRoleDashboardPath(["murid", "tutor"])).toBe("/tutor");
  });

  test("falls back to student dashboard when no canonical role matches", () => {
    expect(resolveRoleDashboardPath([])).toBe("/dashboard");
    expect(resolveRoleDashboardPath(["unknown"])).toBe("/dashboard");
  });
});

describe("getSafeEntryReturnPath", () => {
  test("allows only the marketing root and its localized root variants", () => {
    expect(getSafeEntryReturnPath("/")).toBe("/");
    expect(getSafeEntryReturnPath("/id")).toBe("/id");
    expect(getSafeEntryReturnPath("/en")).toBe("/en");
  });

  test("rejects arbitrary or external paths", () => {
    expect(getSafeEntryReturnPath(null)).toBe("/");
    expect(getSafeEntryReturnPath(undefined)).toBe("/");
    expect(getSafeEntryReturnPath("/admin")).toBe("/");
    expect(getSafeEntryReturnPath("//evil.example")).toBe("/");
    expect(getSafeEntryReturnPath("https://evil.example/en")).toBe("/");
    expect(getSafeEntryReturnPath("/en/plans")).toBe("/");
  });
});

describe("isAppEntryVisitedPath", () => {
  test("matches authenticated app workspace routes", () => {
    expect(isAppEntryVisitedPath("/dashboard")).toBe(true);
    expect(isAppEntryVisitedPath("/dashboard/schedule")).toBe(true);
    expect(isAppEntryVisitedPath("/admin")).toBe(true);
    expect(isAppEntryVisitedPath("/admin/users")).toBe(true);
    expect(isAppEntryVisitedPath("/tutor")).toBe(true);
    expect(isAppEntryVisitedPath("/tutor/ma1101")).toBe(true);
    expect(isAppEntryVisitedPath("/courses/ma1101")).toBe(true);
    expect(isAppEntryVisitedPath("/calendar")).toBe(true);
    expect(isAppEntryVisitedPath("/profile")).toBe(true);
    expect(isAppEntryVisitedPath("/settings")).toBe(true);
    expect(isAppEntryVisitedPath("/discussions")).toBe(true);
  });

  test("ignores marketing, auth, and API paths", () => {
    expect(isAppEntryVisitedPath("/")).toBe(false);
    expect(isAppEntryVisitedPath("/en")).toBe(false);
    expect(isAppEntryVisitedPath("/plans")).toBe(false);
    expect(isAppEntryVisitedPath("/sign-in")).toBe(false);
    expect(isAppEntryVisitedPath("/api/entry-redirect")).toBe(false);
    expect(isAppEntryVisitedPath("/administrator")).toBe(false);
  });
});

describe("isDocumentGetNavigation", () => {
  test("accepts standard GET document requests", () => {
    expect(
      isDocumentGetNavigation({
        method: "GET",
        headers: new Headers({ accept: "text/html" }),
      }),
    ).toBe(true);
  });

  test("rejects non-GET, RSC, and prefetch requests", () => {
    expect(
      isDocumentGetNavigation({ method: "POST", headers: new Headers() }),
    ).toBe(false);
    expect(
      isDocumentGetNavigation({ method: "HEAD", headers: new Headers() }),
    ).toBe(false);
    expect(
      isDocumentGetNavigation({
        method: "GET",
        headers: new Headers({ rsc: "1" }),
      }),
    ).toBe(false);
    expect(
      isDocumentGetNavigation({
        method: "GET",
        headers: new Headers({ "next-router-prefetch": "1" }),
      }),
    ).toBe(false);
    expect(
      isDocumentGetNavigation({
        method: "GET",
        headers: new Headers({ purpose: "prefetch" }),
      }),
    ).toBe(false);
    expect(
      isDocumentGetNavigation({
        method: "GET",
        headers: new Headers({ "sec-purpose": "prefetch;anonymous-client-ip" }),
      }),
    ).toBe(false);
  });
});

describe("isNativeUserAgent", () => {
  test("detects ZyxMobileApp and ZyxDesktopApp user agents", () => {
    expect(isNativeUserAgent("Mozilla/5.0 ZyxMobileApp/0.1.0 (Capacitor; nightly)")).toBe(true);
    expect(isNativeUserAgent("Mozilla/5.0 ZyxDesktopApp/0.1.0 (Tauri)")).toBe(true);
    expect(isNativeUserAgent("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36")).toBe(false);
    expect(isNativeUserAgent(null)).toBe(false);
  });
});

describe("isNativeMarketingRedirectPath", () => {
  test("matches marketing routes including locale-prefixed variants", () => {
    expect(isNativeMarketingRedirectPath("/")).toBe(true);
    expect(isNativeMarketingRedirectPath("/id")).toBe(true);
    expect(isNativeMarketingRedirectPath("/en")).toBe(true);
    expect(isNativeMarketingRedirectPath("/about")).toBe(true);
    expect(isNativeMarketingRedirectPath("/id/plans")).toBe(true);
    expect(isNativeMarketingRedirectPath("/en/blog/post-1")).toBe(true);
    expect(isNativeMarketingRedirectPath("/demo/courses")).toBe(true);
  });

  test("excludes auth, legal, and authenticated app routes", () => {
    expect(isNativeMarketingRedirectPath("/sign-in")).toBe(false);
    expect(isNativeMarketingRedirectPath("/sign-up")).toBe(false);
    expect(isNativeMarketingRedirectPath("/sign-out")).toBe(false);
    expect(isNativeMarketingRedirectPath("/privacy")).toBe(false);
    expect(isNativeMarketingRedirectPath("/terms")).toBe(false);
    expect(isNativeMarketingRedirectPath("/dashboard")).toBe(false);
    expect(isNativeMarketingRedirectPath("/admin")).toBe(false);
    expect(isNativeMarketingRedirectPath("/tutor")).toBe(false);
  });
});
