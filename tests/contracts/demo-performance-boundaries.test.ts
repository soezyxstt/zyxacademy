import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getTransitionConfig } from "@/components/ui/page-transition";

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
