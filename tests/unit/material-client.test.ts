import { afterEach, describe, expect, test } from "bun:test";
import { generateChapterSummary, saveMaterialReadingProgress } from "../../lib/materials/client-api";
import { createMaterialProgressTracker, materialReadingPosition } from "../../lib/materials/client-contracts";
import { ApiResponseError } from "../../lib/query/http";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const article = (sectionIndex = 0) => materialReadingPosition({ kind: "article", done: false, sectionCount: 10, sectionIndex, sectionTitle: `Bagian ${sectionIndex}`, page: 1 });

describe("material reading deltas", () => {
  test("unchanged periodic position keeps elapsed time for the final flush, once", () => {
    const tracker = createMaterialProgressTracker();
    for (let second = 0; second < 20; second++) tracker.tick();
    expect(tracker.take("material", article(), false)?.timeSpentSeconds).toBe(20);
    for (let second = 0; second < 20; second++) tracker.tick();
    expect(tracker.take("material", article(), false)).toBeNull();
    for (let second = 0; second < 4; second++) tracker.tick();
    expect(tracker.take("material", article(), true)?.timeSpentSeconds).toBe(24);
    expect(tracker.take("material", article(), true)).toBeNull();
  });

  test("an uncertain response never replays elapsed time on the next save", () => {
    const tracker = createMaterialProgressTracker();
    for (let second = 0; second < 20; second++) tracker.tick();
    expect(tracker.take("material", article(), false)?.timeSpentSeconds).toBe(20);
    tracker.invalidatePosition();
    expect(tracker.take("material", article(), false)).toBeNull();
    for (let second = 0; second < 3; second++) tracker.tick();
    expect(tracker.take("material", article(), false)?.timeSpentSeconds).toBe(3);
  });

  test("PDF position never derives completion from the mock viewer's page count", () => {
    const position = { kind: "pdf", done: false, sectionCount: 0, sectionIndex: 0, page: 20 };
    expect(materialReadingPosition(position).completionPercent).toBe(0);
    expect(materialReadingPosition({ ...position, done: true }).completionPercent).toBe(100);
    expect(materialReadingPosition(position).lastPosition).toEqual({ type: "pdf", page: 20 });
  });

  test("section navigation saves even when its percent change is below five", () => {
    const tracker = createMaterialProgressTracker();
    const position = { kind: "article", done: false, sectionCount: 100, sectionIndex: 0, page: 1 };
    tracker.tick();
    expect(tracker.take("material", materialReadingPosition(position), false)).not.toBeNull();
    tracker.tick();
    expect(tracker.take("material", materialReadingPosition({ ...position, sectionIndex: 1 }), false)).not.toBeNull();
  });
});

describe("material API contracts", () => {
  test("checks the material and actor in a keepalive progress receipt", async () => {
    let init: RequestInit | undefined;
    const input = { materialId: "material", ...article(), timeSpentSeconds: 20 };
    globalThis.fetch = (async (_, options) => {
      init = options;
      return Response.json({ ...input, studentId: "other-student" });
    }) as typeof fetch;
    await expect(saveMaterialReadingProgress("student", input)).rejects.toBeInstanceOf(ApiResponseError);
    expect(init?.keepalive).toBe(true);
    expect(new Headers(init?.headers).get("x-student-id")).toBe("student");
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  test("a chapter summary is a validated one-shot POST, including a quota result", async () => {
    let calls = 0;
    let valid = false;
    globalThis.fetch = (async (_, init) => {
      calls++;
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("x-student-id")).toBe("student");
      expect(JSON.parse(String(init?.body))).toEqual({ chapterId: "chapter" });
      return Response.json(valid
        ? { summary: { keyConcepts: [], commonMistakes: [], importantFormulas: [], practiceRecommendations: [] }, cached: false, budgetExhausted: true }
        : { summary: { keyConcepts: "invalid" }, cached: false, budgetExhausted: false });
    }) as typeof fetch;
    await expect(generateChapterSummary("student", "chapter")).rejects.toBeInstanceOf(ApiResponseError);
    expect(calls).toBe(1);
    valid = true;
    expect((await generateChapterSummary("student", "chapter")).budgetExhausted).toBe(true);
    expect(calls).toBe(2);
  });
});
