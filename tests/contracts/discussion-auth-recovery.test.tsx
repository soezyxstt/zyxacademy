import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let session: { user: { id: string } } | null = null;
let provisioned = false, roleless = false, checked = false;
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => session }));
mock.module("@/lib/auth/legacy-identity", () => ({ ensureLegacyIdentity: async () => { await Promise.resolve(); provisioned = true; } }));
const checkRole = async () => { checked = true; expect(provisioned).toBe(true); return !roleless; };
mock.module("@/lib/auth/request-cache", () => ({ hasPeran: checkRole, hasAnyPeran: checkRole, listTutorAccessibleCourses: async () => [] }));
mock.module("@/db", () => ({ db: {} }));
mock.module("next/navigation", () => ({
 redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
 usePathname: () => "/",
 useRouter: () => ({}),
 useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/components/auth/sign-in-form", () => ({ SignInForm: () => null }));
mock.module("@/lib/site", () => ({ createMetadata: () => ({}) }));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => () => "" }));
mock.module("@/components/admin-sidebar", () => ({ AdminSidebar: () => null }));
mock.module("@/components/tutor/tutor-sidebar", () => ({ TutorSidebar: () => null }));
mock.module("@/components/application-shell", () => ({ ApplicationShell: () => null }));
mock.module("@/components/admin/ops-ai/ops-ai-drawer", () => ({ OpsAiDrawer: () => null }));
mock.module("@/components/admin/ops-ai/ops-ai-context", () => ({ OpsAiProvider: () => null }));
mock.module("@/components/mobile-navbar", () => ({ MobileNavbar: () => null }));
mock.module("@/components/navigation/admin", () => ({ AdminMobileBottomNav: () => null, AdminMobileSubTabNav: () => null, AdminMobileTopNav: () => null }));
mock.module("@/components/navigation/tutor", () => ({ TutorMobileBottomNav: () => null, TutorMobileCourseTabNav: () => null, TutorMobileTopNav: () => null }));
mock.module("@/components/command-menu", () => ({ CommandMenuProvider: () => null }));
const { proxy } = await import("@/proxy");
const { default: SignIn } = await import("@/app/(marketing)/sign-in/page");
const { default: AdminLayout } = await import("@/app/(admin)/layout");
const { default: TutorLayout } = await import("@/app/(tutor)/layout");

test("a stale cookie can reach sign-in while a verified session preserves the full discussion target", async () => {
 const target = "/discussions?thread=thread-1&message=message-450";
 const request = new NextRequest(`https://example.test/sign-in?next=${encodeURIComponent(target)}`, { headers: { cookie: "better-auth.session_token=stale" } });
 expect(proxy(request).headers.get("location")).toBeNull();
 const input = { searchParams: Promise.resolve({ next: target }) };
 session = null;
 expect((await SignIn(input)).props.callbackURL).toBe(target);
 session = { user: { id: "staff" } };
 await expect(SignIn(input)).rejects.toThrow(`REDIRECT:${target}`);
});

test("the staff guard awaits first-identity provisioning before checking roles and still denies roleless identities", async () => {
 session = { user: { id: "staff" } };
 for (const Layout of [AdminLayout, TutorLayout]) {
  provisioned = false; roleless = false; checked = false;
  await Layout({ children: null });
  expect(checked).toBe(true);
  provisioned = false; roleless = true; checked = false;
  await expect(Layout({ children: null })).rejects.toThrow("REDIRECT:/");
  expect(checked).toBe(true);
 }
});
