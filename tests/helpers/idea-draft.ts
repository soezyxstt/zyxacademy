import { strToU8, zipSync } from "fflate";
import { sha256Bytes } from "@/lib/bundle/validator";
import { validateSourcePack } from "@/lib/authoring/source-pack";
import type { IdeaDraftContext, IdeaDraftInput } from "@/lib/authoring/idea-draft-builder";

/** Synthetic source text only. This fixture does not claim original PDF verification. */
export function ideaDraftFixture(documents = [{ id: "lesson", units: ["Pangkat menyatakan perkalian berulang dari bilangan yang sama."] }], crlf = false) {
  const files: Record<string, Uint8Array> = {};
  const counts = { headings: 0, formulas: 0, tables: 0, examples: 0, applications: 0, visuals: 0, questions: 0, solutions: 0 };
  const manifestDocuments = documents.map(document => {
    let markdown = document.units.map((content, index) => `<!-- source-unit: ${index + 1} -->\n${content}\n`).join("");
    if (crlf) markdown = markdown.replaceAll("\n", "\r\n");
    const markdownPath = `documents/${document.id}.md`, coveragePath = `coverage/${document.id}.json`;
    files[markdownPath] = strToU8(markdown);
    files[coveragePath] = strToU8(JSON.stringify({ documentId: document.id, status: "complete", expectedUnits: document.units.length,
      processedUnits: document.units.map((_, index) => index + 1), inventory: counts,
      outputCounts: { headings: 0, formulas: 0, tables: 0, examples: 0, applications: 0, visualExplanations: 0, questions: 0, solutions: 0 },
      unresolved: [], reviewPasses: ["inventory", "transcription", "visual", "reconciliation"] }));
    return { id: document.id, title: document.id, originalFilename: `${document.id}.txt`, originalMediaType: "text/plain",
      originalSha256: sha256Bytes(strToU8(`Original ${document.id}`)), role: "material", unitKind: "page", expectedUnits: document.units.length,
      markdownPath, coveragePath, markdownSha256: sha256Bytes(files[markdownPath]) };
  });
  files["manifest.json"] = strToU8(JSON.stringify({ schemaVersion: "zyx-source-pack.v1", packId: "source-pack", name: "Pangkat", language: "id",
    createdAt: "2026-11-25T00:00:00.000Z", generator: { provider: "openai", model: "test", promptVersion: "test" }, documents: manifestDocuments }));
  const sourcePack = validateSourcePack(zipSync(files, { mtime: new Date("2000-01-01T00:00:00.000Z") }));
  const context: IdeaDraftContext = { bundleId: "idea-draft-test", courseId: "course", chapterId: "chapter", creatorId: "author",
    createdAt: "2026-11-25T00:00:00.000Z", sourcePack };
  const input: IdeaDraftInput = { ideas: [{ key: "power", code: "POWER", canonicalStatement: "Pangkat menyatakan perkalian berulang.",
    conciseExplanation: "Eksponen menentukan berapa kali basis menjadi faktor dalam perkalian.", knowledgeKind: "definition", instructionalRole: "core",
    sourceRefs: [{ documentId: documents[0].id, unit: 1, quote: documents[0].units[0] }],
  }], learningSections: [{ key: "powers", title: "Pangkat", learningObjective: "Menjelaskan arti basis dan eksponen.", primaryIdeaKeys: ["power"] }], relations: [] };
  return { sourcePack, context, input };
}
