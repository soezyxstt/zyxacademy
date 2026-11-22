import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
// Load the real server functions without sharing module mocks with other tests.
function load(file: string, dependencies: Record<string, unknown>) {
 const module = { exports: {} as any };
 const { code } = transformSync(readFileSync(file, "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" });
 Function("require", "module", "exports", code)((id: string) => {
  if (Object.hasOwn(dependencies, id)) return dependencies[id];
  if (id.startsWith("@/")) throw new Error(`Missing test dependency: ${id}`);
  return require(id);
 }, module, module.exports);
 return module.exports;
}

function accessFixture({ role = "student", status, roles = [], membership = roles.length > 0, anonymous = false, databaseFailure = false }: {
 role?: string; status?: string; roles?: string[]; membership?: boolean; anonymous?: boolean; databaseFailure?: boolean;
} = {}) {
 const session = anonymous ? null : { user: { id: "viewer", role } };
 return load("lib/gamification/access.ts", {
  "server-only": {},
  "@/lib/auth-session": { getAuthSession: async () => session },
  "@/lib/auth/authorization": { getPeranCodes: async () => roles },
  "@/lib/auth/admin-guards": { assertAdmin: () => {} },
  "@/db/schema": { pengguna: { id: "identity" }, penggunaPeran: { penggunaId: "membership" } },
  "drizzle-orm": { eq: () => null },
  "@/db": { db: { select: () => ({ from: (table: { id?: string }) => ({ where: () => ({ limit: async () => {
   if (databaseFailure) throw new Error("DATABASE_UNAVAILABLE");
   return table.id === "identity" ? (status ? [{ id: "viewer", status }] : []) : (membership ? [{ id: "membership" }] : []);
  } }) }) }) } },
 });
}

test("only eligible students receive gamification access, canonical roles override legacy projections", async () => {
 for (const input of [{}, { status: "active", roles: ["murid"] }, { role: "admin", status: "active", roles: ["murid"] }]) {
  const access = accessFixture(input);
  expect((await access.getStudentGamificationAccess()).user.id).toBe("viewer");
  expect((await access.requireStudentGamificationAccess()).user.id).toBe("viewer");
 }
 for (const input of [
  { role: "admin" }, { role: "teacher" }, { status: "active", roles: ["admin", "tutor"] },
  { status: "active", roles: ["murid", "admin"] }, { status: "active", roles: ["murid", "tutor"] },
  { status: "suspended", roles: ["murid"] }, { status: "active", roles: [] }, { roles: ["murid"] },
 ]) {
  const access = accessFixture(input);
  expect(await access.getStudentGamificationAccess()).toBeNull();
  await expect(access.requireStudentGamificationAccess()).rejects.toThrow("Forbidden");
 }
 const anonymous = accessFixture({ anonymous: true });
 expect(await anonymous.getStudentGamificationAccess()).toBeNull();
 await expect(anonymous.requireStudentGamificationAccess()).rejects.toThrow("Unauthorized");
 await expect(accessFixture({ databaseFailure: true }).getStudentGamificationAccess()).rejects.toThrow("DATABASE_UNAVAILABLE");
});

const Group = ({ children }: any) => <div>{children}</div>;
const ProfileHero = ({ name, actions }: any) => <section>{name}{actions}</section>;
const user = { id: "viewer", name: "Akun staging", email: "fixture@example.invalid" };

function pageFixture(student: boolean) {
 const calls: string[] = [];
 const guarded = (name: string, value: unknown) => async () => {
  calls.push(name);
  if (!student) throw new Error("Forbidden");
  return value;
 };
 const common = {
  "next/headers": { headers: async () => new Headers() },
  "next/navigation": { redirect: () => { throw new Error("REDIRECT"); } },
  "next/link": { __esModule: true, default: ({ href, children }: any) => <a href={href}>{children}</a> },
  "@/lib/auth": { auth: { api: { getSession: async () => ({ user }) } } },
  "@/db": { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [user] }) }) }) } },
  "@/db/schema": { user: { id: "viewer" } },
  "drizzle-orm": { eq: () => null },
  "@/lib/site": { createMetadata: () => ({}), pageTitle: (title: string) => title },
  "@/lib/i18n/server": { getTranslations: async () => (key: string) => key, getAppLocale: async () => "id" },
  "@/components/application-page": { ApplicationPage: Group },
  "@/components/page-header": { PageHeader: () => <h1>Profil</h1> },
  "@/components/ui/button": { Button: Group },
  "@/components/ui/reveal": { Reveal: Group },
  "@/components/i18n/translated-text": { TranslatedText: () => null },
  "@/components/gamification/profile-hero": { ProfileHero },
  "@/components/gamification/achievement-board": { profileBadgeFamilies: [] },
  "@/components/student-profile-view": { StudentProfileView: ({ zyraAvatarId }: { zyraAvatarId?: string }) => <div data-mascot={zyraAvatarId}>Student profile</div> },
  "@/components/gamification/profile-follow-list": { ProfileFollowList: () => null },
  "@/components/gamification/profile-settings": { ProfileSettings: ({ academicForm }: { academicForm?: React.ReactNode }) => <div>Student customization{academicForm}</div> },
  "./profile-edit-form": { ProfileEditForm: () => <form>Academic profile</form> },
  "./profile-completeness": { ProfileCompleteness: () => null },
  "@/lib/gamification/access": { getStudentGamificationAccess: async () => student ? { user } : null },
  "@/lib/gamification/social": { getStudentSocialSettings: guarded("social", { featuredBadgeIds: [] }) },
  "@/lib/gamification/queries": {
   getAchievementBadges: guarded("badges", []), getGamificationRewards: guarded("rewards", [{ id: "zyra-avatar-jalak", slot: "zyra_avatar", equipped: true, owned: true }]),
   getGamificationSummary: guarded("summary", { rankKey: "rakyat", baseXpMicro: 0, bonusXpMicro: 0, lpBalance: 0 }),
  },
  "@/lib/gamification/profile-aggregate": { getPrivateProfileAggregates: guarded("stats", {}) },
  "@/lib/student/course-catalog": { listStudentEnrollments: guarded("enrollments", []) },
  "@/lib/gamification/labels": { cosmeticNameKeys: {}, rankLabels: { rakyat: "Rakyat" } },
  "@/lib/gamification/catalog": { MICRO: 1_000_000 },
  "./artwork": { RankArtwork: () => null },
  "./dashboard-summary-content": { DashboardSummaryContent: () => <div>Summary</div> },
 };
 return { calls, common };
}

for (const student of [false, true]) {
 test(`profile and edit preserve basic account access, student features enabled=${student}`, async () => {
  const fixture = pageFixture(student);
  const page = load("app/(student)/profile/page.tsx", fixture.common).default;
  const html = renderToStaticMarkup(await page());
  expect(html).toContain(student ? "Student profile" : "Akun staging");
  if (!student) expect(html).toContain('href="/settings?tab=profile"');
  else expect(html).toContain('data-mascot="zyra-avatar-jalak"');
  const editor = load("app/(student)/profile/edit/profile-editor.tsx", fixture.common);
  const edit = load("app/(student)/profile/edit/page.tsx", { ...fixture.common, "./profile-editor": editor }).default;
  const editHtml = renderToStaticMarkup(await edit());
  expect(editHtml).toContain("Academic profile");
  expect(editHtml.includes("Student customization")).toBe(student);
  expect(fixture.calls.length > 0).toBe(student);
 });
 test(`dashboard summary handles student access=${student} without authorization errors`, async () => {
  const fixture = pageFixture(student);
  const { GamificationDashboardSummary } = load("components/gamification/dashboard-summary.tsx", fixture.common);
  expect(Boolean(await GamificationDashboardSummary({ userId: user.id }))).toBe(student);
  expect(fixture.calls).toEqual(student ? ["summary"] : []);
  expect(await GamificationDashboardSummary({ userId: "someone-else" })).toBeNull();
 });
}

test("a staff profile has no fictional student rank, while student ranks remain visible", () => {
 const { ProfileHero } = load("components/gamification/profile-hero.tsx", {
  "./student-avatar": { StudentAvatar: () => <span>Avatar</span> },
  "./artwork": { RankArtwork: () => <span>Rank</span> },
  "./profile-mascot": { ProfileMascot: () => null },
 });
 expect(renderToStaticMarkup(<ProfileHero name="Staff" />)).not.toContain("Rank");
 expect(renderToStaticMarkup(<ProfileHero name="Student" rank="rakyat" />)).toContain("rakyat");
});
