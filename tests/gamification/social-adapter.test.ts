import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.ZYX_TEST_DEPS ? `${process.env.ZYX_TEST_DEPS}/package.json` : import.meta.url);
const { transformSync } = require("esbuild");

function adapter() {
  const calls: string[] = [];
  let failure = false;
  const action = (kind: string) => async (id: string) => { if (failure) throw new Error("Unavailable"); calls.push(`${kind}:${id}`); };
  const dependencies: Record<string, unknown> = {
    react: { createContext: (value: unknown) => ({ value }), useContext: (context: { value: unknown }) => context.value },
    "@/lib/gamification/social-actions": {
      followStudentAction: action("follow"), unfollowStudentAction: action("unfollow"), removeFollowerAction: action("remove"),
      getPublicStudentProfileAction: action("profile"), getStudentFollowListAction: action("list"), searchVisibleStudentsAction: action("search"),
    },
  };
  const module = { exports: {} as any };
  const { code } = transformSync(readFileSync("components/gamification/social-provider.tsx", "utf8"), { loader: "tsx", format: "cjs" });
  Function("require", "module", "exports", code)((id: string) => { if (!(id in dependencies)) throw new Error(id); return dependencies[id]; }, module, module.exports);
  return { value: module.exports.useStudentSocial(), calls, fail: () => { failure = true; } };
}

test("successful live relationship changes notify lists, failures do not and unsubscribe cleans up", async () => {
  const { value, calls, fail } = adapter();
  let updates = 0;
  const unsubscribe = value.subscribe(() => updates++);
  await value.follow("public"); await value.unfollow("public"); await value.removeFollower("public");
  expect(calls).toEqual(["follow:public", "unfollow:public", "remove:public"]);
  expect(updates).toBe(3);
  unsubscribe(); await value.follow("another"); expect(updates).toBe(3);
  value.subscribe(() => updates++); fail();
  await expect(value.unfollow("public")).rejects.toThrow("Unavailable"); expect(updates).toBe(3);
});

test("live profile links preserve access to moderation, demo adapters cannot fall through", () => {
  const { value } = adapter();
  expect(value.profileHref("public/id")).toBe("/students/public%2Fid");
  expect(readFileSync("components/gamification/student-identity.tsx", "utf8")).toContain("social.profileHref(publicId)");
  expect(readFileSync("components/demo/demo-gamification-provider.tsx", "utf8")).not.toContain("profileHref");
  expect(readFileSync("app/(student)/students/[publicId]/page.tsx", "utf8")).toContain("<SocialControls");
});
