import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";
import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";
import type { ComposerDraft } from "@/components/discussions/composer";
import type { DiscussionDraftState } from "@/features/discussions/model/use-discussion-workspace";
import type { DiscussionChannel, DiscussionForwardDraft } from "@/components/discussions/view-model";
import {
  TRYOUT_DRAFT_VERSION,
  createInitialTryoutDraft,
  getTryoutDraftStorageKey,
  isTryoutQuestionAnswered,
  validateTryoutDraft,
  type PublicQuestion,
  type TryoutDraftPayload,
} from "@/features/student-assessment/model/tryout-draft-state";

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

function createEmptyComposerDraft(): ComposerDraft {
  return {
    body: "",
    images: [],
    mentionedPeople: [],
    sending: false,
    error: null,
  };
}

const originalWindow = globalThis.window;

describe("Draft preservation across mobile and desktop ViewportSwitch transitions", () => {
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

  test("preserves DiscussionDraftState (reply, new question, forward drafts, and attachments) across mobile <-> desktop ViewportSwitch", () => {
    const channel: DiscussionChannel = {
      id: "ch-kalkulus",
      kind: "course",
      name: "Kalkulus 1",
      courseId: "course-1",
      unreadCount: 0,
      canCreate: true,
      muted: false,
    };

    const replyDraft: ComposerDraft = {
      ...createEmptyComposerDraft(),
      body: "Langkah integral parsial: u = x, dv = e^x dx",
      images: [
        {
          id: "img-1",
          file: new File(["mock"], "turunan.png", { type: "image/png" }),
          previewUrl: "blob:turunan-preview",
          status: "ready",
          attachment: {
            id: "att-1",
            name: "turunan.png",
            url: "blob:turunan-preview",
          },
        },
      ],
    };

    const newQuestionDraft: ComposerDraft = {
      ...createEmptyComposerDraft(),
      body: "Bagaimana membuktikan limit sin(x)/x?",
    };

    const forwardDraft: DiscussionForwardDraft = {
      targetChannel: channel,
      targetQuestion: "q-42",
      targetTitle: "Perlu ditinjau tutor kelas",
      requestId: "req-forward-9",
      status: "ready",
    };

    const liftedDrafts: Record<string, ComposerDraft> = {
      "question:q-42": replyDraft,
      new: newQuestionDraft,
    };
    const liftedForwardDrafts: Record<string, DiscussionForwardDraft> = {
      "msg-9": forwardDraft,
    };

    const noop = () => {};
    const liftedState: DiscussionDraftState = {
      drafts: [liftedDrafts, noop],
      forwardDrafts: [liftedForwardDrafts, noop],
      newOpen: [true, noop],
      newChannel: [channel, noop],
    };

    function DiscussionHarness({ mode }: { mode: "mobile" | "desktop" }) {
      const [drafts] = liftedState.drafts;
      const [forwardDrafts] = liftedState.forwardDrafts;
      const [newOpen] = liftedState.newOpen;
      const [newChannel] = liftedState.newChannel;

      return (
        <ViewportSwitch
          initialHint={mode}
          mobile={() => (
            <section data-surface="mobile-discussion">
              <textarea readOnly value={drafts["question:q-42"]?.body ?? ""} />
              <span data-attachment-count={drafts["question:q-42"]?.images.length ?? 0} />
              <span data-new-open={String(newOpen)}>{newChannel?.name}</span>
              <span data-new-body={drafts.new?.body ?? ""} />
              <span data-forward-note={forwardDrafts["msg-9"]?.targetTitle ?? ""} />
            </section>
          )}
          desktop={() => (
            <section data-surface="desktop-discussion">
              <textarea readOnly value={drafts["question:q-42"]?.body ?? ""} />
              <span data-attachment-count={drafts["question:q-42"]?.images.length ?? 0} />
              <span data-new-open={String(newOpen)}>{newChannel?.name}</span>
              <span data-new-body={drafts.new?.body ?? ""} />
              <span data-forward-note={forwardDrafts["msg-9"]?.targetTitle ?? ""} />
            </section>
          )}
        />
      );
    }

    const mobileHtml = renderToStaticMarkup(<DiscussionHarness mode="mobile" />);
    expect(mobileHtml).toContain('data-surface="mobile-discussion"');
    expect(mobileHtml).not.toContain('data-surface="desktop-discussion"');
    expect(mobileHtml).toContain("Langkah integral parsial: u = x, dv = e^x dx");
    expect(mobileHtml).toContain('data-attachment-count="1"');
    expect(mobileHtml).toContain('data-new-open="true"');
    expect(mobileHtml).toContain("Kalkulus 1");
    expect(mobileHtml).toContain("Bagaimana membuktikan limit sin(x)/x?");
    expect(mobileHtml).toContain("Perlu ditinjau tutor kelas");

    const desktopHtml = renderToStaticMarkup(<DiscussionHarness mode="desktop" />);
    expect(desktopHtml).toContain('data-surface="desktop-discussion"');
    expect(desktopHtml).not.toContain('data-surface="mobile-discussion"');
    expect(desktopHtml).toContain("Langkah integral parsial: u = x, dv = e^x dx");
    expect(desktopHtml).toContain('data-attachment-count="1"');
    expect(desktopHtml).toContain('data-new-open="true"');
    expect(desktopHtml).toContain("Kalkulus 1");
    expect(desktopHtml).toContain("Bagaimana membuktikan limit sin(x)/x?");
    expect(desktopHtml).toContain("Perlu ditinjau tutor kelas");
  });

  test("preserves Tryout draft answers, flags, attachments, and active question index across mobile <-> desktop ViewportSwitch and storage round-trips", () => {
    const questions: PublicQuestion[] = [
      {
        id: "q1",
        order: 1,
        type: "multiple_choice",
        prompt: "Nilai limit x menuju 0 dari sin(x)/x adalah...",
        options: ["0", "1", "2", "Tak hingga"],
      },
      {
        id: "q2",
        order: 2,
        type: "multiple_choices",
        prompt: "Pilih fungsi yang kontinu di R.",
        options: ["x^2", "1/x", "cos(x)"],
      },
      {
        id: "q3",
        order: 3,
        type: "short_answer",
        prompt: "Turunan dari x^3 adalah...",
      },
      {
        id: "q4",
        order: 4,
        type: "essay",
        prompt: "Jelaskan teorema nilai antara.",
        acceptsFile: true,
      },
    ];

    const storageKey = getTryoutDraftStorageKey("course-math", "exam-uts-1", false, "student-1");
    expect(storageKey).not.toBe(
      getTryoutDraftStorageKey("course-math", "exam-uts-1", false, "student-2")
    );
    const initial = createInitialTryoutDraft(questions);
    expect(initial.index).toBe(0);
    expect(isTryoutQuestionAnswered(questions[0], initial.answers)).toBe(false);

    const populated: TryoutDraftPayload = {
      index: 3,
      flags: { q2: true, q4: true },
      answers: {
        q1: { type: "multiple_choice", index: 1 },
        q2: { type: "multiple_choices", indices: [0, 2] },
        q3: { type: "short_answer", text: "3x^2", fileName: null },
        q4: {
          type: "essay",
          text: "Jika f kontinu pada [a,b] maka setiap nilai di antara f(a) dan f(b) tercapai.",
          fileName: "pembuktian.pdf",
          fileSize: "420 KB",
          fileKey: "exams/exam-uts-1/pembuktian.pdf",
        },
      },
    };

    expect(
      writePersistentDraft(storageKey, TRYOUT_DRAFT_VERSION, populated, "local")
    ).toBe(true);

    const restoredEnvelope = readPersistentDraft<TryoutDraftPayload>(
      storageKey,
      TRYOUT_DRAFT_VERSION,
      "local",
      (raw) => validateTryoutDraft(raw, questions)
    );
    expect(restoredEnvelope).not.toBeNull();
    const restored = restoredEnvelope!.data;

    expect(restored).toEqual(populated);
    expect(questions.every((q) => isTryoutQuestionAnswered(q, restored.answers))).toBe(
      true
    );

    function TryoutHarness({ mode }: { mode: "mobile" | "desktop" }) {
      const q4Answer = restored.answers.q4;
      const essayText = q4Answer?.type === "essay" ? q4Answer.text : "";
      const essayFile = q4Answer?.type === "essay" ? q4Answer.fileName ?? "" : "";

      return (
        <ViewportSwitch
          initialHint={mode}
          mobile={() => (
            <div data-surface="mobile-tryout">
              <span data-active-index={restored.index} />
              <span data-flagged-q2={String(Boolean(restored.flags.q2))} />
              <span data-q3={restored.answers.q3?.type === "short_answer" ? restored.answers.q3.text : ""} />
              <textarea readOnly value={essayText} />
              <span data-file={essayFile} />
            </div>
          )}
          desktop={() => (
            <div data-surface="desktop-tryout">
              <span data-active-index={restored.index} />
              <span data-flagged-q2={String(Boolean(restored.flags.q2))} />
              <span data-q3={restored.answers.q3?.type === "short_answer" ? restored.answers.q3.text : ""} />
              <textarea readOnly value={essayText} />
              <span data-file={essayFile} />
            </div>
          )}
        />
      );
    }

    const mobileHtml = renderToStaticMarkup(<TryoutHarness mode="mobile" />);
    expect(mobileHtml).toContain('data-surface="mobile-tryout"');
    expect(mobileHtml).not.toContain('data-surface="desktop-tryout"');
    expect(mobileHtml).toContain('data-active-index="3"');
    expect(mobileHtml).toContain('data-flagged-q2="true"');
    expect(mobileHtml).toContain('data-q3="3x^2"');
    expect(mobileHtml).toContain("Jika f kontinu pada [a,b]");
    expect(mobileHtml).toContain('data-file="pembuktian.pdf"');

    const desktopHtml = renderToStaticMarkup(<TryoutHarness mode="desktop" />);
    expect(desktopHtml).toContain('data-surface="desktop-tryout"');
    expect(desktopHtml).not.toContain('data-surface="mobile-tryout"');
    expect(desktopHtml).toContain('data-active-index="3"');
    expect(desktopHtml).toContain('data-flagged-q2="true"');
    expect(desktopHtml).toContain('data-q3="3x^2"');
    expect(desktopHtml).toContain("Jika f kontinu pada [a,b]");
    expect(desktopHtml).toContain('data-file="pembuktian.pdf"');

    // Out-of-range index and mismatched question type are safely sanitized.
    const sanitized = validateTryoutDraft(
      {
        index: 99,
        flags: { q1: true },
        answers: {
          q1: { type: "essay", text: "wrong type", fileName: null },
          q3: { type: "short_answer", text: "3x^2", fileName: null },
        },
      },
      questions
    );
    expect(sanitized?.index).toBe(3);
    expect(sanitized?.answers.q1).toEqual({ type: "multiple_choice", index: null });
    expect(sanitized?.answers.q3).toEqual({
      type: "short_answer",
      text: "3x^2",
      fileName: null,
    });

    removePersistentDraft(storageKey, "local");
    expect(
      readPersistentDraft(storageKey, TRYOUT_DRAFT_VERSION, "local")
    ).toBeNull();
  });
});
