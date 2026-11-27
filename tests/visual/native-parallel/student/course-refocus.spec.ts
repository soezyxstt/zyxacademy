import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import { learningEndpoint, type MaterialDetailData, type MaterialListData } from "../../../../packages/native-parity/student/courses/contract";

const origin = "http://student-course-refocus.invalid";
const course = { id: "math", title: "Calculus", category: "", description: "", hasFullContentAccess: true };
const material = { id: "limits", title: "Private chapter", kind: "article", group: "materi", locked: false, completed: false } as const;
const detail: MaterialDetailData = { view: "material-detail", course, material };
const list: MaterialListData = { view: "material-list", course, chapters: [], materials: [{ ...material, chapterIds: [] }] };
const listPath = "/courses/math/material";
const detailPath = listPath + "/limits";

declare global {
  interface Window {
    courseRefocus: {
      render(focused?: boolean, initialScrollY?: number): void;
      reads(): { path: string; aborted: boolean }[];
      answer(index: number, status: number, body: unknown): Promise<void>;
      scroll(offset: number): void;
      savedScroll(): number;
    };
  }
}

// Run the course screen and authorized reader callback with real React state.
// Only the React Native primitives and unrelated sibling screens use DOM stand-ins.
const nativeViews: Plugin = {
  name: "student-course-native-views",
  setup(builder) {
    const modules: Record<string, string> = {
      "react-native": `import React from "react";
        const view = tag => ({ children, testID, accessibilityLabel, onPress }) =>
          React.createElement(tag, { "data-testid": testID, "aria-label": accessibilityLabel, onClick: onPress }, children);
        export const View = view("div"), Text = view("p"), Pressable = view("button");
        export const RefreshControl = ({ onRefresh }) => React.createElement("button", { onClick: onRefresh }, "Refresh");
        export const ScrollView = ({ children, testID, contentOffset, onScroll, refreshControl }) =>
          React.createElement("div", { "data-testid": testID, "data-offset": contentOffset?.y,
            onScroll: event => onScroll({ nativeEvent: { contentOffset: { y: event.currentTarget.scrollTop } } }) }, refreshControl, children);
        export const Dimensions = { get: () => ({ scale: 2.75 }) };
        export const Platform = { OS: "ios" }, StyleSheet = { create: value => value, hairlineWidth: 1 }, useColorScheme = () => "light";`,
      "react-native-svg": "export const SvgXml = () => null;",
      "../../shared-ui/navigation": `import React from "react";
        export const NavigationTabs = ({ tabs, activeId, onTabPress, testID }) => React.createElement("div", { "data-testid": testID, role: "tablist" },
          tabs.map(tab => React.createElement("button", { key: tab.id, role: "tab", "aria-selected": tab.id === activeId,
            onClick: () => onTabPress(tab.id) }, tab.label)));`,
      "../../shared-ui/navigation-icons": "export const NavigationIcon = () => null;",
      "./MaterialPdf": "export const MaterialPdf = () => null;",
      "./OnlineReading": "export const OnlineReading = () => null;",
      "./catalog": "export const Catalog = () => null;",
      "./dashboard-extra": "export const DashboardBottom = () => null, DashboardTop = () => null, useDashboardExtras = () => null;",
      "./dashboard-overview": "export const ActiveDashboardCourses = () => null, DashboardPreviewCourses = () => null, dashboardMessages = {};",
      "../ListRow": "export const StudentListRow = () => null;",
      "../../../components/Button": 'export { Pressable as Button } from "react-native";',
      "../../../components/Input": "export const Input = () => null;",
      "../../../components/Skeleton": "export const Skeleton = () => null;",
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

let compiled: Promise<string> | undefined;
function browserScript() {
  return compiled ??= build({
    stdin: {
      contents: `
        import { createRoot } from "react-dom/client";
        import { CourseScreen } from "./apps/mobile-native/features/student/courses";
        import { matchStudentRoute } from "./apps/mobile-native/features/student/routes";
        import { bindStudentRequest } from "./apps/mobile-native/features/student/transport";
        const session = { userId: "student-a", sessionId: "same-session", role: "student", locale: "en", origin: "${origin}" };
        const route = matchStudentRoute(location.pathname);
        const pending = [];
        const request = bindStudentRequest(session, (path, init) => new Promise(resolve => pending.push({ path, init, resolve })));
        const root = createRoot(document.getElementById("root"));
        const noop = () => {};
        let saved = 0;
        window.courseRefocus = {
          render(focused, initialScrollY = 0) {
            root.render(<CourseScreen {...{ session, route, request, focused, initialScrollY }}
              back={noop} navigate={noop} replace={noop} onScrollY={value => { saved = value; }}
              offlineCourse={{ status: "ready", course: { id: "math", title: "Offline course", materials: [] }, retry: noop }}
              renderMaterial={({ materialId }) => <p data-testid="authorized-reader">Reader for {materialId}</p>} />);
          },
          reads() { return pending.map(({ path, init }) => ({ path, aborted: init.signal.aborted })); },
          answer(index, status, body) {
            return new Promise(consumed => pending[index].resolve(Object.assign(Response.json(body, { status }), { dispose: consumed })));
          },
          scroll(offset) {
            const panel = document.querySelector('[data-testid="student-materials-list"]');
            Object.defineProperty(panel, "scrollTop", { value: offset, configurable: true });
            panel.dispatchEvent(new Event("scroll"));
          },
          savedScroll() { return saved; },
        };`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { react: resolve("node_modules/react") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [nativeViews],
  }).then(bundle => bundle.outputFiles[0].text);
}

async function openCourse(page: Page, path: string, focused?: boolean, initialScrollY?: number) {
  await page.route(origin + path, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
  await page.goto(origin + path);
  await page.addScriptTag({ content: await browserScript() });
  await page.evaluate(args => window.courseRefocus.render(...args), [focused, initialScrollY] as const);
  const reads = () => page.evaluate(() => window.courseRefocus.reads());
  return {
    reads,
    waitForReads: (count: number) => expect.poll(async () => (await reads()).length).toBe(count),
    focus: (focused: boolean) => page.evaluate(value => window.courseRefocus.render(value), focused),
    answer: (index: number, status: number, payload: unknown) =>
      page.evaluate(args => window.courseRefocus.answer(...args), [index, status, payload] as const),
  };
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "mobile-380", "Focus lifecycle does not depend on viewport.");
});

test("a mounted material reader withdraws before refocus and rejects a late grant after denial", async ({ page }) => {
  const { focus, reads, waitForReads, answer } = await openCourse(page, detailPath);
  const reader = page.getByTestId("authorized-reader");
  await waitForReads(1);
  await answer(0, 200, detail);
  await expect(reader).toHaveText("Reader for limits");

  await focus(false);
  await expect(reader).toHaveCount(0);
  await focus(true);
  await waitForReads(2);
  await expect(reader).toHaveCount(0);

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await waitForReads(3);
  await answer(2, 403, { code: "ACCESS_DENIED" });
  await expect(page.getByText("Course access unavailable", { exact: true })).toBeVisible();
  await answer(1, 200, detail);
  await expect(reader).toHaveCount(0);
  await expect(page.getByText(material.title, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Offline course", { exact: true })).toHaveCount(0);
  const endpoint = learningEndpoint({ view: "material-detail", courseId: course.id, materialId: material.id });
  expect(await reads()).toEqual([true, true, false].map(aborted => ({ path: endpoint, aborted })));

  await focus(false);
  await expect(page.locator("#root")).toBeEmpty();
  await focus(true);
  await waitForReads(4);
  await answer(3, 200, { ...detail, material: { ...material, locked: true } });
  await expect(page.getByTestId("student-material-locked")).toBeVisible();
  await expect(reader).toHaveCount(0);
});

test("Back restores the most recently reported materials list offset after authorization", async ({ page }) => {
  const { focus, waitForReads, answer } = await openCourse(page, listPath, true, 24);
  const panel = page.getByTestId("student-materials-list");
  await waitForReads(1);
  await answer(0, 200, list);
  await expect(page.getByTestId("student-material-limits")).toBeVisible();
  await expect(panel).toHaveAttribute("data-offset", "24");
  await page.evaluate(() => window.courseRefocus.scroll(146));
  expect(await page.evaluate(() => window.courseRefocus.savedScroll())).toBe(146);

  await focus(false);
  await expect(panel).toHaveCount(0);
  await focus(true);
  await waitForReads(2);
  await expect(panel).not.toHaveAttribute("data-offset");
  await answer(1, 200, list);
  await expect(panel).toHaveAttribute("data-offset", "146");

  await page.evaluate(() => window.courseRefocus.scroll(182));
  await page.getByRole("button", { name: "Refresh" }).click();
  await waitForReads(3);
  await expect(panel).not.toHaveAttribute("data-offset");
  await answer(2, 200, list);
  await expect(panel).toHaveAttribute("data-offset", "182");
});
