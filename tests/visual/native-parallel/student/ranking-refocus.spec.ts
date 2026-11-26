import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import type { CourseRanking } from "../../../../packages/native-parity/student/community/contracts";

const origin = "http://student-ranking-refocus.invalid";
const route = "/courses/math/leaderboard?type=simulation";
const endpoint = "/api/native/student/community/course-ranking?id=math&type=simulation";
const board: CourseRanking = {
  course: { id: "math", title: "Calculus" }, assessment: "simulation", totalStudents: 1, ownRank: 1,
  rows: [{ rank: 1, name: "Private ranking row", average: 94, attempts: 1, identity: null, isSelf: false,
    averageDurationSeconds: 45, correctHardCount: 1, attemptedMediumCount: 2 }],
};

declare global {
  interface Window {
    rankingRefocus: {
      render(focused?: boolean): void;
      reads(): { path: string; aborted: boolean }[];
      answer(index: number, status: number, payload: unknown): Promise<void>;
      destinations: string[];
    };
  }
}

const primitives: Plugin = {
  name: "student-ranking-native-views",
  setup(builder) {
    const modules: Record<string, string> = {
      "react-native": `import React from "react";
        const view = tag => ({ children, testID, accessibilityLabel, accessibilityRole, onPress }) =>
          React.createElement(tag, { "data-testid": testID, "aria-label": accessibilityLabel, role: accessibilityRole === "header" ? "heading" : undefined, onClick: onPress }, children);
        export const View = view("div"), Text = view("span"), Pressable = view("button"), ScrollView = view("div"), Image = view("div");
        export const ActivityIndicator = ({accessibilityLabel}) => React.createElement("span", {role:"progressbar", "aria-label":accessibilityLabel}, accessibilityLabel);
        export const Platform = {OS:"ios"}, StyleSheet = {create: value => value, hairlineWidth: 1}, useColorScheme = () => "light";`,
      "../ListRow": `import React from "react"; export const StudentListRow = ({title}) => React.createElement("div", null, title);`,
      "../../shared-ui": `import React from "react";
        export const NavigationTabs = ({tabs,activeId,onTabPress}) => React.createElement("div",null,...tabs.map(tab =>
          React.createElement("button",{key:tab.id,"aria-pressed":tab.id===activeId,onClick:()=>onTabPress(tab.id)},tab.label)));
        export const SharedPopover = () => null;`,
      "../../../components/Button": 'export { Pressable as Button } from "react-native";',
      "../../../components/Input": "export const Input = () => null;",
      "../../../components/Switch": "export const Switch = () => null;",
      "../../../typography": "export const nativeTypography = {};",
    };
    builder.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(modules, args.path)) return { path: args.path, namespace: "native-views" };
    });
    builder.onLoad({ filter: /.*/, namespace: "native-views" }, args => ({
      contents: modules[args.path], loader: "js", resolveDir: process.cwd(),
    }));
  },
};

test("course ranking checks access again on focus and suppresses stale rows and denials", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-380", "Focus lifecycle does not depend on viewport.");
  const bundle = await build({
    stdin: {
      contents: `
        import { createRoot } from "react-dom/client";
        import { CommunityProvider } from "./apps/mobile-native/features/student/community/ui";
        import { CourseLeaderboardScreen } from "./apps/mobile-native/features/student/community/ranking";
        import { matchStudentRoute } from "./apps/mobile-native/features/student/routes";
        const session = {userId:"student",sessionId:"same-session",role:"student",locale:"en",origin:"${origin}"};
        const route = matchStudentRoute(location.pathname + location.search);
        const pending = [];
        const destinations = [];
        const request = (path, init) => new Promise(resolve => pending.push({path, init, resolve}));
        const root = createRoot(document.getElementById("root"));
        const noop = () => {};
        window.rankingRefocus = {
          render(focused) {
            root.render(<CommunityProvider props={{session,route,request,focused,initialScrollY:0,onScrollY:noop,
              back:noop,replace:noop,navigate:path=>destinations.push(path)}}><CourseLeaderboardScreen /></CommunityProvider>);
          },
          reads() { return pending.map(({path,init})=>({path,aborted:init.signal.aborted})); },
          async answer(index,status,payload) {
            pending[index].resolve(Response.json(payload,{status}));
            await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
          },
          destinations,
        };`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { react: resolve("node_modules/react") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [primitives],
  });
  await page.route(origin + route, request => request.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
  await page.goto(origin + route);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const focus = (focused: boolean) => page.evaluate(value => window.rankingRefocus.render(value), focused);
  const reads = () => page.evaluate(() => window.rankingRefocus.reads());
  const waitForReads = (length: number) => expect.poll(async () => (await reads()).length).toBe(length);
  const reply = (index: number, status: number, payload: unknown) =>
    page.evaluate(args => window.rankingRefocus.answer(...args), [index, status, payload] as const);
  const oldRow = page.getByText("#1 Private ranking row", { exact: true });
  const blocked = page.getByText("Content is unavailable or access has changed.", { exact: true });
  const loading = page.getByRole("progressbar", { name: "Loading" });
  const tryout = page.getByRole("button", { name: "Tryout", exact: true });

  await focus(true);
  await waitForReads(1);
  await reply(0, 200, board);
  await expect(oldRow).toBeVisible();
  await expect(tryout).toHaveAttribute("aria-pressed", "true");

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await waitForReads(2);
  await expect(loading).toBeVisible();
  await expect(oldRow).toHaveCount(0);
  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();

  await focus(true);
  await waitForReads(3);
  await reply(2, 403, { code: "forbidden" });
  await expect(blocked).toBeVisible();
  await reply(1, 200, board);
  await expect(blocked).toBeVisible();
  await expect(oldRow).toHaveCount(0);
  await page.getByRole("button", { name: "Activate class" }).click();
  expect(await page.evaluate(() => window.rankingRefocus.destinations)).toEqual(["/courses/math"]);

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await waitForReads(4);
  await expect(loading).toBeVisible();
  await expect(blocked).toHaveCount(0);
  await reply(3, 200, { ...board, rows: [{ ...board.rows[0], name: "Fresh ranking row" }] });
  await expect(page.getByText("#1 Fresh ranking row", { exact: true })).toBeVisible();
  await expect(oldRow).toHaveCount(0);
  await expect(tryout).toHaveAttribute("aria-pressed", "true");
  expect(await reads()).toEqual([true, true, true, false].map(aborted => ({ path: endpoint, aborted })));
});
