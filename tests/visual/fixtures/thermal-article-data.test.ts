import { expect, test } from "bun:test";
import katex from "katex";
import { buildThermalArticleReadModel } from "./thermal-article-projection";
import { createThermalArticle } from "./thermal-article-data";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { materializeArticleParts, validateArticlePartReferences } from "@/lib/materials/article-parts";

const spec = interactiveDocumentSchema.parse({ id: "brick", kind: "interactive_document", version: 1, label: "Bata", description: "Suhu bata", documentSha256: "b".repeat(64), documentBytes: 1, printSha256: "c".repeat(64), printBytes: 1, height: 500, staticFallback: { type: "text", summary: "Bata", content: "Suhu awal" }, printCaption: "Suhu awal" });

test("thermal article is a schema-valid ordered product with a bound visual and inference", () => {
  const article = productEntitySchema.parse(createThermalArticle(spec));
  if (article.productType !== "article") throw new Error("Expected article");
  expect(article.schemaVersion).toBe("article.v4");
  expect(article.visuals).toEqual([spec]);
  expect(article.chapterId).toBe("thermal-chapter");
  expect(article.sections.map(section => section.kind)).toEqual(["overview", "topic", "summary"]);
  const topic = article.sections.find(section => section.id === "explore")!;
  expect(topic.learningSectionId).toBeTruthy();
  expect(topic.blocks.map(block => block.id)).toEqual(["intro", "visual", "check", "interpret", "model-math"]);
  for (const section of article.sections) {
    const objective = section.pedagogy!.objectives[0];
    expect(section.blocks.some(block => block.id === objective.explanationBlockIds[0])).toBe(true);
    expect(section.blocks.some(block => block.id === objective.formativeCheckBlockIds[0] && block.formativeCheckPayload)).toBe(true);
  }
  const blocks = article.sections.flatMap(section => section.blocks);
  for (const block of blocks) {
    expect(block.contentMarkdown).toBe(materializeArticleParts(block.parts!));
    expect(validateArticlePartReferences(block.parts!, [spec.id])).toEqual([]);
  }
  const topicBlocks = topic.blocks;
  expect(topicBlocks[1].parts?.find(part => part.kind === "visual_ref")).toEqual({ id: "brick-part", kind: "visual_ref", visualId: "brick" });
  const check = topicBlocks[2].formativeCheckPayload!;
  expect(check.evaluation?.mode).toBe("choice");
  expect(check.options?.filter(option => option.isCorrect).map(option => option.id)).toEqual(["b"]);
  expect(topicBlocks[2].contentMarkdown).toContain("menit ke-5 dan ke-30");
  expect(check.explanation).toContain("interval tersebut");
  expect(topicBlocks[4].contentMarkdown).toContain("\\boxed{7{,}01\\times10^{-7}\\,\\mathrm{m^2/s}}");
  const equations = [...topicBlocks[4].contentMarkdown.matchAll(/\$\$([\s\S]*?)\$\$/g)];
  expect(equations).toHaveLength(2);
  for (const equation of equations) expect(katex.renderToString(equation[1], { displayMode: true, throwOnError: true })).toContain("katex-mathml");
  expect(1.9 / (2400 * 1130)).toBeCloseTo(7.0059e-7, 11);
});

test("persisted thermal rows project to the real public reader without answers", () => {
  const model = buildThermalArticleReadModel(spec);
  expect(model.id).toBe("thermal-article");
  expect(model.chapterId).toBe("thermal-chapter");
  expect(model.sections.map(section => section.id)).toEqual(["overview", "explore", "summary"]);
  const topic = model.sections.find(section => section.id === "explore")!;
  expect(topic.blocks.map(block => block.id)).toEqual(["intro", "visual", "check", "interpret", "model-math"]);
  expect(topic.blocks[1].parts?.find(part => part.kind === "visual_ref")).toEqual({ id: "brick-part", kind: "visual_ref", visualId: "brick" });
  expect(topic.blocks[1].visuals?.map(visual => visual.id)).toEqual(["brick"]);
  const publicCheck = JSON.stringify(topic.blocks[2].formativeCheck);
  expect(publicCheck).not.toContain("isCorrect");
  expect(publicCheck).not.toContain("858{,}9");
  const sourceCheck = createThermalArticle(spec).sections[1].blocks[2].formativeCheckPayload!;
  expect(sourceCheck.options?.map(option => option.text)).toEqual(["Selisih membesar.", "Selisih mengecil.", "Selisih tetap."]);
  const calculations = [...sourceCheck.explanation.matchAll(/\$([^$]+)\$/g)].map(match => match[1]);
  expect(calculations).toEqual([
    String.raw`991{,}4 - 132{,}5 = 858{,}9\,^{\circ}\mathrm{C}`,
    String.raw`1177{,}5 - 956{,}6 = 220{,}9\,^{\circ}\mathrm{C}`,
    String.raw`824{,}1\,^{\circ}\mathrm{C}`,
    String.raw`186{,}1\,^{\circ}\mathrm{C}`,
  ]);
  for (const calculation of calculations) expect(katex.renderToString(calculation, { throwOnError: true })).toContain("katex-mathml");
  expect(991.4 - 132.5).toBeCloseTo(858.9, 1);
  expect(1177.5 - 956.6).toBeCloseTo(220.9, 1);
  expect(956.6 - 132.5).toBeCloseTo(824.1, 1);
  expect(1177.5 - 991.4).toBeCloseTo(186.1, 1);
});
