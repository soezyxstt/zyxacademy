import { expect, mock, test } from "bun:test";
import { verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";

process.env.BETTER_AUTH_SECRET = "test-only-secret";
const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Resumo", content: "Conteudo" }, printCaption: "Inicial" };
const visual = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const locator = { articleId: "article", articleVersion: 2, sectionId: "section", blockId: "block" };
let enrolled = false;
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "student", role: "student" } }) } } }));
mock.module("@/lib/course-utils", () => ({ isEnrolled: async () => enrolled }));
mock.module("@/lib/materials/formative-check-server", () => ({ formativeCheckLocatorSchema: { safeParse: () => ({ success: true, data: locator }) }, resolvePublishedFormativeCheck: async () => ({ ok: true, context: { article: { courseId: "course" }, formativeCheck: { checkKind: "short_answer", answer: "Resposta", explanation: visual } } }) }));
const { POST } = await import("@/app/api/materials/formative-check/reveal/route");
const request = () => new Request("http://localhost/reveal", { method: "POST", body: "{}" });

test("only authorized reveal issues an explanation grant", async () => {
  expect((await POST(request())).status).toBe(403);
  enrolled = true;
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.visualAccess.answer).toBeUndefined();
  expect(verifyInteractiveDocumentGrant(body.visualAccess.explanation, "student", "test-only-secret")).toMatchObject({ ...locator, userId: "student", field: "explanation" });
});
