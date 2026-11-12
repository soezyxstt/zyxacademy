import { expect, test } from "bun:test";
import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";

test("answer visual metadata and shared references stay out of public projection", () => {
  const hidden = { id: "hidden", kind: "interactive_document", version: 1, label: "SECRET label", description: "SECRET description", documentSha256: "a".repeat(64), documentBytes: 10, printSha256: "b".repeat(64), printBytes: 10, height: 400, staticFallback: { type: "text", summary: "SECRET summary", content: "SECRET fallback" }, printCaption: "SECRET caption" };
  const fence = `\`\`\`zyx-visual\n${JSON.stringify(hidden)}\n\`\`\``;
  const payload = { checkKind: "short_answer", answer: fence, explanation: "Pembahasan" };
  const article = buildPublicArticleReadModel(
    { id: "article", courseId: "course", slug: "article", title: "Article", version: 1, visuals: [hidden] },
    [{ id: "section", slug: "section", title: "Section", visuals: [hidden], pedagogy: { visualRequirement: { status: "required", visualIds: [hidden.id] } } }],
    [{ id: "block", bagianArtikelId: "section", blockType: "retrieval_prompt", content: fence, parts: [{ id: "p1", kind: "visual_ref", visualId: hidden.id }, { id: "p2", kind: "markdown", markdown: fence }], visualIds: [hidden.id], formativeCheckPayload: payload }],
  );
  expect(JSON.stringify(article)).not.toContain("SECRET");
  expect(JSON.stringify(article)).not.toContain(hidden.documentSha256);
  expect(payload.answer).toContain("SECRET fallback");
});

test("malformed hidden visual metadata fails closed for the article registry", () => {
  const visual = { id: "v", kind: "interactive_document", version: 1, label: "SECRET label", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Visual", content: "SECRET fallback" }, printCaption: "Awal" };
  const article = buildPublicArticleReadModel(
    { id: "a", courseId: "c", slug: "a", title: "Article", version: 1, visuals: [visual] },
    [{ id: "s", slug: "s", title: "Section" }],
    [{ id: "b", bagianArtikelId: "s", blockType: "retrieval_prompt", content: "Cek", parts: [{ id: "p", kind: "visual_ref", visualId: "v" }], formativeCheckPayload: { answer: "```zyx-visual\n{invalid}\n```", explanation: "Jawaban" } }],
  );
  expect(JSON.stringify(article)).not.toContain("SECRET");
});
