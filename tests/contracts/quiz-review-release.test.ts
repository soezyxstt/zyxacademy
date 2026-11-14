import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  canViewAttemptDiscussion,
  canViewQuizDiscussion,
  isQuizDiscussionClosed,
  projectQuizReviewSnapshot,
} from "@/lib/quiz/review-release";

const now = new Date("2026-11-11T12:00:00.000Z");
const future = new Date("2026-11-11T13:00:00.000Z");
const past = new Date("2026-11-11T11:00:00.000Z");
const closed = (manualStatus: string, closeAt: Date | null) =>
  isQuizDiscussionClosed({ manualStatus, closeAt, now });

describe("quiz review release", () => {
  test("uses schedule and manual overrides to determine closure", () => {
    expect(closed("scheduled", future)).toBe(false);
    expect(closed("scheduled", past)).toBe(true);
    expect(closed("scheduled", null)).toBe(false);
    expect(closed("scheduled", now)).toBe(false);
    expect(closed("closed", future)).toBe(true);
    expect(closed("open", past)).toBe(false);
    expect(closed("scheduled", new Date("invalid"))).toBe(false);
  });

  test("honors never, after close, and immediate after submission", () => {
    const allowed = (explanationRelease: unknown, isQuizClosed: boolean, hasCompletedAttempt: boolean, showDiscussion = true) =>
      canViewQuizDiscussion({ explanationRelease, isQuizClosed, hasCompletedAttempt, showDiscussion });

    expect(allowed("never", false, true)).toBe(false);
    expect(allowed("never", true, true)).toBe(false);
    expect(allowed("after_close", false, true)).toBe(false);
    expect(allowed("after_close", true, true)).toBe(true);
    expect(allowed("after_close", true, false)).toBe(true);
    // The admin form persists the after-submission setting as "immediate".
    expect(allowed("immediate", false, false)).toBe(false);
    expect(allowed("immediate", true, false)).toBe(false);
    expect(allowed("immediate", false, true)).toBe(true);
    expect(allowed(undefined, false, true)).toBe(false);
    expect(allowed(undefined, true, true)).toBe(true);
    expect(allowed(undefined, true, true, false)).toBe(false);
    expect(allowed("unknown", true, true)).toBe(false);
    expect(allowed(false, true, true)).toBe(false);
  });

  test("does not project hidden questions, answers, solutions, or nested metadata", () => {
    const stored = [{
      id: "q1",
      prompt: "Pertanyaan",
      question_type: "short_answer",
      options: [{ text: "Pilihan", isCorrect: true, explanation: "OPTION_SECRET" }],
      correct_indices: [0],
      correctIndices: [0],
      acceptable_answers: ["ANSWER_SECRET"],
      acceptableAnswers: ["ANSWER_SECRET"],
      explanation: "EXPLANATION_SECRET",
      correct_stable_option_ids: ["STABLE_SECRET"],
      gradingRubric: { answer: "RUBRIC_SECRET" },
      metadata: { solution: "METADATA_SECRET" },
    }];
    expect(projectQuizReviewSnapshot(stored, false)).toEqual([]);

    const released = projectQuizReviewSnapshot(stored, true);
    expect(released[0]).toMatchObject({
      id: "q1",
      options: ["Pilihan"],
      correct_indices: [0],
      acceptable_answers: ["ANSWER_SECRET"],
      explanation: "EXPLANATION_SECRET",
    });
    expect(JSON.stringify(released)).not.toContain("OPTION_SECRET");
    expect(JSON.stringify(released)).not.toContain("RUBRIC_SECRET");
    expect(JSON.stringify(released)).not.toContain("METADATA_SECRET");
    expect(JSON.stringify(released)).not.toContain("STABLE_SECRET");
  });

  test("keeps legacy aliases and source attribution for a released review", () => {
    const [question] = projectQuizReviewSnapshot([{
      id: "legacy",
      prompt: "Pilihan lama",
      type: "short_answer",
      options: JSON.stringify([{ label: "A", correct: true }, { value: "B" }]),
      correctIndices: [1],
      acceptableAnswers: ["B"],
      explanation: "Pembahasan",
      origin: "historical_reference",
      source_event_name: "Ujian terdahulu",
      source_reference_id: "ref-1",
    }], true);
    expect(question).toMatchObject({
      question_type: "short_answer",
      options: ["A", "B"],
      correct_indices: [1],
      acceptable_answers: ["B"],
      origin: "historical_reference",
      sourceEventName: "Ujian terdahulu",
      sourceReferenceId: "ref-1",
    });
  });

  test("binds the release decision and snapshot to the owner, template, and final status", () => {
    const page = readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8");
    const attempts = page.slice(page.indexOf("const previousAttempts ="), page.indexOf("const parsedRules ="));
    expect(attempts).toContain("eq(studentQuizAttempts.studentId, studentId)");
    expect(attempts).toContain("eq(studentQuizAttempts.templateId, quizId)");
    expect(attempts).toContain('attempt.status === "completed"');
    expect(attempts).toContain("if (attemptId && !requestedAttempt) notFound()");
    expect(page).toContain("hasCompletedAttempt: completedAttempts.length > 0");

    const snapshot = page.slice(page.indexOf("const needsSnapshot ="), page.indexOf("// STATE B:"));
    expect(snapshot).toContain('targetAttempt.status === "completed" && isDiscussionOpen');
    expect(snapshot).toContain("eq(studentQuizAttempts.studentId, studentId)");
    expect(snapshot).toContain("eq(studentQuizAttempts.templateId, quizId)");
    expect(snapshot).toContain("eq(studentQuizAttempts.status, targetAttempt.status)");
    expect(snapshot).toContain("if (needsSnapshot && !targetAttemptSnapshot) notFound()");

    const review = page.slice(page.indexOf("// Unified State"), page.indexOf("// STATE D:"));
    expect(review).toContain("projectQuizReviewSnapshot(targetAttemptSnapshot?.questionsSnapshot, isDiscussionOpen)");
    expect(review).toContain("if (isDiscussionOpen)");
    expect(review).toContain("discussionAvailable={isDiscussionOpen}");

    const component = readFileSync("components/course/student-quiz-review.tsx", "utf8");
    expect(component).toContain("targetAttempt && discussionAvailable");
    expect(component).toContain("targetAttempt.score == null ?");
    expect(component).toContain("targetAttempt && !discussionAvailable");
  });
});


describe("direct attempt API release", () => {
  const template = (policy: unknown, closeAt: Date | null = future) => ({
    selectionRules: { explanationRelease: policy }, showDiscussion: true, manualStatus: "scheduled", closeAt,
  });
  test("fails closed for missing templates, malformed rules and unfinished attempts", () => {
    expect(canViewAttemptDiscussion(undefined, "completed", now)).toBe(false);
    expect(canViewAttemptDiscussion({ ...template("immediate"), selectionRules: "{" }, "completed", now)).toBe(false);
    expect(canViewAttemptDiscussion(template("immediate"), "in_progress", now)).toBe(false);
    expect(canViewAttemptDiscussion(template("immediate"), "submitted", now)).toBe(false);
  });
  test("uses the same never, after-close and submitted release policy on direct reads", () => {
    expect(canViewAttemptDiscussion(template("never", past), "completed", now)).toBe(false);
    expect(canViewAttemptDiscussion(template("after_close"), "completed", now)).toBe(false);
    expect(canViewAttemptDiscussion(template("after_close", past), "completed", now)).toBe(true);
    expect(canViewAttemptDiscussion(template("immediate"), "completed", now)).toBe(true);
    expect(canViewAttemptDiscussion({ ...template("after_close", past), manualStatus: "open" }, "completed", now)).toBe(false);
  });
  test("detail, listing and analytics boundaries check release before returning protected data", () => {
    const detail = readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8");
    const list = readFileSync("app/api/quiz/attempts/route.ts", "utf8");
    const analytics = readFileSync("app/api/quiz/attempts/[id]/analytics/route.ts", "utf8");
    expect(detail).toContain("canViewAttemptDiscussion(template, attempt.status)");
    expect(detail).toContain("releaseState: released ? 'released' : 'hidden'");
    expect(list).toContain("canViewAttemptDiscussion(templateById.get(attempt.templateId), attempt.status)");
    expect(analytics.indexOf("canViewAttemptDiscussion(template, attempt.status)")).toBeLessThan(analytics.indexOf("if (analytics)"));
    expect(analytics.match(/!isAdminOrTeacher && !canViewAttemptDiscussion/g)).toHaveLength(2);
  });
});
