import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import { referenceQuestionDraftSchema, validateReferenceQuestionDraft } from "@/lib/authoring/reference-question-draft";
import { sourcePackManifestSchema, validateSourcePack } from "@/lib/authoring/source-pack";
import { evaluateSourcePackQuality } from "@/lib/authoring/quality/source-pack";

function fences(filename: string, language: string): string[] {
  const markdown = readFileSync(resolve(import.meta.dir, "../../lib/authoring/playbooks", filename), "utf8");
  return [...markdown.matchAll(new RegExp("^```" + language + "\\n([\\s\\S]*?)^```\\s*$", "gm"))].map(match => match[1]);
}

test("the complete Source Pack playbook example validates with its exact original and Markdown bytes", () => {
  const examples = fences("source-workflow.md", "json");
  expect(examples).toHaveLength(2);
  const manifest = sourcePackManifestSchema.parse(JSON.parse(examples[0]));
  const markdown = fences("source-workflow.md", "markdown");
  const originals = fences("source-workflow.md", "text");
  expect(manifest.documents).toHaveLength(1);
  expect(markdown).toHaveLength(1);
  expect(originals).toHaveLength(1);
  const document = manifest.documents[0];
  const parsed = validateSourcePack(zipSync({
    "manifest.json": Buffer.from(examples[0]),
    [document.markdownPath]: Buffer.from(markdown[0]),
    [document.coveragePath]: Buffer.from(examples[1]),
  }));
  const quality = evaluateSourcePackQuality(parsed, new Map([[document.id, Buffer.from(originals[0])]]));
  expect(quality.valid).toBe(true);
  expect(quality.issues).toEqual([]);
  expect(parsed.documents[0].expectedUnits).toBe(1);
});

test("the historical-reference playbook example passes the actual strict schema and eligibility validator", () => {
  const examples = fences("reference-workflow.md", "json");
  expect(examples).toHaveLength(1);
  const draft = referenceQuestionDraftSchema.parse(JSON.parse(examples[0]));
  const result = validateReferenceQuestionDraft(draft, {
    courseId: "synthetic-course",
    source: {
      category: "soal", title: "Synthetic source title", subcategory: "exercise", year: null,
      checksum: "a".repeat(64), pageCount: 1, fileKey: "synthetic-question-file-key",
    },
    solution: null,
    ideas: new Map([["synthetic-published-idea", {
      id: "synthetic-published-idea", courseId: "synthetic-course", chapterId: "synthetic-chapter", status: "published",
    }]]),
  });
  expect(result.issues).toEqual([]);
  expect(result).toMatchObject({ valid: true, questionCount: 1, eligibleCount: 1 });
});
