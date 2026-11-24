import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DISCUSSION_DRAFT_TTL_MS,
  extractPersistableDiscussionDrafts,
  loadPersistedDiscussionDrafts,
  mergePersistedDiscussionDrafts,
  savePersistedDiscussionDrafts,
  validatePersistedDiscussionDrafts,
} from "@/lib/discussions/draft-persistence";
import type { ComposerDraft } from "@/components/discussions/composer";
import {
  ZYRA_DRAWER_STATE_TTL_MS,
  clearPersistedZyraDrawerOpenFlags,
  readPersistedZyraDrawerDraft,
  readPersistedZyraDrawerOpen,
  savePersistedZyraDrawerDraft,
  savePersistedZyraDrawerOpen,
} from "@/lib/zyra/drawer-persistence";

const emptyComposerDraft = (): ComposerDraft => ({
  body: "",
  images: [],
  mentionedPeople: [],
  sending: false,
  error: null,
});
import {
  ACTIVE_VIDEO_TTL_MS,
  VIDEO_PROGRESS_TTL_MS,
  clearVideoPlaybackTime,
  readActiveCourseVideoId,
  readVideoPlaybackTime,
  saveActiveCourseVideoId,
  saveVideoPlaybackTime,
} from "@/lib/video/playback-persistence";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

const originalWindow = globalThis.window;

beforeEach(() => {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage,
    sessionStorage,
  };
});

afterEach(() => {
  (globalThis as unknown as { window: unknown }).window = originalWindow;
});

describe("discussion draft persistence", () => {
  test("persists unsent question/reply text and replyTo per viewer without saving empty drafts", () => {
    const now = 1_700_000_000_000;
    const drafts: Record<string, ComposerDraft> = {
      new: { ...emptyComposerDraft(), body: "Bagaimana turunan $\\sin(x^2)$?" },
      "question:q-1": {
        ...emptyComposerDraft(),
        body: "Coba pakai aturan rantai",
        replyTo: { id: "m-1", authorName: "Budi", excerpt: "Kenapa hasilnya 2x cos?" },
      },
      "question:q-empty": emptyComposerDraft(),
    };

    const extracted = extractPersistableDiscussionDrafts(drafts, now);
    expect(Object.keys(extracted)).toEqual(["new", "question:q-1"]);

    savePersistedDiscussionDrafts("viewer-1", drafts, now);
    expect(loadPersistedDiscussionDrafts("viewer-2", now)).toBeNull();

    const loaded = loadPersistedDiscussionDrafts("viewer-1", now + 5_000);
    expect(loaded?.new?.body).toBe("Bagaimana turunan $\\sin(x^2)$?");
    expect(loaded?.["question:q-1"]?.replyTo?.id).toBe("m-1");

    // Expired drafts are dropped
    expect(
      validatePersistedDiscussionDrafts(loaded, now + DISCUSSION_DRAFT_TTL_MS + 1),
    ).toBeNull();
  });

  test("merge preserves live user edits and only hydrates empty slots", () => {
    const current: Record<string, ComposerDraft> = {
      new: { ...emptyComposerDraft(), body: "Ketikan baru" },
    };
    const merged = mergePersistedDiscussionDrafts(
      current,
      {
        new: { body: "Draft lama", mentionedPeople: [], updatedAt: Date.now() },
        "question:q-2": { body: "Balasan lama", mentionedPeople: [], updatedAt: Date.now() },
      },
      emptyComposerDraft,
    );

    expect(merged.new.body).toBe("Ketikan baru");
    expect(merged["question:q-2"].body).toBe("Balasan lama");
  });
});

describe("Zyra drawer persistence", () => {
  test("saves and restores input draft, workStep, and sessionId per account and course", () => {
    const now = 1_700_000_000_000;
    savePersistedZyraDrawerDraft(
      "user-a",
      "course-1",
      { inputVal: "Jelaskan teorema Bayes", workStep: "P(A|B) =", sessionId: "sess-99" },
      now,
    );

    expect(readPersistedZyraDrawerDraft("user-b", "course-1", now)).toBeNull();
    expect(readPersistedZyraDrawerDraft("user-a", "course-2", now)).toBeNull();

    const restored = readPersistedZyraDrawerDraft("user-a", "course-1", now + 10_000);
    expect(restored).toEqual({
      inputVal: "Jelaskan teorema Bayes",
      workStep: "P(A|B) =",
      sessionId: "sess-99",
      updatedAt: now,
    });

    // Expired state returns null
    expect(
      readPersistedZyraDrawerDraft("user-a", "course-1", now + ZYRA_DRAWER_STATE_TTL_MS + 1),
    ).toBeNull();

    // Clearing all fields removes entry
    savePersistedZyraDrawerDraft(
      "user-a",
      "course-1",
      { inputVal: "", workStep: "", sessionId: null },
      now,
    );
    expect(readPersistedZyraDrawerDraft("user-a", "course-1", now)).toBeNull();
  });

  test("persists drawer open flag per course and clears all flags on account switch", () => {
    const now = 1_700_000_000_000;
    savePersistedZyraDrawerOpen("course-1", true, now);
    savePersistedZyraDrawerOpen("course-2", true, now);
    expect(readPersistedZyraDrawerOpen("course-1", now + 5_000)).toBe(true);

    clearPersistedZyraDrawerOpenFlags();
    expect(readPersistedZyraDrawerOpen("course-1", now + 5_000)).toBe(false);
    expect(readPersistedZyraDrawerOpen("course-2", now + 5_000)).toBe(false);
  });
});

describe("video playback persistence", () => {
  test("saves, restores, expires, and clears video playback timestamp", () => {
    const now = 1_700_000_000_000;

    // Below 3s threshold is ignored
    saveVideoPlaybackTime("vid-1", 2.4, 600, now);
    expect(readVideoPlaybackTime("vid-1", now)).toBe(0);

    // Mid-video timestamp is saved
    saveVideoPlaybackTime("vid-1", 1524.7, 3600, now);
    expect(readVideoPlaybackTime("vid-1", now + 10_000)).toBe(1524);

    // Near end clears saved progress so rewatch starts at 0
    saveVideoPlaybackTime("vid-1", 3596, 3600, now);
    expect(readVideoPlaybackTime("vid-1", now)).toBe(0);

    // Explicit clear works
    saveVideoPlaybackTime("vid-2", 420, 1200, now);
    expect(readVideoPlaybackTime("vid-2", now)).toBe(420);
    clearVideoPlaybackTime("vid-2", now);
    expect(readVideoPlaybackTime("vid-2", now)).toBe(0);

    // TTL expiry works
    saveVideoPlaybackTime("vid-3", 200, 1200, now);
    expect(readVideoPlaybackTime("vid-3", now + VIDEO_PROGRESS_TTL_MS + 1)).toBe(0);
  });

  test("persists and clears active course video ID with TTL", () => {
    const now = 1_700_000_000_000;
    saveActiveCourseVideoId("course-math", "vid-42", now);
    expect(readActiveCourseVideoId("course-math", now + 5_000)).toBe("vid-42");
    expect(readActiveCourseVideoId("course-math", now + ACTIVE_VIDEO_TTL_MS + 1)).toBeNull();

    saveActiveCourseVideoId("course-math", null, now);
    expect(readActiveCourseVideoId("course-math", now)).toBeNull();
  });
});
