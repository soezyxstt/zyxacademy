import { expect, test } from "bun:test";
import { isPersonalAccountRequest, isPersonalCommunityOperation, personalAccountRoutes, personalAccountSessionHeader } from "@/packages/student-community/account-access";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "@/apps/mobile-native/auth/login-intent";
import { bindStudentRequest } from "@/apps/mobile-native/features/student/transport";
import { staffNavigation } from "@/apps/mobile-native/routing/staff-navigation";

const learnerOnly = ["/profile/reflections", "/achievements", "/students/[publicId]", "/dashboard/groups"];
const node = (href: string): NativeRouteNode => ({ href, contextKey: href + ".tsx", isGenerated: false, isInternal: false, children: [] });
const sitemap = { ...node("/"), children: [...personalAccountRoutes, ...learnerOnly].map(node) };

test("personal settings and profile returns accept each signed role, while learner routes retain access checks", () => {
  for (const role of ["tutor", "admin", "murid"] as const) {
    const actor = { roles: [role] };
    for (const path of personalAccountRoutes) {
      expect(resolveNativeProtectedDestination(path, actor, sitemap)?.href).toBe(path);
      expect(resolveNativeProtectedDestination(path, { roles: [] }, sitemap)).toBeNull();
    }
    for (const path of learnerOnly) {
      const href = path.replace("[publicId]", "learner");
      expect(resolveNativeProtectedDestination(href, actor, sitemap)?.href).toBe(role === "murid" ? href : undefined);
    }
  }
});

test("staff settings transport pins the account, current session, locale and supported operation", async () => {
  let reached = 0;
  const session = { role: "tutor", userId: "actor", sessionId: "arrival", locale: "en", origin: "https://example.test" } as const;
  const run = bindStudentRequest(session, async (_path, init) => {
    reached += 1;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-student-id")).toBe("actor");
    expect(headers.get(personalAccountSessionHeader)).toBe("arrival");
    expect(headers.get("x-app-locale")).toBe("en");
    return new Response(null, { status: 200 });
  });
  const prefix = "/api/native/student/community/";
  for (const [method, path] of [
    ["GET", prefix + "profile?view=edit"], ["POST", prefix + "profile"], ["POST", prefix + "locale"],
    ["GET", prefix + "notifications"], ["POST", prefix + "notification-email"],
    ["POST", prefix + "notification-activity"], ["POST", prefix + "notification-timing"],
    ["DELETE", "/api/account/sessions"], ["PUT", "/api/notifications/quiet-hours"],
  ]) expect((await run(path, { method, headers: { "x-student-id": "other", [personalAccountSessionHeader]: "stale" } })).ok).toBe(true);
  for (const [method, path] of [
    ["GET", prefix + "reflections"], ["POST", prefix + "social-settings"], ["GET", prefix + "public-profile"],
    ["POST", prefix + "notifications"], ["GET", prefix + "locale"], ["DELETE", prefix + "profile"],
    ["GET", "/api/native/student/courses"], ["GET", prefix + "profile/extra"], ["GET", prefix + "../profile"],
  ]) await expect(run(path, { method })).rejects.toThrow();
  await expect(bindStudentRequest({ ...session, sessionId: undefined }, run)(prefix + "profile")).rejects.toThrow();
  expect(reached).toBe(9);
  expect(isPersonalCommunityOperation("POST", "profile")).toBe(true);
  expect(isPersonalCommunityOperation("HEAD", "notifications")).toBe(false);
  expect(isPersonalAccountRequest("POST", "/api/account/sessions")).toBe(false);
});

test("account screens use translated titles and role-aware return paths", () => {
  expect(staffNavigation("tutor", "/profile/edit?tab=profile", "en")).toMatchObject({ title: "Edit profile", backTo: "/profile" });
  expect(staffNavigation("admin", "/settings", "id")).toMatchObject({ title: "Pengaturan", backTo: "/admin" });
  expect(staffNavigation("admin", "/settings/notifications/browser", "en"))
    .toMatchObject({ title: "Browser notifications", backTo: "/settings/notifications" });
});
