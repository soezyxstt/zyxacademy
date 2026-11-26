import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  tabListClassName,
  tabListPageBarClassName,
  tabListStickyBarClassName,
} from "@/components/ui/tab-styles";

const ROOT = process.cwd();
const readRepoFile = (relPath: string) => readFileSync(join(ROOT, relPath), "utf8");

describe("Full-width horizontal tabs and single-sticky contract", () => {
  it("separates full-bleed page bar styling from sticky positioning", () => {
    expect(tabListPageBarClassName).toContain("-mx-(--page-gutter)");
    expect(tabListPageBarClassName).toContain("before:w-[100vw]");
    expect(tabListPageBarClassName).toContain("relative");
    expect(tabListPageBarClassName).not.toContain("sticky");

    expect(tabListStickyBarClassName).toContain("-mx-(--page-gutter)");
    expect(tabListStickyBarClassName).toContain("before:w-[100vw]");
    expect(tabListStickyBarClassName).toContain("sticky");

    expect(tabListClassName).not.toContain("-mx-(--page-gutter)");
    expect(tabListClassName).not.toContain("sticky");
  });

  it("enforces single sticky horizontal tab bar in globals.css", () => {
    const css = readRepoFile("app/globals.css");
    expect(css).toContain(
      "main:has([data-primary-mobile-tabs]) [data-application-page] [data-sticky-tabs-bar]"
    );
    expect(css).toContain("[role=\"tabpanel\"] [data-sticky-tabs-bar]");
    expect(css).toContain("position: relative;");
  });

  it("marks all primary mobile layout tab navs with primaryMobileNav", () => {
    for (const relPath of [
      "components/navigation/student/course-mobile-tab-nav.tsx",
      "components/navigation/tutor/tutor-mobile-course-tab-nav.tsx",
      "components/navigation/admin/admin-mobile-sub-tab-nav.tsx",
    ]) {
      const source = readRepoFile(relPath);
      expect(source).toContain("primaryMobileNav");
    }
  });

  it("keeps secondary page-level horizontal tabs full-width instead of downgrading to inline on mobile", () => {
    for (const relPath of [
      "app/(student)/courses/[id]/material/course-documents-client.tsx",
      "app/(tutor)/tutor/[courseId]/participants/participants-client.tsx",
      "app/(tutor)/tutor/[courseId]/quizzes/quizzes-client.tsx",
      "features/grading/ui/mobile/tryout-grading-mobile.tsx",
      "components/admin/material-workspace.tsx",
      "components/admin/idea-bundle-v2-panel.tsx",
    ]) {
      const source = readRepoFile(relPath);
      expect(source).not.toContain("mobileInline");
      expect(source).not.toMatch(/<TabsList[^>]*variant="inline"/);
      expect(source).not.toMatch(/<TabsList[^>]*variant=\{viewportMode === "mobile" \? "inline"/);
    }
  });
});
