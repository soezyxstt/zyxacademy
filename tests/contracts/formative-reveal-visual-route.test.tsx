import { expect, mock, test } from "bun:test";
import React from "react";
import { ProductFormativeReveal } from "@/components/course/product-learning-blocks";
import { renderWithMessages } from "../helpers/render-with-messages";

const visual = { id: "answer_scene", kind: "interactive_scene", label: "Jawaban", description: "Diagram", viewBox: { x: 0, y: 0, width: 20, height: 20 }, parameters: [{ id: "x", label: "X", min: 0, max: 1, step: 1, initial: 0, control: "range" }], shapes: [{ type: "circle", cx: "x", cy: 1, r: 1 }], staticFallback: { type: "text", summary: "Awal", content: "Awal" } };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(visual)}\n\`\`\``;
const formativeCheck = { checkKind: "multiple_choice", answer: "fallback", explanation: "Penjelasan", options: [{ isCorrect: true, text: fence }] };
const resolved = { ok: true, context: { formativeCheck, article: { courseId: "course" } } };
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } } }));
mock.module("@/lib/course-utils", () => ({ isEnrolled: async () => true }));
mock.module("@/lib/materials/formative-check-server", () => ({ formativeCheckLocatorSchema: { safeParse: (data: unknown) => ({ success: true, data }) }, resolvePublishedFormativeCheck: async () => resolved }));
mock.module("@/lib/materials/formative-check-draft-server", () => ({ resolveDraftProductFormativeCheck: async () => resolved }));

test("published and draft reveal endpoints preserve a visual-only option as Markdown", async () => {
  const published = await import("@/app/api/materials/formative-check/reveal/route");
  const draft = await import("@/app/api/admin/bundles/product/[id]/formative-check/reveal/route");
  const request = () => new Request("http://localhost/reveal", { method: "POST", body: "{}" });
  for (const response of [await published.POST(request()), await draft.POST(request(), { params: Promise.resolve({ id: "draft" }) })]) {
    expect(response.status).toBe(200);
    const reveal = await response.json();
    expect(reveal.answer).toBe(`A.\n\n${fence}`);
    const html = renderWithMessages(<ProductFormativeReveal reveal={reveal} />);
    expect(html).toContain('id="answer_scene"');
    expect(html).not.toContain('kind&quot;:&quot;interactive_scene');
  }
});
