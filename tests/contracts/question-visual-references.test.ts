import { expect, test } from "bun:test";
import { rejectQuestionVisualReferences } from "@/lib/authoring/question-visual-references";

const spec = { id: "x", kind: "interactive_document", version: 1, label: "X", description: "X", documentSha256: "a".repeat(64), documentBytes: 10, printSha256: "b".repeat(64), printBytes: 10, height: 400, staticFallback: { type: "text", summary: "X", content: "X" }, printCaption: "X" };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec).replace("interactive_document", "interactive\\u005fdocument")}`;

test("worker-safe guard rejects unbound references in every question field", () => {
  for (const question of [
    { prompt: fence, options: [] },
    { prompt: "Pilih", options: [`    ${fence}`] },
    { prompt: "Pilih", options: [], explanation: fence },
  ]) expect(() => rejectQuestionVisualReferences([question])).toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(() => rejectQuestionVisualReferences([{ prompt: "Apa arti interactive_document?", options: [] }])).not.toThrow();
  expect(() => rejectQuestionVisualReferences([{ prompt: "```zyx-visual\n{invalid", options: [] }])).toThrow("QUESTION_VISUAL_FORMAT_INVALID");
  expect(() => rejectQuestionVisualReferences([{ prompt: fence, options: [], explanation: fence }])).toThrow("QUESTION_VISUAL_DISCLOSURE");
});
