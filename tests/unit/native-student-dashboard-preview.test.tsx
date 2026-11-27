import { expect, test } from "bun:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type ReactNode } from "react";
import { learningEndpoint, type DashboardData, type DashboardPreview } from "../../packages/native-parity/student/courses/contract";
import { createStudentFixtureRequest } from "../../packages/native-parity/student/fixture-request";

type PreviewProps = {
  preview: DashboardPreview;
  locale: "id" | "en";
  theme: "light";
  navigate(path: string): void;
  offerLabel(): undefined;
};

test("dashboard free previews render and open the allowed first material without Intl.PluralRules", async () => {
  const bundle = await build({
    entryPoints: ["apps/mobile-native/features/student/courses/dashboard-overview.tsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["react"],
    jsx: "automatic",
    tsconfigRaw: {},
    loader: { ".ttf": "empty" },
    plugins: [{
      name: "native-dashboard-primitives",
      setup(builder) {
        builder.onResolve({ filter: /^react-native(-svg)?$/ }, ({ path }) => ({ path, namespace: "native-dashboard" }));
        builder.onResolve({ filter: /device\/appearance$/ }, ({ path }) => ({ path, namespace: "native-dashboard-appearance" }));
        builder.onLoad({ filter: /.*/, namespace: "native-dashboard-appearance" }, () => ({
          contents: `
            export const useNativeAppearance = () => ({ fontSize: "medium", density: "comfortable" });
            export const readingFontScales = { small: 0.92, medium: 1, large: 1.12 };
            export const readingDensityScales = { compact: 0.85, comfortable: 1, spacious: 1.15 };
            export const scaleReadingText = (_scale, style) => style;
          `,
        }));
        builder.onLoad({ filter: /.*/, namespace: "native-dashboard" }, ({ path }) => ({
          contents: path === "react-native-svg" ? 'export default "Svg"; export const Path = "Path"; export const Rect = "Rect";' : `
            export const View = "View", Text = "Text", Pressable = "Pressable", ActivityIndicator = "ActivityIndicator";
            export const StyleSheet = { hairlineWidth: 1, create: styles => styles };
            export const Platform = { select: options => options.android };
            export const useColorScheme = () => "light";
          `,
        }));
      },
    }],
  });
  const harnessModule: { exports: { DashboardPreviewCourses?: (props: PreviewProps) => ReactNode } } = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    module: harnessModule,
    require: createRequire(import.meta.url),
    Intl: { NumberFormat: Intl.NumberFormat },
  });
  const { DashboardPreviewCourses } = harnessModule.exports;
  if (!DashboardPreviewCourses) throw new Error("Expected the production dashboard preview component");
  const previews = await Promise.all(["dashboard-parity-unenrolled", "dashboard-parity-revoked"].map(async scenario => {
    const request = createStudentFixtureRequest(scenario);
    const response = await request(learningEndpoint({ view: "dashboard" }));
    const data: DashboardData = await response.json();
    expect(data.enrolled).toEqual([]);
    if (!data.preview) throw new Error("Expected a free dashboard preview");
    return { ...data.preview, courses: data.preview.courses.map(course => ({ ...course, freeMaterialCount: 2 })) };
  }));
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
});
