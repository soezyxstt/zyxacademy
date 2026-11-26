import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { resolveNativeLoginReturn, resolveNativeProtectedDestination, type NativeRouteNode } from "../../../apps/mobile-native/auth/login-intent";
import { discussionDestination, discussionWorkspaceHref } from "../../../packages/native-parity/discussion-destination";
import { auditProductRoutes, pagePattern } from "./route-coverage";

test("every inventoried Next page has a verified source-level Expo disposition", async () => {
  const report = await auditProductRoutes(resolve(import.meta.dir, "../../.."));
  expect(report.issues).toEqual([]);
  expect(report.totals.missing).toBe(0);
  expect(report.inventory).toBe(report.routes.length);
  expect(Object.values(report.totals).reduce((total, count) => total + count, 0)).toBe(report.inventory);
  const route = (pattern: string) => report.routes.find(item => item.pattern === pattern);
  expect(route("/")?.kind).toBe("public-browser");
  expect(route("/admin/forms/[id]")?.kind).toBe("native-screen");
  expect(route("/admin/meet/[id]")?.kind).toBe("native-screen");
  expect(route("/forms/[id]")?.kind).toBe("public-browser");
  expect(route("/meet/[slug]")?.kind).toBe("public-browser");
  expect(route("/mcp/connections")?.kind).toBe("native-screen");
  expect(route("/mcp/authorize")?.kind).toBe("private-browser");
  expect(route("/settings/notifications/browser")?.kind).toBe("private-browser");
  expect(route("/authoring-verification")?.kind).toBe("web-tool");
  expect(route("/auth/native-start")).toMatchObject({ kind: "protocol-endpoint", expoSource: undefined });
  expect(route("/auth/native-finish")?.expoSource).toContain("/auth/native-finish.tsx");
  expect(route("/v4")?.expoSource).toBe("apps/mobile-native/app/v4.tsx");
  expect(route("/admin/assessments/[id]")?.targets).toEqual(["/admin/questions"]);
  expect(route("/admin/quizzes/[id]/edit")?.targets).toEqual(["/admin/courses/route-probe/quizzes/route-probe/edit"]);
  expect(route("/courses/[id]/live/host")?.targets).toEqual(["/tutor/route-probe/live"]);
  expect(route("/discussions")?.targets).toEqual(["/dashboard", "/tutor", "/admin"]
    .map(base => base + "/discussions?thread=sample&message=part%2Ftwo"));
});

test("route groups are stripped without flattening dynamic segments", () => {
  expect(pagePattern("app/(admin)/admin/(academic)/courses/[slug]/page.tsx")).toBe("/admin/courses/[slug]");
  expect(pagePattern("app/(marketing)/page.tsx")).toBe("/");
});

test("a multi-role discussion link keeps the decoded message and never falls to a role without its screen", () => {
  const href = "/discussions?thread=thread-1&message=reply%2F2&filter=one&filter=two";
  const roles = ["murid", "tutor", "admin"] as const;
  const node = (path: string): NativeRouteNode => ({ href: path, contextKey: path, isGenerated: false, isInternal: false, children: [] });
  const sitemap = (paths: string[]): NativeRouteNode => ({ ...node("/"), children: paths.map(node) });
  const account = { roles, dashboard: "/admin" } as const;
  const admin = "/admin" + href;
  expect(resolveNativeLoginReturn(href, account, sitemap(["/admin", "/admin/discussions"]))).toEqual({ status: "ready", href: admin });
  expect(resolveNativeLoginReturn(href, account, sitemap(["/admin", "/tutor/discussions"]))).toEqual({ status: "unavailable", dashboard: "/admin" });
  expect(resolveNativeProtectedDestination(href, account, sitemap(["/admin/discussions"]))?.href).toBe(admin);
  const params = new URLSearchParams(admin.split("?")[1]);
  expect(discussionDestination(params)).toEqual({ thread: "thread-1", message: "reply/2" });
  expect(discussionWorkspaceHref("/admin/discussions", params)).toBe("/admin/discussions?filter=one&filter=two");
  expect(discussionDestination(new URLSearchParams("message=reply"))).toBeNull();
  expect(discussionDestination(new URLSearchParams("thread=thread-1&message=%00"))).toBeNull();
});
