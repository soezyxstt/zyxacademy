import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";

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

describe("usePersistentDraft storage helpers", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    local = createMemoryStorage();
    session = createMemoryStorage();
    // @ts-expect-error minimal window stub with localStorage and sessionStorage
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

  test("writes, restores, and removes versioned drafts in localStorage and sessionStorage", () => {
    const payload = { body: "Draft jawaban", attachments: ["a.png"] };
    expect(writePersistentDraft("draft:discussion:1", 1, payload, "local")).toBe(true);
    expect(writePersistentDraft("draft:quiz:1", 2, { answer: "B" }, "session")).toBe(true);

    const restoredLocal = readPersistentDraft<typeof payload>("draft:discussion:1", 1, "local");
    expect(restoredLocal?.version).toBe(1);
    expect(restoredLocal?.data).toEqual(payload);

    const restoredSession = readPersistentDraft<{ answer: string }>("draft:quiz:1", 2, "session");
    expect(restoredSession?.version).toBe(2);
    expect(restoredSession?.data).toEqual({ answer: "B" });

    removePersistentDraft("draft:discussion:1", "local");
    expect(readPersistentDraft("draft:discussion:1", 1, "local")).toBeNull();
  });

  test("discards and cleans up drafts with mismatched version or corrupted JSON", () => {
    writePersistentDraft("draft:versioned", 1, { text: "old" }, "local");
    expect(readPersistentDraft("draft:versioned", 2, "local")).toBeNull();
    expect(local.getItem("draft:versioned")).toBeNull();

    local.setItem("draft:corrupt", "{not valid json");
    expect(readPersistentDraft("draft:corrupt", 1, "local")).toBeNull();
    expect(local.getItem("draft:corrupt")).toBeNull();
  });

  test("runs optional validator and discards invalid payloads", () => {
    writePersistentDraft("draft:validated", 1, { score: "invalid" }, "local");

    const result = readPersistentDraft<{ score: number }>(
      "draft:validated",
      1,
      "local",
      (raw) => {
        if (
          raw &&
          typeof raw === "object" &&
          "score" in raw &&
          typeof (raw as { score: unknown }).score === "number"
        ) {
          return { score: (raw as { score: number }).score };
        }
        return null;
      }
    );

    expect(result).toBeNull();
    expect(local.getItem("draft:validated")).toBeNull();
  });

  test("guards against circular serialization errors and SSR environments", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(writePersistentDraft("draft:circular", 1, circular, "local")).toBe(false);

    // @ts-expect-error simulating SSR without window
    delete globalThis.window;
    expect(writePersistentDraft("draft:ssr", 1, { text: "x" }, "local")).toBe(false);
    expect(readPersistentDraft("draft:ssr", 1, "local")).toBeNull();
  });
});
