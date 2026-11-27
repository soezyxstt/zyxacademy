import { expect, mock, test } from "bun:test";
import { formativeMarkdownCodingParts, sectionCodingParts } from "@/lib/coding/native-article-parts";
import { formativeCodingAccessForReveal } from "@/lib/coding/native-formative-coding-grant";
import { mintInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";
import { nativeArticleCodingHeader } from "@/lib/coding/native-article-contract";

const revision = "a".repeat(64);
const origin = "https://example.test";
const target = { materialId: "article", sectionId: "section", partId: "exercise", revision };
const secret = "fixture-formative-secret";
process.env.BETTER_AUTH_SECRET = secret;
const answer = "```python\nprint('answer')\n```";
const explanation = "```py\nprint('explanation')\n```";
const check = { id: "formative", blockType: "retrieval_close", formativeCheck: { options: [{ id: "A", text: "```py\nprint('option')\n```" }] } };
let currentVersion = 3;
let currentCourse = "canonical";
let published = true;
let fullAccess = true;
let answerMarkdown = answer;
const resolve = mock(async (_locator: unknown) => published ? {
  ok: true,
  context: { article: { courseId: currentCourse }, formativeCheck: { checkKind: "short_answer", answer: answerMarkdown, explanation } },
} : { ok: false });
const locator = { problemId: "problem", version: 4 };
const section = { id: "section", blocks: [{ id: "body", parts: [{ id: "exercise", kind: "coding_exercise", problem: locator }] }, check] };
let codingMode = "native";
const load = mock(async (_user: string, _target: unknown, _origin: string) => ({
  kind: "article", structured: true, codingMode, revision, data: { id: "article", version: currentVersion, sections: [section] },
}));
mock.module("server-only", () => ({}));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("@/lib/student/native-published-reading", () => ({ loadNativePublishedReading: load }));
mock.module("@/lib/coding/server-access", () => ({ assertCodingSameOrigin: () => {} }));
mock.module("@/lib/materials/formative-check-server", () => ({ resolvePublishedFormativeCheck: resolve }));
mock.module("@/lib/student/native-reading-access", () => ({
  resolveNativeStudentReadingAccess: async () => ({ hasFullContentAccess: fullAccess, canonicalCourseId: "canonical" }),
}));
const { requireNativeArticleCoding, assertNativeArticleProblem } = await import("@/lib/coding/native-article-access");

function request(value?: object) {
  return new Request(origin, { headers: value ? { [nativeArticleCodingHeader]: encodeURIComponent(JSON.stringify(value)) } : {} });
}

test("existing web callers need no native headers, while native scopes require exact published identity", async () => {
  expect(await requireNativeArticleCoding(request(), "learner", "course")).toBeNull();
  expect(load).not.toHaveBeenCalled();
  const verified = await requireNativeArticleCoding(request(target), "learner", "course");
  expect(load).toHaveBeenCalledWith("learner", { courseId: "course", materialId: "article" }, origin);
  expect(verified?.draftKey).toBe("exercise:article:3:exercise");
  expect(() => assertNativeArticleProblem(verified, locator, verified!.surface)).not.toThrow();
  expect(() => assertNativeArticleProblem(verified, { ...locator, version: 5 }, verified!.surface)).toThrow("CODING_INVALID_SURFACE");
  expect(() => assertNativeArticleProblem(verified, locator, { ...verified!.surface, articleVersion: 4 })).toThrow("CODING_INVALID_SURFACE");
  for (const change of [{ partId: "other" }, { sectionId: "other" }, { revision: "b".repeat(64) }]) {
    await expect(requireNativeArticleCoding(request({ ...target, ...change }), "learner", "course")).rejects.toThrow("CODING_FORBIDDEN");
  }
  codingMode = "browser";
  await expect(requireNativeArticleCoding(request(target), "learner", "course")).rejects.toThrow("CODING_FORBIDDEN");
});

test("public options run directly, while each private answer field requires its exact fresh signed reveal", async () => {
  codingMode = "native";
  const option = sectionCodingParts(section.blocks, section.id).find(entry => entry.formativeOption);
  expect(option?.part).toMatchObject({ code: "print('option')" });
  expect((await requireNativeArticleCoding(request({ ...target, partId: option!.part.id }), "learner", "course"))?.part).toEqual(option?.part);
  const identity = { userId: "learner", courseId: "course", articleId: "article", articleVersion: 3, revision, sectionId: section.id, blockId: check.id };
  const grants = formativeCodingAccessForReveal(identity, { answer, explanation }, secret);
  expect(formativeCodingAccessForReveal(identity, { answer: "Text only", explanation }, secret)).not.toHaveProperty("answer");

  const answerItem = formativeMarkdownCodingParts(answer, section.id, check, "answer")[0];
  const explanationItem = formativeMarkdownCodingParts(explanation, section.id, check, "explanation")[0];
  const revealed = { ...target, partId: answerItem.part.id, revealGrant: grants.answer };
  const denied = async (scope: object, userId = "learner", courseId = "course") =>
    expect(requireNativeArticleCoding(request(scope), userId, courseId)).rejects.toThrow("CODING_FORBIDDEN");
  for (const [part, grant] of [[answerItem, grants.answer], [explanationItem, grants.explanation]] as const) {
    const verified = await requireNativeArticleCoding(request({ ...target, partId: part.part.id, revealGrant: grant }), "learner", "course");
    expect(verified?.part).toEqual(part.part);
    expect(verified?.draftKey).toBe("markdown-example:article:3:" + part.part.id);
  }
  await denied({ ...revealed, revealGrant: undefined });
  await denied({ ...revealed, revealGrant: grants.explanation });
  await denied({ ...revealed, partId: option!.part.id });
  await denied(revealed, "other-learner");
  await denied(revealed, "other-course");
  const staleGrant = formativeCodingAccessForReveal({ ...identity, revision: "b".repeat(64) }, { answer, explanation }, secret);
  await denied({ ...revealed, revealGrant: staleGrant.answer });
  const expiredGrant = formativeCodingAccessForReveal(identity, { answer, explanation }, secret, Date.now() - 600_001);
  await denied({ ...revealed, revealGrant: expiredGrant.answer });
  const wrongBlock = formativeCodingAccessForReveal({ ...identity, blockId: "body" }, { answer, explanation }, secret);
  await denied({ ...revealed, revealGrant: wrongBlock.answer });
  const visualGrant = mintInteractiveDocumentGrant({
    userId: identity.userId, articleId: identity.articleId, articleVersion: identity.articleVersion,
    sectionId: identity.sectionId, blockId: identity.blockId, field: "answer",
  }, secret);
  await denied({ ...revealed, revealGrant: visualGrant });

  currentVersion = 4;
  await denied(revealed);
  currentVersion = 3;
  answerMarkdown = answer.replace("answer", "changed");
  await denied(revealed);
  answerMarkdown = answer;
  currentCourse = "different-canonical";
  await denied(revealed);
  currentCourse = "canonical";
  published = false;
  await denied(revealed);
  published = true;
  fullAccess = false;
  await denied(revealed);
  fullAccess = true;
  codingMode = "browser";
  await denied(revealed);
});
