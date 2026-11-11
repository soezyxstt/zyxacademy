import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getTransitionConfig } from "@/components/ui/page-transition";
import ts from "typescript";

test("demo routes use the app transition, including localized routes and reduced motion", () => {
  for (const route of ["/demo", "/demo/video", "/en/demo", "/en/demo/path", "/id/demo/mastery"]) {
    expect(getTransitionConfig(route, false)).toEqual({ duration: 0.2, initialY: 6, isStudent: true });
    expect(getTransitionConfig(route, true)).toEqual({ duration: 0, initialY: 0, isStudent: true });
  }
  expect(readFileSync("components/ui/page-transition.tsx", "utf8")).toContain("initial={reduceMotion || isAppSurface ? false");
  for (const route of ["/demonstration", "/en/demonstration", "/en/demo-other"]) {
    expect(getTransitionConfig(route, false).isStudent).toBe(false);
  }
});

test("demo student features are split by conditional client imports with a visible loading state", () => {
  const source = readFileSync("components/demo/demo-student-pages.tsx", "utf8");
  for (const module of ["course-videos-client", "/live/page", "student-profile-view", "settings-client", "study-path-timeline", "concept-graph-view", "concept-map"]) {
    expect(source).toMatch(new RegExp(`dynamic\\(\\(\\) => import\\([^\\n]*${module}`));
  }
  expect(source).toContain('role="status"');
  expect(source).toContain('aria-busy="true"');
  expect(source).not.toContain("ssr: false");
});

test("demo dynamic imports pass literal options to the Next compiler", () => {
  const source = readFileSync("components/demo/demo-student-pages.tsx", "utf8");
  const file = ts.createSourceFile("demo-student-pages.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let imports = 0;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "dynamic") {
      imports++;
      expect(node.arguments.length).toBe(2);
      const options = node.arguments[1];
      expect(ts.isObjectLiteralExpression(options)).toBe(true);
      if (ts.isObjectLiteralExpression(options)) {
        expect(options.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(file) === "loading" && property.initializer.getText(file) === "DemoFeatureLoading")).toBe(true);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(imports).toBeGreaterThan(0);
});
