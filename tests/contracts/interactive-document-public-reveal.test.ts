import { expect, mock, test } from "bun:test";
import { buildPublicArticleReadModel } from "@/lib/articles/structured-read-model";

process.env.BETTER_AUTH_SECRET = "test-only-secret";
const hidden = { id: "hidden", kind: "interactive_document", version: 1, label: "SECRET label", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Visual", content: "SECRET fallback" }, printCaption: "Awal" };
const text = `\`\`\`zyx-visual\n${JSON.stringify(hidden)}\n\`\`\``;
const formativeCheck = { checkKind: "short_answer", answer: text, explanation: "Penjelasan" };
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "user", role: "student" } }) } } }));
mock.module("@/lib/course-utils", () => ({ isEnrolled: async () => true }));
mock.module("@/lib/materials/formative-check-server", () => ({ formativeCheckLocatorSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) }, resolvePublishedFormativeCheck: async () => ({ ok: true, context: { formativeCheck, article: { courseId: "course" } } }) }));

test("unique hidden metadata is absent before reveal and present in the authorized response", async () => {
  const model = buildPublicArticleReadModel(
    { id: "article", courseId: "course", slug: "article", title: "Article", version: 1, visuals: [hidden] },
    [{ id: "section", slug: "section", title: "Section" }],
    [{ id: "block", bagianArtikelId: "section", blockType: "retrieval_prompt", content: "Cek", formativeCheckPayload: formativeCheck }],
  );
  expect(JSON.stringify(model)).not.toContain("SECRET");
  const route = await import("@/app/api/materials/formative-check/reveal/route");
  const response = await route.POST(new Request("http://localhost/reveal", { method: "POST", body: JSON.stringify({ articleId: "article", articleVersion: 1, sectionId: "section", blockId: "block" }) }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.answer).toContain("SECRET label");
  expect(result.answer).toContain("SECRET fallback");
  expect(typeof result.visualAccess.answer).toBe("string");
});
