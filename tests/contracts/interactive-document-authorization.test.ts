import { describe, expect, test } from "bun:test";
import { authorizeArticleDocument, authorizeAttemptDocument, authorizeDraftArticleDocument } from "@/lib/materials/interactive-document-authorization";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

const spec: InteractiveDocumentSpec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual interaktif", documentSha256: "a".repeat(64), documentBytes: 10, printSha256: "b".repeat(64), printBytes: 10, height: 400, staticFallback: { type: "text", summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const other = { ...spec, id: "solution", documentSha256: "c".repeat(64), printSha256: "d".repeat(64) };
const fence = (value: unknown) => `\`\`\`zyx-visual\n${JSON.stringify(value)}\n\`\`\``;
const attempt = { id: "attempt", studentId: "user", status: "in_progress", questionsSnapshot: [{ id: "question", prompt: fence(spec), options: [fence(spec), "plain"], explanation: fence(other) }] };
const template = { courseId: "course", selectionRules: { explanationRelease: "immediate" }, showDiscussion: true, manualStatus: "open", closeAt: null };
const base = { userId: "user", courseId: "course", attemptId: "attempt", questionId: "question", field: "prompt" as const, visualId: "visual", hash: spec.documentSha256, kind: "document" as const, attempt, template };

describe("interactive document attempt authorization", () => {
  test("binds owner, course, snapshot question, field, id and bytes", () => {
    expect(authorizeAttemptDocument(base)).toEqual(spec);
    for (const change of [{ userId: "other" }, { courseId: "other" }, { attemptId: "other" }, { questionId: "other" }, { visualId: "other" }, { hash: "e".repeat(64) }, { field: "option" as const, option: 1 }]) expect(authorizeAttemptDocument({ ...base, ...change })).toBeNull();
    expect(authorizeAttemptDocument({ ...base, field: "option", option: 0 })).toEqual(spec);
    expect(authorizeAttemptDocument({ ...base, kind: "print", hash: spec.printSha256 })).toEqual(spec);
    expect(authorizeAttemptDocument({ ...base, attempt: { ...attempt, questionsSnapshot: [{ ...attempt.questionsSnapshot[0], prompt: fence({ ...spec, documentSha256: "f".repeat(64) }) }] } })).toBeNull();
  });

  test("enforces immediate, after-close and never and rejects hidden asset reuse", () => {
    const explanation = { ...base, field: "explanation" as const, visualId: other.id, hash: other.documentSha256 };
    expect(authorizeAttemptDocument(explanation)).toBeNull();
    const completed = { ...attempt, status: "completed" };
    expect(authorizeAttemptDocument({ ...explanation, attempt: completed })).toEqual(other);
    const after = { ...template, selectionRules: { explanationRelease: "after_close" } };
    expect(authorizeAttemptDocument({ ...explanation, attempt: completed, template: after })).toBeNull();
    expect(authorizeAttemptDocument({ ...explanation, attempt: completed, template: { ...after, manualStatus: "closed" } })).toEqual(other);
    expect(authorizeAttemptDocument({ ...explanation, attempt: completed, template: { ...after, manualStatus: "closed", selectionRules: { explanationRelease: "never" } } })).toBeNull();
    expect(authorizeAttemptDocument({ ...base, attempt: { ...attempt, questionsSnapshot: [{ ...attempt.questionsSnapshot[0], explanation: fence(spec) }] } })).toBeNull();
    expect(authorizeAttemptDocument({ ...base, attempt: { ...attempt, questionsSnapshot: [...attempt.questionsSnapshot, { id: "another", explanation: fence(spec) }] } })).toBeNull();
  });
});

test("article reference requires the same visible part and spec in the exact published version", () => {
  const part = { id: "part", kind: "visual_ref", visualId: spec.id };
  const canonical = { id: "article:v2", version: 2, sections: [{ id: "section-row", sectionKey: "section" }], blocks: [{ id: "block-row", bagianArtikelId: "section-row", blockKey: "block", parts: [part] }], visuals: [spec] };
  const product = { id: "article", version: 2, sections: [{ id: "section", blocks: [{ id: "block", parts: [part], formativeCheckPayload: { answer: "answer", explanation: "explanation" } }] }], visuals: [spec] };
  const request = { articleId: canonical.id, version: 2, sectionId: "section-row", blockId: "block-row", partId: "part", field: "visual_ref" as const, visualId: spec.id, hash: spec.documentSha256, kind: "document" as const, canonical, product };
  expect(authorizeArticleDocument(request)).toEqual(spec);
  for (const change of [{ articleId: "article:v3" }, { version: 1 }, { sectionId: "other" }, { blockId: "other" }, { partId: "other" }, { visualId: "other" }, { hash: "f".repeat(64) }]) expect(authorizeArticleDocument({ ...request, ...change })).toBeNull();
  expect(authorizeArticleDocument({ ...request, canonical: { ...canonical, visuals: [{ ...spec, documentSha256: "f".repeat(64) }] } })).toBeNull();
  expect(authorizeArticleDocument({ ...request, product: { ...product, sections: [{ id: "section", blocks: [{ id: "block", parts: [part], formativeCheckPayload: { explanation: fence(spec) } }] }] } })).toBeNull();
  const draft = { ...request, articleId: "article", sectionId: "section", blockId: "block" };
  expect(authorizeDraftArticleDocument(draft)).toEqual(spec);
  expect(authorizeDraftArticleDocument({ ...draft, version: 3 })).toBeNull();
  expect(authorizeDraftArticleDocument({ ...draft, partId: "other" })).toBeNull();
  const content = fence(spec);
  const contentRequest = { ...request, field: "content" as const, partId: undefined, canonical: { ...canonical, blocks: [{ ...canonical.blocks[0], content, parts: undefined }] }, product: { ...product, sections: [{ id: "section", blocks: [{ id: "block", contentMarkdown: content }] }] } };
  expect(authorizeArticleDocument(contentRequest)).toEqual(spec);
  expect(authorizeArticleDocument({ ...contentRequest, canonical: { ...contentRequest.canonical, blocks: [{ ...contentRequest.canonical.blocks[0], parts: [part] }] } })).toBeNull();
  expect(authorizeArticleDocument({ ...contentRequest, product: { ...contentRequest.product, sections: [{ id: "section", blocks: [{ id: "block", contentMarkdown: "changed" }] }] } })).toBeNull();
  const markdown = { id: "part", kind: "markdown", markdown: content };
  const markdownRequest = { ...request, field: "markdown" as const, canonical: { ...canonical, blocks: [{ ...canonical.blocks[0], parts: [markdown] }] }, product: { ...product, sections: [{ id: "section", blocks: [{ id: "block", parts: [markdown] }] }] } };
  expect(authorizeArticleDocument(markdownRequest)).toEqual(spec);
  expect(authorizeArticleDocument({ ...markdownRequest, product: { ...markdownRequest.product, sections: [{ id: "section", blocks: [{ id: "block", parts: [{ ...markdown, markdown: "changed" }] }] }] } })).toBeNull();
});

test("section visual requires the same published section placement in canonical and archived content", () => {
  const pedagogy = { visualRequirement: { status: "required", visualIds: [spec.id] } };
  const canonical = { id: "article", version: 1, sections: [{ id: "row", sectionKey: "section", pedagogy }], blocks: [], visuals: [spec] };
  const product = { id: "article", version: 1, sections: [{ id: "section", pedagogy, blocks: [] }], visuals: [spec] };
  const input = { articleId: "article", version: 1, sectionId: "row", field: "section_visual" as const, visualId: spec.id, hash: spec.documentSha256, kind: "document" as const, canonical, product };
  expect(authorizeArticleDocument(input)).toEqual(spec);
  expect(authorizeArticleDocument({ ...input, canonical: { ...canonical, sections: [{ ...canonical.sections[0], pedagogy: {} }] } })).toBeNull();
  expect(authorizeArticleDocument({ ...input, product: { ...product, sections: [{ ...product.sections[0], pedagogy: {} }] } })).toBeNull();
  expect(authorizeArticleDocument({ ...input, blockId: "block" })).toBeNull();
});
