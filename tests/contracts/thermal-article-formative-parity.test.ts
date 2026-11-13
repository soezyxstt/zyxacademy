import { expect, mock, test } from "bun:test";
import { z } from "zod";
import { createThermalArticle, thermalChoiceResponse, thermalRevealResponse } from "../visual/fixtures/thermal-article-data";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { formativeLearnerResponseSchema } from "@/lib/materials/formative-evaluation";

const spec = interactiveDocumentSchema.parse({ id: "brick", kind: "interactive_document", version: 1, label: "Bata", description: "Suhu bata", documentSha256: "b".repeat(64), documentBytes: 1, printSha256: "c".repeat(64), printBytes: 1, height: 500, staticFallback: { type: "text", summary: "Bata", content: "Suhu awal" }, printCaption: "Suhu awal" });
const article = createThermalArticle(spec);
const locator = z.object({ articleId: z.string(), articleVersion: z.number(), sectionId: z.string(), blockId: z.string() }).strict();
let overrideRetry: boolean | undefined;
let useOverride = false;
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "fixture", role: "admin" } }) } } }));
const coursePolicy = await import("@/lib/student/course-access");
mock.module("@/lib/student/course-access", () => ({ ...coursePolicy, resolveCourseAccess: async () => ({
  hasCourseAccess: true, hasFullContentAccess: true, tier: "staff", capabilities: { canReadArticle: true },
  scopedChapterIds: [article.chapterId], freeChapterIds: [],
}) }));
mock.module("@/lib/materials/formative-ai-evaluator", () => ({ evaluateConceptualResponse: () => { throw new Error("unexpected AI evaluation"); } }));
mock.module("@/lib/materials/formative-check-server", () => ({
  formativeCheckLocatorSchema: locator,
  formativeCheckEvaluationRequestSchema: locator.extend({ response: formativeLearnerResponseSchema }).strict(),
  responseKindForCheckKind: () => "choice",
  resolvePublishedFormativeCheck: async (input: z.infer<typeof locator>) => {
    const section = article.sections.find(item => item.id === input.sectionId)!;
    const block = section.blocks.find(item => item.id === input.blockId)!;
    const formativeCheck = block.formativeCheckPayload!;
    return { ok: true, context: { article, section, block, formativeCheck: useOverride ? { ...formativeCheck, feedbackPolicy: overrideRetry === undefined ? undefined : { hints: [], allowRetry: overrideRetry } } : formativeCheck } };
  },
}));

test("thermal fixture responses match the real evaluate and reveal handlers", async () => {
  const evaluate = await import("@/app/api/materials/formative-check/evaluate/route");
  const reveal = await import("@/app/api/materials/formative-check/reveal/route");
  for (const section of article.sections) {
    const block = section.blocks.find(item => item.formativeCheckPayload)!;
    const check = block.formativeCheckPayload!;
    const location = { articleId: article.id, articleVersion: article.version, sectionId: section.id, blockId: block.id };
    const request = (body: unknown) => new Request("http://fixture.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    for (const option of check.options!) {
      const response = await evaluate.POST(request({ ...location, response: { kind: "choice", optionId: option.id } }));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toEqual(thermalChoiceResponse(check, option.id));
      expect(result.result).toEqual({ verdict: option.isCorrect ? "correct" : "incorrect", feedback: option.isCorrect ? "Pilihanmu benar." : "Pilihanmu belum tepat. Periksa kembali konsep yang sedang diuji.", canRetry: true, revealAllowed: true });
    }
    const response = await reveal.POST(request(location));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(thermalRevealResponse(check));
    for (const retry of [false, undefined]) {
      useOverride = true;
      overrideRetry = retry;
      const adjusted = { ...check, feedbackPolicy: retry === undefined ? undefined : { hints: [], allowRetry: retry } };
      const evaluated = await evaluate.POST(request({ ...location, response: { kind: "choice", optionId: check.options![0].id } }));
      expect(evaluated.status).toBe(200);
      const result = await evaluated.json();
      expect(result).toEqual(thermalChoiceResponse(adjusted, check.options![0].id));
      expect(result.result.canRetry).toBe(retry ?? true);
      expect(result.result.revealAllowed).toBe(true);
      useOverride = false;
    }
  }
});
