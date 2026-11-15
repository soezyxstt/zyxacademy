import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.ZYX_TEST_DEPS ? `${process.env.ZYX_TEST_DEPS}/package.json` : import.meta.url);
const { transformSync } = require("esbuild") as typeof import("esbuild");
import { peopleSearchPattern } from "../../lib/gamification/social-contracts";

test("people searches are bounded and wildcard characters are literal", () => {
  expect(peopleSearchPattern("  Rani  ")).toBe("%Rani%");
  expect(peopleSearchPattern("a%_\\b")).toBe("%a\\%\\_\\\\b%");
  for (const value of ["", "a", "x".repeat(81), null, 23]) expect(peopleSearchPattern(value)).toBeNull();
});

type Fragment = { text: string; values: unknown[] };
function fixture(allowed = true, baseXpMicro: number | null = null) {
  const queries: Fragment[] = [];
  const tag = (parts: TemplateStringsArray, ...values: unknown[]): Fragment => {
    const result: Fragment = { text: parts[0], values: [] };
    values.forEach((value, index) => {
      if (value && typeof value === "object" && "text" in value) {
        const nested = value as Fragment;
        result.text += nested.text;
        result.values.push(...nested.values);
      } else {
        result.text += "?";
        result.values.push(value);
      }
      result.text += parts[index + 1];
    });
    return result;
  };
  tag.raw = (text: string): Fragment => ({ text, values: [] });
  tag.join = (items: Fragment[], separator: Fragment): Fragment => items.reduce((out, item, index) => ({ text: out.text + (index ? separator.text : "") + item.text, values: [...out.values, ...item.values] }), { text: "", values: [] });
  const row = { user_id: "internal", public_id: "public", display_name: "Rani", image: null, rank_key: "bupati", equipped_frame_id: null, equipped_theme_id: null, equipped_zyra_avatar_id: "zyra-avatar-jalak", email: "private@example.test", base_xp_micro: baseXpMicro, earned_badges: [], featured_badge_ids: [], follower_count: 0, following_count: 0, allow_follows: false };
  const db = { execute: async (query: Fragment) => { queries.push(query); return { rows: query.text.startsWith('select 1 from "user"') ? [{ ok: 1 }] : [row] }; } };
  const deps: Record<string, unknown> = {
    "server-only": {}, "drizzle-orm": { sql: tag }, "@/db": { db },
    "./access": { requireStudentGamificationAccess: async () => { if (!allowed) throw new Error("Forbidden"); return { user: { id: "viewer" } }; } },
    "./social-contracts": { peopleSearchPattern },
  };
  const source = transformSync(readFileSync("lib/gamification/social.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  Function("require", "module", "exports", source)((id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; }, module, module.exports);
  return { social: module.exports, queries };
}

function expectVisibility(query: Fragment) {
  expect(query.text).toContain("p.visibility = 'members'");
  expect(query.text).toContain("r.code = 'murid'");
  expect(query.text).toContain("r.code in ('admin','tutor')");
  expect(query.text).toContain("p.status = 'active'");
  expect(query.text).toContain("b.blocker_id");
  expect(query.text).toContain("b.blocked_id");
  expect(query.values.filter(value => value === "viewer").length).toBe(2);
}

test("directory and roster lookups use student, visibility and mutual block predicates", async () => {
  const { social, queries } = fixture();
  const results = await social.searchVisibleStudents("viewer", "R%ni");
  expect(results).toEqual([{ publicId: "public", displayName: "Rani", avatarUrl: null, rankKey: "bupati", equippedFrameId: null, equippedThemeId: null }]);
  const search = queries.at(-1)!;
  expectVisibility(search);
  expect(search.text).toContain("limit 10");
  expect(search.values).toContain("%R\\%ni%");
  expect(search.text).not.toContain("R%ni");
  expect(search.text).not.toContain("u.email");
  const identities = await social.getVisibleStudentIdentities("viewer", ["internal", "internal"]);
  expect(identities.get("internal")).toEqual(results[0]);
  const roster = queries.at(-1)!;
  expectVisibility(roster);
  expect(roster.values.filter(value => value === "internal")).toHaveLength(1);
});

test("student access is required and invalid searches perform no directory query", async () => {
  const denied = fixture(false);
  await expect(denied.social.searchVisibleStudents("viewer", "Rani")).rejects.toThrow("Forbidden");
  await expect(denied.social.getVisibleStudentIdentities("viewer", ["internal"])).rejects.toThrow("Forbidden");
  expect(denied.queries).toHaveLength(0);
  const invalid = fixture();
  expect(await invalid.social.searchVisibleStudents("viewer", "%")).toEqual([]);
  expect(invalid.queries).toHaveLength(0);
  await expect(invalid.social.searchVisibleStudents("forged", "Rani")).rejects.toThrow("Forbidden");
});


test("profile exposes only base XP selected by leaderboard consent", async () => {
  for (const value of [null, 40000000]) {
    const { social, queries } = fixture(true, value);
    const profile = await social.getPublicStudentProfile("viewer", "public");
    expect(profile.baseXpMicro).toBe(value);
    expect(profile.equippedZyraAvatarId).toBe("zyra-avatar-jalak");
    expect(profile).not.toHaveProperty("email");
    const query = queries.at(-1)!;
    expect(query.text).toContain("case when p.leaderboard_opt_in then coalesce(a.base_xp_micro, 0) end as base_xp_micro");
    expect(query.text).not.toContain("bonus_xp_micro");
    expect(query.text).toContain("p.visibility='members'");
    expect(query.text).toContain("i.user_id=p.user_id and i.cosmetic_id=p.equipped_zyra_avatar_id and c.slot='zyra_avatar'");
    expect(query.text).toContain("then p.equipped_zyra_avatar_id end as equipped_zyra_avatar_id");
    expect(query.text).toContain("r.code = 'murid'");
    expect(query.text).toContain("b.blocker_id");
    expect(query.text).toContain("b.blocked_id");
  }
});

test("the global search UI only offers student profiles on a student account", () => {
  const code = transformSync(readFileSync("components/student-account-boundary.tsx", "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const module = { exports: {} as { isStudentSocialAccount: (state: unknown) => boolean } };
  Function("require", "module", "exports", code)((id: string) => {
    if (id === "@/lib/auth-client") return { useSession: () => null };
    if (id === "@/components/student-experience-provider") return { useStudentExperience: () => ({ mode: "student" }) };
    return require(id);
  }, module, module.exports);
  const check = (role?: string, roles?: string[]) => module.exports.isStudentSocialAccount({ data: { user: { role, roles } } });
  expect(check("student")).toBe(true);
  expect(check("admin", ["murid"])).toBe(true);
  expect(check("student", ["murid", "admin"])).toBe(false);
  expect(check("student", ["murid", "tutor"])).toBe(false);
  expect(check("admin")).toBe(false);
  expect(module.exports.isStudentSocialAccount({ data: null })).toBe(false);
});
