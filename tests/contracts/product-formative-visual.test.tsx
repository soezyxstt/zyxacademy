import { expect, test } from "bun:test";
import React from "react";
import { ProductFormativeCheck, ProductFormativeReveal, isFormativeOptionInteractiveTarget, isFormativeVisualInputEnter } from "@/components/course/product-learning-blocks";
import { renderWithMessages } from "../helpers/render-with-messages";

const scene = (id: string) => `\`\`\`zyx-visual\n${JSON.stringify({ id, kind: "interactive_scene", label: id, description: "Scene", viewBox: { x: 0, y: 0, width: 20, height: 20 }, parameters: [{ id: "x", label: "X", min: 0, max: 1, step: 1, initial: 0, control: "range" }], shapes: [{ type: "circle", cx: "x", cy: 1, r: 1 }], staticFallback: { type: "text", summary: "Scene awal", content: "Scene awal" } })}\n\`\`\``;

test("formative options and revealed answers render visual Markdown outside selection buttons", () => {
  const html = renderWithMessages(<ProductFormativeCheck content="Pertanyaan" locator={{ articleId: "a", articleVersion: 1, sectionId: "s", blockId: "b" }} formativeCheck={{ checkKind: "multiple_choice", evaluationMode: null, options: [{ id: "a", text: `Pilihan\n\n${scene("option_scene")}` }, { id: "b", text: "Lain" }] }} />);
  expect(html).toContain('role="radio" aria-checked="false"');
  expect(html).toContain('id="option_scene"');
  expect(html.indexOf("</button>", html.indexOf('role="radio"'))).toBeLessThan(html.indexOf('id="option_scene"'));
  expect(html).not.toContain('kind&quot;:&quot;interactive_scene');
  const revealed = renderWithMessages(<ProductFormativeReveal reveal={{ answer: scene("answer_scene"), explanation: scene("explanation_scene") }} />);
  expect(revealed).toContain('id="answer_scene"');
  expect(revealed).toContain('id="explanation_scene"');
  expect(revealed).not.toContain('kind&quot;:&quot;interactive_scene');
});

test("option click guard excludes scene descendants and interactive controls while allowing plain text", () => {
  for (const ancestor of ["button", "input", "select", "textarea", "a", "figure", "[data-learning-visual]"]) {
    const target = { closest: (selector: string) => selector.split(", ").includes(ancestor) ? {} : null } as Element;
    expect(isFormativeOptionInteractiveTarget(target)).toBe(true);
  }
  expect(isFormativeOptionInteractiveTarget({ closest: () => null } as unknown as Element)).toBe(false);
  expect(isFormativeOptionInteractiveTarget({ closest: () => null } as unknown as Element, { contains: () => false } as unknown as Element)).toBe(true);
  const visualInput = { closest: (selector: string) => selector === "[data-learning-visual] input" ? {} : null } as Element;
  expect(isFormativeVisualInputEnter("Enter", visualInput)).toBe(true);
  expect(isFormativeVisualInputEnter(" ", visualInput)).toBe(false);
  expect(isFormativeVisualInputEnter("Enter", { closest: () => null } as unknown as Element)).toBe(false);
});
