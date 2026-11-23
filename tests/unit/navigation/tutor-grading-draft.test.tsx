import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";
import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";
import {
  QUIZ_GRADING_DRAFT_VERSION,
  TRYOUT_GRADING_DRAFT_VERSION,
  buildServerQuizGradeInputs,
  buildServerTryoutGradeDraft,
  getQuizGradingDraftKey,
  getTryoutGradingDraftKey,
  mergeQuizGradeInputs,
  validateQuizGradingDraft,
  validateTryoutGradingDraft,
} from "@/features/grading/model/use-grading-drafts";
import type {
  AttemptDetails,
  QuizGradeDraftMap,
  SubmissionItem,
  TryoutGradeDraft,
} from "@/features/grading/model/types";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const originalWindow = globalThis.window;

describe("Tutor grading draft preservation across ViewportSwitch transitions", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    local = createMemoryStorage();
    session = createMemoryStorage();
    // @ts-expect-error minimal window stub with storage for draft persistence tests
    globalThis.window = {
      localStorage: local,
      sessionStorage: session,
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error restoring undefined window
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("preserves Quiz Grading drafts keyed by attemptId across mobile <-> desktop ViewportSwitch and storage round-trips", () => {
    const attempt: AttemptDetails = {
      attemptId: "attempt-42",
      templateId: "tpl-calc-1",
      quizTitle: "Kuis 2 Turunan",
      studentName: "Budi Santoso",
      studentEmail: "budi@example.com",
      submittedAt: new Date("2026-10-01T10:00:00Z"),
      gradingStatus: "pending_review",
      score: null,
      questions: [
        {
          index: 1,
          id: "q-mc",
          prompt: "Turunan dari x^2 adalah...",
          questionType: "multiple_choice",
          submittedAnswer: { index: 1 },
          submittedText: "2x",
          isDeterministicCorrect: true,
          currentScore: 100,
          currentStatus: "graded",
          reviewNotes: "",
          reviewRevision: 1,
          reviewerId: null,
          isFreeResponse: false,
          isEssay: false,
          isShortAnswer: false,
        },
        {
          index: 2,
          id: "q-essay-1",
          prompt: "Buktikan aturan rantai untuk f(g(x)).",
          questionType: "essay",
          submittedAnswer: { text: "Misal u = g(x)..." },
          submittedText: "Misal u = g(x)...",
          isDeterministicCorrect: false,
          currentScore: null,
          currentStatus: "pending_review",
          reviewNotes: "",
          reviewRevision: 3,
          reviewerId: null,
          isFreeResponse: true,
          isEssay: true,
          isShortAnswer: false,
        },
        {
          index: 3,
          id: "q-short-1",
          prompt: "Nilai f'(0) untuk f(x) = sin(2x).",
          questionType: "short_answer",
          submittedAnswer: { text: "2" },
          submittedText: "2",
          isDeterministicCorrect: true,
          currentScore: 100,
          currentStatus: "graded",
          reviewNotes: "",
          reviewRevision: 2,
          reviewerId: null,
          isFreeResponse: true,
          isEssay: false,
          isShortAnswer: true,
        },
      ],
    };

    const serverInitial = buildServerQuizGradeInputs(attempt);
    expect(Object.keys(serverInitial)).toEqual(["q-essay-1", "q-short-1"]);

    const storageKey = getQuizGradingDraftKey("course-math", attempt.attemptId);
    const unsavedDraft: QuizGradeDraftMap = {
      "q-essay-1": {
        score: "88",
        notes: "Langkah pembuktian sudah tepat, tambahkan syarat kontinuitas.",
        expectedRevision: 1,
      },
      "q-short-1": {
        score: "95",
        notes: "Notasi rapi.",
        expectedRevision: 2,
      },
    };

    expect(
      writePersistentDraft(storageKey, QUIZ_GRADING_DRAFT_VERSION, unsavedDraft, "local")
    ).toBe(true);

    const restored = readPersistentDraft<QuizGradeDraftMap>(
      storageKey,
      QUIZ_GRADING_DRAFT_VERSION,
      "local",
      validateQuizGradingDraft
    );
    expect(restored).not.toBeNull();

    // Merging preserves unsaved tutor score/notes while refreshing expectedRevision from server.
    const mergedInputs = mergeQuizGradeInputs(serverInitial, restored!.data);
    expect(mergedInputs["q-essay-1"]).toEqual({
      score: "88",
      notes: "Langkah pembuktian sudah tepat, tambahkan syarat kontinuitas.",
      expectedRevision: 3,
    });
    expect(mergedInputs["q-short-1"]).toEqual({
      score: "95",
      notes: "Notasi rapi.",
      expectedRevision: 2,
    });

    function QuizGradingHarness({ mode }: { mode: "mobile" | "desktop" }) {
      return (
        <ViewportSwitch
          initialHint={mode}
          mobile={() => (
            <section data-surface="mobile-quiz-grading-review">
              <input readOnly value={mergedInputs["q-essay-1"]?.score ?? ""} />
              <textarea readOnly value={mergedInputs["q-essay-1"]?.notes ?? ""} />
              <span data-short-score={mergedInputs["q-short-1"]?.score ?? ""} />
            </section>
          )}
          desktop={() => (
            <section data-surface="desktop-quiz-grading-review">
              <input readOnly value={mergedInputs["q-essay-1"]?.score ?? ""} />
              <textarea readOnly value={mergedInputs["q-essay-1"]?.notes ?? ""} />
              <span data-short-score={mergedInputs["q-short-1"]?.score ?? ""} />
            </section>
          )}
        />
      );
    }

    const mobileHtml = renderToStaticMarkup(<QuizGradingHarness mode="mobile" />);
    expect(mobileHtml).toContain('data-surface="mobile-quiz-grading-review"');
    expect(mobileHtml).not.toContain('data-surface="desktop-quiz-grading-review"');
    expect(mobileHtml).toContain('value="88"');
    expect(mobileHtml).toContain("Langkah pembuktian sudah tepat, tambahkan syarat kontinuitas.");
    expect(mobileHtml).toContain('data-short-score="95"');

    const desktopHtml = renderToStaticMarkup(<QuizGradingHarness mode="desktop" />);
    expect(desktopHtml).toContain('data-surface="desktop-quiz-grading-review"');
    expect(desktopHtml).not.toContain('data-surface="mobile-quiz-grading-review"');
    expect(desktopHtml).toContain('value="88"');
    expect(desktopHtml).toContain("Langkah pembuktian sudah tepat, tambahkan syarat kontinuitas.");
    expect(desktopHtml).toContain('data-short-score="95"');

    // Invalid payload is rejected safely.
    expect(validateQuizGradingDraft({ bad: { score: 88 } })).toBeNull();

    removePersistentDraft(storageKey, "local");
    expect(
      readPersistentDraft(storageKey, QUIZ_GRADING_DRAFT_VERSION, "local", validateQuizGradingDraft)
    ).toBeNull();
  });

  test("preserves Tryout Grading scoreInput and notesInput keyed by submissionId across mobile <-> desktop ViewportSwitch", () => {
    const submission: SubmissionItem = {
      id: "sub-99",
      studentName: "Siti Aminah",
      studentEmail: "siti@example.com",
      examTitle: "Tryout UTS Fisika Dasar I",
      status: "pending_review",
      score: null,
      teacherNotes: null,
      answersSnapshot: {},
      questionsSnapshot: [],
      submittedAt: new Date("2026-10-05T08:30:00Z"),
    };

    const serverInitial = buildServerTryoutGradeDraft(submission);
    expect(serverInitial).toEqual({ score: "", notes: "" });

    const storageKey = getTryoutGradingDraftKey("course-phys", submission.id);
    const unsavedDraft: TryoutGradeDraft = {
      score: "92",
      notes: "Analisis diagram gaya sangat jelas; perhatikan satuan di nomor 4.",
    };

    expect(
      writePersistentDraft(storageKey, TRYOUT_GRADING_DRAFT_VERSION, unsavedDraft, "local")
    ).toBe(true);

    const restored = readPersistentDraft<TryoutGradeDraft>(
      storageKey,
      TRYOUT_GRADING_DRAFT_VERSION,
      "local",
      validateTryoutGradingDraft
    );
    expect(restored).not.toBeNull();
    expect(restored!.data).toEqual(unsavedDraft);

    function TryoutGradingHarness({ mode }: { mode: "mobile" | "desktop" }) {
      const draft = restored!.data;
      return (
        <ViewportSwitch
          initialHint={mode}
          mobile={() => (
            <section data-surface="mobile-tryout-grading-review">
              <input readOnly value={draft.score} />
              <textarea readOnly value={draft.notes} />
            </section>
          )}
          desktop={() => (
            <section data-surface="desktop-tryout-grading-review">
              <input readOnly value={draft.score} />
              <textarea readOnly value={draft.notes} />
            </section>
          )}
        />
      );
    }

    const mobileHtml = renderToStaticMarkup(<TryoutGradingHarness mode="mobile" />);
    expect(mobileHtml).toContain('data-surface="mobile-tryout-grading-review"');
    expect(mobileHtml).not.toContain('data-surface="desktop-tryout-grading-review"');
    expect(mobileHtml).toContain('value="92"');
    expect(mobileHtml).toContain("Analisis diagram gaya sangat jelas; perhatikan satuan di nomor 4.");

    const desktopHtml = renderToStaticMarkup(<TryoutGradingHarness mode="desktop" />);
    expect(desktopHtml).toContain('data-surface="desktop-tryout-grading-review"');
    expect(desktopHtml).not.toContain('data-surface="mobile-tryout-grading-review"');
    expect(desktopHtml).toContain('value="92"');
    expect(desktopHtml).toContain("Analisis diagram gaya sangat jelas; perhatikan satuan di nomor 4.");

    // Invalid payload is rejected safely.
    expect(validateTryoutGradingDraft({ score: 92, notes: null })).toBeNull();

    removePersistentDraft(storageKey, "local");
    expect(
      readPersistentDraft(
        storageKey,
        TRYOUT_GRADING_DRAFT_VERSION,
        "local",
        validateTryoutGradingDraft
      )
    ).toBeNull();
  });
});
