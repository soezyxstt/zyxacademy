import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";

mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {} }));
const { validateQuestionVisualAssets } = await import("@/lib/authoring/question-visual-assets");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const html = Buffer.from("<!doctype html><button onclick='this.textContent=2'>1</button>");
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
const spec = { id: "visual-1", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: hash(html), documentBytes: html.length, printSha256: hash(png), printBytes: png.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Keadaan awal" }, printCaption: "Keadaan awal" };
const fence = (value: unknown) => `\`\`\`zyx-visual\n${JSON.stringify(value)}\n\`\`\``;
const question = { prompt: fence(spec), options: ["A", "B"], explanation: "Penjelasan" };
const asset = (bytes: Buffer, extension: string) => ({ path: `visuals/${hash(bytes)}.${extension}`, sha256: hash(bytes), bytes: bytes.length, base64: bytes.toString("base64") });
const assets = [asset(html, "html"), asset(png, "png")];
const { interactiveDocumentsInMarkdown } = await import("@/lib/materials/interactive-document-authorization");

describe("question interactive document envelope", () => {
  test("checks options after the same trim used by persistence", async () => {
    const options = [`    ${fence(spec)}`, "B"];
    await expect(validateQuestionVisualAssets([{ prompt: "Pilih", options }])).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
    expect(await validateQuestionVisualAssets([{ prompt: "Pilih", options }], assets)).toHaveLength(1);
    await expect(validateQuestionVisualAssets([{ prompt: "Pilih", options, explanation: fence(spec) }], assets)).rejects.toThrow("QUESTION_VISUAL_DISCLOSURE");
  });
  test("accepts exact authored HTML and decoded PNG without embedding bytes in question", async () => {
    expect(await validateQuestionVisualAssets([question], assets)).toHaveLength(1);
    expect(await validateQuestionVisualAssets([{ prompt: "Soal biasa", options: [], explanation: "Jawaban" }])).toHaveLength(0);
  });

  test("rejects missing, altered, orphaned and oversized assets", async () => {
    await expect(validateQuestionVisualAssets([question])).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
    await expect(validateQuestionVisualAssets([question], assets.slice(0, 1))).rejects.toThrow("INTERACTIVE_DOCUMENT_ASSET_MISSING");
    await expect(validateQuestionVisualAssets([question], [{ ...assets[0], base64: Buffer.alloc(html.length).toString("base64") }, assets[1]])).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
    await expect(validateQuestionVisualAssets([question], [...assets, asset(Buffer.from("orphan"), "html")])).rejects.toThrow();
    await expect(validateQuestionVisualAssets([{ ...question, prompt: fence({ ...spec, documentBytes: 6 * 1024 * 1024 + 1 }) }], assets)).rejects.toThrow();
    const badPng = Buffer.from("not a png");
    await expect(validateQuestionVisualAssets([{ ...question, prompt: fence({ ...spec, printSha256: hash(badPng), printBytes: badPng.length }) }], [assets[0], asset(badPng, "png")])).rejects.toThrow();
  });

  test("rejects disclosure, inline source and malformed metadata", async () => {
    await expect(validateQuestionVisualAssets([{ ...question, explanation: fence(spec) }], assets)).rejects.toThrow("QUESTION_VISUAL_DISCLOSURE");
    await expect(validateQuestionVisualAssets([{ ...question, prompt: `${question.prompt}\n<script>1</script>` }], assets)).rejects.toThrow("QUESTION_VISUAL_FORMAT_INVALID");
    await expect(validateQuestionVisualAssets([{ ...question, prompt: "```zyx-visual\ninteractive_document\n```" }], assets)).rejects.toThrow("QUESTION_VISUAL_FORMAT_INVALID");
    expect(await validateQuestionVisualAssets([{ ...question, prompt: "Apa arti interactive_document?" }])).toHaveLength(0);
  });

  test("admission matches rendered Markdown fences including encoded and unterminated JSON", async () => {
    const encoded = JSON.stringify(spec).replace("interactive_document", "interactive\\u005fdocument");
    const cases = [`\`\`\`zyx-visual\n${encoded}`, `\`\`\`zyx-visual\n${encoded}\n\`\`\``, `~~~zyx-visual\n${encoded}\n~~~`, `    \`\`\`zyx-visual\n${encoded}`, `> \`\`\`zyx-visual\n> ${encoded}\n> \`\`\``];
    expect(interactiveDocumentsInMarkdown(cases[0])).toHaveLength(1);
    expect(interactiveDocumentsInMarkdown(cases[2])).toHaveLength(0);
    for (const prompt of cases) {
      const rendered = interactiveDocumentsInMarkdown(prompt);
      const pairs = await validateQuestionVisualAssets([{ prompt, options: [] }], rendered.length ? assets : []);
      expect(pairs.length).toBe(rendered.length);
      if (rendered.length) await expect(validateQuestionVisualAssets([{ prompt, options: [] }])).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
    }
    await expect(validateQuestionVisualAssets([{ prompt: "```zyx-visual\n{invalid", options: [] }])).rejects.toThrow("QUESTION_VISUAL_FORMAT_INVALID");
  });
});
