import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("student course Suspense boundary and tailored skeleton contracts", () => {
  it("keeps a shared loading boundary for work before page Suspense boundaries", () => {
    expect(existsSync(join(ROOT, "app/(student)/courses/[id]/loading.tsx"))).toBe(true);
    const obsoleteLoadingFiles = [
      "app/(student)/courses/[id]/material/loading.tsx",
      "app/(student)/courses/[id]/material/[materialId]/loading.tsx",
      "app/(student)/courses/[id]/progress/loading.tsx",
      "app/(student)/courses/[id]/mastery/loading.tsx",
    ];

    for (const file of obsoleteLoadingFiles) {
      expect(existsSync(join(ROOT, file))).toBe(false);
    }
  });

  it("keeps CoursePageShell outside Suspense and uses tailored skeletons on every course sub-page", () => {
    const pageContracts: Array<{
      path: string;
      skeleton: string;
    }> = [
      {
        path: "app/(student)/courses/[id]/page.tsx",
        skeleton: "CourseOverviewPrimaryActionsSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/material/page.tsx",
        skeleton: "CourseMaterialListSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/progress/page.tsx",
        skeleton: "CourseProgressContentSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/mastery/page.tsx",
        skeleton: "CourseMasteryContentSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/quiz/page.tsx",
        skeleton: "CourseQuizListSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/tryout/page.tsx",
        skeleton: "CourseTryoutListSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/flashcard/page.tsx",
        skeleton: "CourseFlashcardSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/video/page.tsx",
        skeleton: "CourseVideoListSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/leaderboard/page.tsx",
        skeleton: "CourseLeaderboardContentSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/my-results/page.tsx",
        skeleton: "CourseMyResultsListSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/path/page.tsx",
        skeleton: "CourseStudyPathSkeleton",
      },
      {
        path: "app/(student)/courses/[id]/concept/[slug]/page.tsx",
        skeleton: "CourseConceptExplorerSkeleton",
      },
    ];

    for (const { path, skeleton } of pageContracts) {
      const src = readSource(path);
      expect(src).toContain("<CoursePageShell");
      expect(src).toContain("<Suspense");
      expect(src).toContain(skeleton);

      // Ensure CoursePageShell opens before the Suspense boundary in the page JSX
      const shellIndex = src.indexOf("<CoursePageShell");
      const suspenseIndex = src.lastIndexOf("<Suspense");
      expect(shellIndex).toBeGreaterThan(-1);
      expect(suspenseIndex).toBeGreaterThan(shellIndex);
    }
  });

  it("streams MaterialDetailPage content inside Suspense with MaterialReaderContentSkeleton", () => {
    const readerPage = readSource("app/(student)/courses/[id]/material/[materialId]/page.tsx");
    expect(readerPage).toContain("MaterialReaderContentSkeleton");
    expect(readerPage).toContain("<Suspense");
    expect(readerPage).toContain("<MaterialDetailContent");
  });

  it("uses tailored skeletons in StudyPathTimeline and ScheduleClient instead of generic blocks or spinners", () => {
    const studyPath = readSource("components/course/study-path-timeline.tsx");
    expect(studyPath).toContain("CourseStudyPathSkeleton");
    expect(studyPath).not.toContain("h-16 rounded-xl bg-muted/40");

    const scheduleClient = readSource("app/(student)/dashboard/schedule/schedule-client.tsx");
    expect(scheduleClient).toContain("data-testid=\"schedule-calendar-skeleton\"");
    expect(scheduleClient).not.toContain("Loader2 className=\"size-6 animate-spin");
  });
});
