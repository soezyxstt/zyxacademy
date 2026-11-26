import { expect, test } from "bun:test";
import { build } from "esbuild";
import { Children, isValidElement, type ReactNode } from "react";
import { learningEndpoint, type DashboardData } from "../../packages/native-parity/student/courses/contract";
import { createStudentFixtureRequest } from "../../packages/native-parity/student/fixture-request";

test("dashboard free previews render and open the allowed first material without Intl.PluralRules", async () => {
  const bundle = await build({
    entryPoints: ["apps/mobile-native/features/student/courses/dashboard-overview.tsx"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    loader: { ".ttf": "empty" },
    plugins: [{
      name: "native-dashboard-primitives",
      setup(builder) {
        builder.onResolve({ filter: /^react-native(-svg)?$/ }, ({ path }) => ({ path, namespace: "native-dashboard" }));
        builder.onLoad({ filter: /.*/, namespace: "native-dashboard" }, ({ path }) => ({
          contents: path === "react-native-svg" ? 'export default "Svg"; export const Path = "Path";' : `
            export const View = "View", Text = "Text", Pressable = "Pressable", ActivityIndicator = "ActivityIndicator";
            export const StyleSheet = { hairlineWidth: 1, create: styles => styles };
            export const Platform = { select: options => options.android };
            export const useColorScheme = () => "light";
          `,
        }));
      },
    }],
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`;
  const { DashboardPreviewCourses }: typeof import("../../apps/mobile-native/features/student/courses/dashboard-overview") = await import(moduleUrl);
  const previews = await Promise.all(["dashboard-parity-unenrolled", "dashboard-parity-revoked"].map(async scenario => {
    const request = createStudentFixtureRequest(scenario);
    const response = await request(learningEndpoint({ view: "dashboard" }));
    const data: DashboardData = await response.json();
    expect(data.enrolled).toEqual([]);
    if (!data.preview) throw new Error("Expected a free dashboard preview");
    return { ...data.preview, courses: data.preview.courses.map(course => ({ ...course, freeMaterialCount: 2 })) };
  }));
  const pluralRules = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
  try {
    Object.defineProperty(Intl, "PluralRules", { configurable: true, value: undefined });
    for (const preview of previews) {
      for (const [locale, labels, cta] of [
        ["id", ["1 bab gratis", "2 materi", "0 kuis"], "Mulai bab 1"],
        ["en", ["1 free chapter", "2 materials", "0 quizzes"], "Start chapter 1"],
      ] as const) {
        const destinations: string[] = [];
        const labelsRendered: string[] = [];
        const actions = new Map<string, () => void>();
        const collect = (node: ReactNode) => Children.forEach(node, child => {
          if (typeof child === "string") labelsRendered.push(child);
          if (!isValidElement<{ children?: ReactNode; testID?: string; onPress?: () => void }>(child)) return;
          const { children, testID, onPress } = child.props;
          if (testID && onPress) actions.set(testID, onPress);
          collect(children);
        });
        collect(DashboardPreviewCourses({ preview, locale, theme: "light", navigate: path => destinations.push(path), offerLabel: () => undefined }));
        expect(labelsRendered).toEqual(expect.arrayContaining([...labels, cta]));
        const start = actions.get("student-dashboard-first-chapter-matematika-1");
        if (!start) throw new Error("Expected a first-chapter action");
        start();
        expect(destinations).toEqual(["/courses/matematika-1/material/dokumen-1"]);
      }
    }
  } finally {
    if (pluralRules) Object.defineProperty(Intl, "PluralRules", pluralRules);
    else Reflect.deleteProperty(Intl, "PluralRules");
  }
});
