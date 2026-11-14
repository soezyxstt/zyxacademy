import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("quiz diagnosis shows supplied observations without inventing empty-section conclusions", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("components/course/quiz-analytics-view.tsx", "utf8");
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    react: { useState: (value: unknown) => [value, () => {}], useEffect: () => {}, useCallback: (fn: unknown) => fn },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/i18n/client": { useTranslations: () => (key: string) => key },
    "@/components/student-experience-provider": { useStudentExperience: () => ({ href: (path: string) => path }) },
  };
  const module = { exports: {} as any };
  runInNewContext(transformSync(source, { loader: "tsx", jsx: "automatic", format: "cjs" }).code, {
    module, exports: module.exports, require: (name: string) => dependencies[name] ?? {},
  });
  const render = (diagnosis: unknown) => JSON.stringify(module.exports.QuizAnalyticsView({ courseId: "1", attemptId: "1", initialData: { status: "completed", aiDiagnosis: diagnosis } }));
  const empty = render({ headline: "Result", strengths: [], focus_areas: [] });
  expect(empty).not.toContain("quizAnalytics.strengths");
  expect(empty).not.toContain("quizAnalytics.focusAreas");
  expect(empty).not.toContain("quizAnalytics.detailedTitle");
  const supplied = render({ headline: "Result", strengths: [{ title: "Observed strength", description: "Evidence retained" }], focus_areas: [{ title: "Practice target", description: "Specific observation", importance: "Foundation" }] });
  expect(supplied).toContain("Observed strength");
  expect(supplied).toContain("Evidence retained");
  expect(supplied).toContain("Practice target");
  expect(supplied).not.toContain("quizAnalytics.strengthsEmpty");
  expect(supplied).not.toContain("quizAnalytics.focusAreasEmpty");
});
