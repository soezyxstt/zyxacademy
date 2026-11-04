import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";

const source = (path: string) => readFileSync(path, "utf8");
describe("demo learning adapters", () => {
  test("maps cards to a synthetic queue without user or real set identifiers", () => {
    const queue = demoFlashcardQueue([{ front: "Question", back: "Answer", explanation: null }]);
    expect(queue[0].card.id).toBe("demo-flashcard-0");
    expect(queue[0].card.setId).toBe("demo-set");
    expect(queue[0].progress).toBeNull();
    expect(queue[0].card.back).toBe("Answer");
  });
  test("student and demo mount the same learning presentations", () => {
    expect(source("app/(student)/courses/[id]/material/[materialId]/page.tsx")).toContain("<StructuredArticleReader");
    expect(source("components/demo/demo-article-view.tsx")).toContain("<StructuredArticleReader");
    expect(source("app/(student)/courses/[id]/material/[materialId]/page.tsx")).toContain("<MaterialViewer");
    expect(source("components/demo/demo-diktat-view.tsx")).toContain("<MaterialViewer");
    expect(source("app/(student)/courses/[id]/flashcard/page.tsx")).toContain("<FlashcardClient");
    expect(source("components/demo/demo-flashcards.tsx")).toContain("<FlashcardClient");
  });
  test("demo adapters bypass student writes and disable private reader features", () => {
    const flashcard = source("app/(student)/courses/[id]/flashcard/flashcard-client.tsx");
    expect(flashcard).toContain("if (adapter) await adapter.onReview");
    expect(flashcard).toContain("if (!adapter) emitActivityUpdated");
    const article = source("components/course/structured-article-reader.tsx");
    expect(article).toContain("if (!learnerMode || adapter) return;");
    expect(article).toContain("enabled: learnerMode && !adapter");
    expect(article).toContain("interactiveChecks={!adapter}");
    const diktat = source("components/demo/demo-diktat-view.tsx");
    expect(diktat).toContain('mode="admin-preview"');
    expect(diktat).toContain("canDownload={false}");
  });
});
