import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns } from "drizzle-orm";
import {
  aiQuestionBank,
  assessmentDiscussionAccess,
  studentQuizAttempts,
  submissions,
} from "@/db/schema";
import {
  computeLeaderboardEligibility,
  hasOpenedDiscussionBeforeCompletion,
  recordAssessmentDiscussionAccess,
  type AssessmentDiscussionKind,
} from "@/lib/asesmen/discussion-access";
import {
  filterLeaderboardEligibleAttempts,
  summarizeCourseLeaderboard,
} from "@/lib/student/course-leaderboard";

const ROOT = resolve(import.meta.dir, "../..");

function readRepoFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

interface StoredAccessRow {
  id: string;
  userId: string;
  courseId: string;
  assessmentKind: AssessmentDiscussionKind;
  assessmentId: string;
  openedBeforeCompletion: boolean;
  firstOpenedAt: Date;
}

function createInMemoryDiscussionExecutor() {
  const store = new Map<string, StoredAccessRow>();
  let lastQueryKey: string | null = null;

  const keyFor = (userId: string, kind: AssessmentDiscussionKind, assessmentId: string) =>
    `${userId}::${kind}::${assessmentId}`;

  const executor = {
    insert: () => ({
      values: (row: Omit<StoredAccessRow, "firstOpenedAt">) => {
        const key = keyFor(row.userId, row.assessmentKind, row.assessmentId);
        lastQueryKey = key;
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (store.has(key)) return [];
              const saved: StoredAccessRow = {
                ...row,
                firstOpenedAt: new Date("2026-11-27T00:00:00.000Z"),
              };
              store.set(key, saved);
              return [
                {
                  openedBeforeCompletion: saved.openedBeforeCompletion,
                  firstOpenedAt: saved.firstOpenedAt,
                },
              ];
            },
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (!lastQueryKey) return [];
            const found = store.get(lastQueryKey);
            return found
              ? [
                  {
                    openedBeforeCompletion: found.openedBeforeCompletion,
                    firstOpenedAt: found.firstOpenedAt,
                  },
                ]
              : [];
          },
        }),
      }),
    }),
    setLookupKey(userId: string, kind: AssessmentDiscussionKind, assessmentId: string) {
      lastQueryKey = keyFor(userId, kind, assessmentId);
    },
    store,
  };

  return executor;
}

describe("schema and migration contract for assessment discussion access", () => {
  it("exposes promptUi and explanationUi on aiQuestionBank", () => {
    const columns = getTableColumns(aiQuestionBank);
    expect(columns.promptUi.name).toBe("prompt_ui");
    expect(columns.promptUi.notNull).toBe(false);
    expect(columns.explanationUi.name).toBe("explanation_ui");
    expect(columns.explanationUi.notNull).toBe(false);
  });

  it("exposes leaderboardEligible defaulting to true on studentQuizAttempts and submissions", () => {
    const attemptCols = getTableColumns(studentQuizAttempts);
    expect(attemptCols.leaderboardEligible.name).toBe("leaderboard_eligible");
    expect(attemptCols.leaderboardEligible.notNull).toBe(true);
    expect(attemptCols.leaderboardEligible.default).toBe(true);

    const submissionCols = getTableColumns(submissions);
    expect(submissionCols.leaderboardEligible.name).toBe("leaderboard_eligible");
    expect(submissionCols.leaderboardEligible.notNull).toBe(true);
    expect(submissionCols.leaderboardEligible.default).toBe(true);
  });

  it("defines assessmentDiscussionAccess table columns", () => {
    const cols = getTableColumns(assessmentDiscussionAccess);
    expect(cols.id.name).toBe("id");
    expect(cols.userId.name).toBe("user_id");
    expect(cols.courseId.name).toBe("course_id");
    expect(cols.assessmentKind.name).toBe("assessment_kind");
    expect(cols.assessmentId.name).toBe("assessment_id");
    expect(cols.firstOpenedAt.name).toBe("first_opened_at");
    expect(cols.openedBeforeCompletion.name).toBe("opened_before_completion");
    expect(cols.openedBeforeCompletion.default).toBe(true);
  });

  it("provides an idempotent sequential SQL migration registered in the Drizzle journal", () => {
    const migrationSql = readRepoFile("drizzle-postgres/0049_assessment_discussion_access.sql");
    expect(migrationSql).toContain('ALTER TABLE "ai_question_bank" ADD COLUMN IF NOT EXISTS "prompt_ui" jsonb;');
    expect(migrationSql).toContain('ALTER TABLE "ai_question_bank" ADD COLUMN IF NOT EXISTS "explanation_ui" jsonb;');
    expect(migrationSql).toContain(
      'ALTER TABLE "student_quiz_attempts" ADD COLUMN IF NOT EXISTS "leaderboard_eligible" boolean DEFAULT true NOT NULL;',
    );
    expect(migrationSql).toContain(
      'ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "leaderboard_eligible" boolean DEFAULT true NOT NULL;',
    );
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "assessment_discussion_access"');
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_assessment_discussion_access_user_assessment"',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_assessment_discussion_access_course_user"',
    );

    const journal = JSON.parse(readRepoFile("drizzle-postgres/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const lastEntry = journal.entries[journal.entries.length - 1];
    expect(lastEntry.idx).toBe(49);
    expect(lastEntry.tag).toBe("0049_assessment_discussion_access");
  });
});

describe("discussion access tracking and leaderboard eligibility", () => {
  it("computes leaderboard eligibility strictly from openedDiscussionBeforeCompletion", () => {
    expect(computeLeaderboardEligibility({ openedDiscussionBeforeCompletion: true })).toBe(false);
    expect(computeLeaderboardEligibility({ openedDiscussionBeforeCompletion: false })).toBe(true);
  });

  it("idempotently preserves openedBeforeCompletion=true when pembahasan is opened before completing", async () => {
    const mockDb = createInMemoryDiscussionExecutor();
    const first = await recordAssessmentDiscussionAccess({
      userId: "student-1",
      courseId: "calc-1",
      assessmentKind: "quiz",
      assessmentId: "tpl-1",
      hasCompletedAttempt: false,
      executor: mockDb as unknown as Parameters<typeof recordAssessmentDiscussionAccess>[0]["executor"],
    });
    expect(first.recorded).toBe(true);
    expect(first.openedBeforeCompletion).toBe(true);

    // Opening again after completion must NOT clear openedBeforeCompletion.
    const second = await recordAssessmentDiscussionAccess({
      userId: "student-1",
      courseId: "calc-1",
      assessmentKind: "quiz",
      assessmentId: "tpl-1",
      hasCompletedAttempt: true,
      executor: mockDb as unknown as Parameters<typeof recordAssessmentDiscussionAccess>[0]["executor"],
    });
    expect(second.recorded).toBe(false);
    expect(second.openedBeforeCompletion).toBe(true);

    mockDb.setLookupKey("student-1", "quiz", "tpl-1");
    const openedBefore = await hasOpenedDiscussionBeforeCompletion({
      userId: "student-1",
      assessmentKind: "quiz",
      assessmentId: "tpl-1",
      executor: mockDb as unknown as Parameters<typeof hasOpenedDiscussionBeforeCompletion>[0]["executor"],
    });
    expect(openedBefore).toBe(true);
    expect(computeLeaderboardEligibility({ openedDiscussionBeforeCompletion: openedBefore })).toBe(false);
  });

  it("records openedBeforeCompletion=false when student already completed before opening pembahasan", async () => {
    const mockDb = createInMemoryDiscussionExecutor();
    const first = await recordAssessmentDiscussionAccess({
      userId: "student-2",
      courseId: "calc-1",
      assessmentKind: "tryout",
      assessmentId: "exam-1",
      hasCompletedAttempt: true,
      executor: mockDb as unknown as Parameters<typeof recordAssessmentDiscussionAccess>[0]["executor"],
    });
    expect(first.recorded).toBe(true);
    expect(first.openedBeforeCompletion).toBe(false);

    mockDb.setLookupKey("student-2", "tryout", "exam-1");
    const openedBefore = await hasOpenedDiscussionBeforeCompletion({
      userId: "student-2",
      assessmentKind: "tryout",
      assessmentId: "exam-1",
      executor: mockDb as unknown as Parameters<typeof hasOpenedDiscussionBeforeCompletion>[0]["executor"],
    });
    expect(openedBefore).toBe(false);
    expect(computeLeaderboardEligibility({ openedDiscussionBeforeCompletion: openedBefore })).toBe(true);
  });

  it("returns false when no discussion access record exists", async () => {
    const mockDb = createInMemoryDiscussionExecutor();
    mockDb.setLookupKey("student-3", "quiz", "tpl-99");
    const openedBefore = await hasOpenedDiscussionBeforeCompletion({
      userId: "student-3",
      assessmentKind: "quiz",
      assessmentId: "tpl-99",
      executor: mockDb as unknown as Parameters<typeof hasOpenedDiscussionBeforeCompletion>[0]["executor"],
    });
    expect(openedBefore).toBe(false);
  });
});

describe("leaderboard filtering and route wiring", () => {
  it("excludes leaderboardEligible=false attempts while keeping eligible and legacy rows", () => {
    const rows = [
      { studentId: "s1", score: 100, leaderboardEligible: false },
      { studentId: "s2", score: 85, leaderboardEligible: true },
      { studentId: "s3", score: 70 },
    ];
    const eligible = filterLeaderboardEligibleAttempts(rows);
    expect(eligible.map((r) => r.studentId)).toEqual(["s2", "s3"]);

    const ranked = eligible.map((r, idx) => ({ ...r, rank: idx + 1 }));
    const summary = summarizeCourseLeaderboard(ranked, "s2");
    expect(summary.totalStudents).toBe(2);
    expect(summary.ownRank).toBe(1);
  });

  it("wires leaderboard eligibility into quiz attempt start/submit, tryout submit, and course leaderboard", () => {
    const quizStartRoute = readRepoFile("app/api/quiz/attempts/route.ts");
    expect(quizStartRoute).toContain("hasOpenedDiscussionBeforeCompletion");
    expect(quizStartRoute).toContain("computeLeaderboardEligibility");
    expect(quizStartRoute).toContain("leaderboardEligible");

    const quizSubmitRoute = readRepoFile("app/api/quiz/attempts/[id]/route.ts");
    expect(quizSubmitRoute).toContain("hasOpenedDiscussionBeforeCompletion");
    expect(quizSubmitRoute).toContain("computeLeaderboardEligibility");
    expect(quizSubmitRoute).toContain("status: 'completed'");
    expect(quizSubmitRoute).toContain("leaderboardEligible");

    const tryoutSubmit = readRepoFile("lib/student/tryout-submit.ts");
    expect(tryoutSubmit).toContain("hasOpenedDiscussionBeforeCompletion");
    expect(tryoutSubmit).toContain("computeLeaderboardEligibility");
    expect(tryoutSubmit).toContain("leaderboardEligible");

    const courseUtils = readRepoFile("lib/course-utils.ts");
    const leaderboardSection = courseUtils.slice(courseUtils.indexOf("export async function getCourseLeaderboard"));
    expect(leaderboardSection).toContain("eq(studentQuizAttempts.leaderboardEligible, true)");

    const submissionsSection = courseUtils.slice(
      courseUtils.indexOf("export async function getCourseSubmissions"),
      courseUtils.indexOf("export async function getCourseLeaderboard"),
    );
    expect(submissionsSection).not.toContain("leaderboardEligible");
  });
});
