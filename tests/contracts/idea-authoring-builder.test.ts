import { expect, test } from "bun:test";
import { buildIdeaDraft, IDEA_DRAFT_LIMITS, type IdeaDraftInput } from "@/lib/authoring/idea-draft-builder";
import { validateIdeaBundleZip } from "@/lib/bundle/idea-bundle-v2";
import { sha256Bytes } from "@/lib/bundle/validator";
import { ideaDraftFixture } from "../helpers/idea-draft";

function built(input: IdeaDraftInput, context: ReturnType<typeof ideaDraftFixture>["context"]) {
  const result = buildIdeaDraft(input, context);
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result;
}
function codes(input: unknown, context: ReturnType<typeof ideaDraftFixture>["context"]) {
  const result = buildIdeaDraft(input, context);
  if (result.success) throw new Error("Expected a rejected draft");
  return result.issues.map(issue => issue.code);
}

test("direct author input produces a deterministic canonical V3 artifact with server metadata", () => {
  const { input, context } = ideaDraftFixture();
  const original = structuredClone(input);
  const first = built(input, context), retry = built(input, context);
  expect(input).toEqual(original);
  expect(validateIdeaBundleZip(first.bytes).success).toBe(true);
  expect(retry.bytes).toEqual(first.bytes);
  expect(retry.bundle.canonicalChecksum).toBe(first.bundle.canonicalChecksum);
  expect(first.bundle.entities.ideas[0]).toMatchObject({ courseId: "course", chapterId: "chapter", creatorId: "author", version: 1, sourcePolicy: "source_grounded" });
  expect(first.bundle.manifest).toMatchObject({ bundleId: "idea-draft-test", schemaVersion: "idea-bundle.v3", creatorId: "author" });
  expect(first.quality).toMatchObject({ valid: true, metrics: { provenanceCoveragePercent: 100, meaningfulSourceChunkCoveragePercent: 100 } });
  expect(first.bundle.entities.learningSections[0].sourceChunkIds).toEqual([first.bundle.entities.sourceChunks[0].id]);
  expect(Object.keys(first.ideaIds)).toEqual(["power"]);
});

test("source bytes, CRLF checksum and UTF-16 quote offsets remain exact", () => {
  const text = "Awal 😀. Pangkat berarti perkalian berulang. Akhir.";
  const { input, context } = ideaDraftFixture([{ id: "lesson", units: [text] }], true);
  input.ideas[0].sourceRefs[0].quote = "Pangkat berarti perkalian berulang.";
  const result = built(input, context);
  const version = result.bundle.manifest.sourceVersions[0];
  const originalBytes = context.sourcePack.archive.files.get("documents/lesson.md")!;
  expect(result.bundle.files.get(version.contentPath)).toEqual(originalBytes);
  expect(version.checksum).toBe(sha256Bytes(originalBytes));
  const canonicalText = new TextDecoder().decode(originalBytes).replaceAll("\r\n", "\n");
  const provenance = result.bundle.entities.provenance[0];
  expect(canonicalText.slice(provenance.startOffset, provenance.endOffset)).toBe(input.ideas[0].sourceRefs[0].quote);
  expect(provenance.startOffset).toBe(canonicalText.indexOf("Pangkat"));
});

test("ambiguous quotes require an explicit exact offset and never choose a match silently", () => {
  const { input, context } = ideaDraftFixture([{ id: "lesson", units: ["Rumus sama. Cek tanda. Rumus sama."] }]);
  input.ideas[0].sourceRefs[0].quote = "Rumus sama.";
  expect(codes(input, context)).toContain("IDEA_DRAFT_QUOTE_AMBIGUOUS");
  const markdown = new TextDecoder().decode(context.sourcePack.archive.files.get("documents/lesson.md"));
  input.ideas[0].sourceRefs[0].startOffset = markdown.lastIndexOf("Rumus sama.");
  expect(built(input, context).bundle.entities.provenance[0].startOffset).toBe(markdown.lastIndexOf("Rumus sama."));
  input.ideas[0].sourceRefs[0].startOffset!++;
  expect(codes(input, context)).toContain("IDEA_DRAFT_QUOTE_NOT_FOUND");
});

test("all Source Pack documents and meaningful units participate in coverage", () => {
  const { input, context } = ideaDraftFixture([{ id: "lesson", units: ["Pangkat menyatakan hasil kali dengan faktor yang sama.", "Pangkat nol pada basis bukan nol menghasilkan satu."] },
    { id: "extra", units: ["Pangkat negatif menyatakan kebalikan dari pangkat positif."] }]);
  expect(codes(input, context)).toContain("IDEA_SOURCE_COVERAGE_INCOMPLETE");
  input.ideas[0].sourceRefs.push({ documentId: "lesson", unit: 2, quote: "Pangkat nol pada basis bukan nol menghasilkan satu." },
    { documentId: "extra", unit: 1, quote: "Pangkat negatif menyatakan kebalikan dari pangkat positif." });
  const result = built(input, context);
  expect(result.bundle.entities.sourceMaterials).toHaveLength(2);
  expect(result.bundle.entities.sourceChunks).toHaveLength(3);
  expect(result.quality.metrics.meaningfulSourceChunkCoveragePercent).toBe(100);
});

test("multiple bad references return bounded actionable findings together", () => {
  const { input, context } = ideaDraftFixture();
  input.ideas[0].sourceRefs = [{ documentId: "foreign", unit: 1, quote: "Quote" }, { documentId: "lesson", unit: 1, quote: "Changed source quote" }];
  input.learningSections[0].primaryIdeaKeys.push("missing");
  expect(codes(input, context)).toEqual(["IDEA_DRAFT_SOURCE_OUT_OF_SCOPE", "IDEA_DRAFT_QUOTE_NOT_FOUND", "IDEA_DRAFT_IDEA_NOT_FOUND"]);
});

test("strict author schema rejects caller-controlled identities, versions, policy and metadata", () => {
  const { input, context } = ideaDraftFixture();
  for (const field of ["id", "creatorId", "status", "version", "semanticHash", "sourcePolicy", "chapterId"]) {
    expect(codes({ ...input, ideas: [{ ...input.ideas[0], [field]: "override" }] }, context)).toContain("IDEA_DRAFT_INPUT_INVALID");
  }
  expect(codes({ ...input, sourceMaterials: [] }, context)).toContain("IDEA_DRAFT_INPUT_INVALID");
  expect(codes({ ...input, ideas: [{ ...input.ideas[0], sourceRefs: [{ ...input.ideas[0].sourceRefs[0], role: "tutor_authored" }] }] }, context)).toContain("IDEA_DRAFT_INPUT_INVALID");
});

test("canonical section membership, parent hierarchy and relation cycle gates still run", () => {
  const { input, context } = ideaDraftFixture();
  input.ideas.push({ ...input.ideas[0], key: "zero", code: "ZERO", canonicalStatement: "Pangkat nol bernilai satu pada basis bukan nol." });
  expect(codes(input, context)).toContain("BUNDLE_ENTITY_INVALID");
  input.learningSections[0].primaryIdeaKeys.push("zero");
  input.relations = [{ sourceIdeaKey: "power", targetIdeaKey: "zero", relationType: "prerequisite", explanation: "Gunakan arti pangkat untuk menjelaskan pangkat nol." },
    { sourceIdeaKey: "zero", targetIdeaKey: "power", relationType: "prerequisite", explanation: "Siklus ini harus ditolak." }];
  expect(codes(input, context)).toContain("BUNDLE_PREREQUISITE_CYCLE");
  input.relations = [];
  input.learningSections[0].parentKey = "powers";
  expect(codes(input, context)).toContain("BUNDLE_ENTITY_INVALID");
});

test("stable author keys retain entity IDs when arrays reorder", () => {
  const { input, context } = ideaDraftFixture();
  input.ideas.push({ ...input.ideas[0], key: "zero", code: "ZERO", canonicalStatement: "Pangkat nol bernilai satu pada basis bukan nol." });
  input.learningSections[0].primaryIdeaKeys.push("zero");
  const first = built(input, context);
  input.ideas.reverse();
  const reordered = built(input, context);
  expect(reordered.ideaIds).toEqual(first.ideaIds);
  expect(reordered.sectionIds).toEqual(first.sectionIds);
  expect(reordered.bundle.entities.sourceChunks.map(value => value.id)).toEqual(first.bundle.entities.sourceChunks.map(value => value.id));
  expect(built(input, { ...context, chapterId: "other" }).ideaIds).not.toEqual(first.ideaIds);
});

test("duplicate author keys, codes, repeated evidence and semantic copies are rejected", () => {
  const { input, context } = ideaDraftFixture();
  input.ideas.push(structuredClone(input.ideas[0]));
  expect(codes(input, context)).toContain("IDEA_DRAFT_KEY_DUPLICATE");
  expect(codes(input, context)).toContain("IDEA_DRAFT_CODE_DUPLICATE");
  input.ideas.pop();
  input.ideas[0].sourceRefs.push(structuredClone(input.ideas[0].sourceRefs[0]));
  expect(codes(input, context)).toContain("IDEA_DRAFT_SOURCE_DUPLICATE");
  input.ideas[0].sourceRefs.pop();
  input.ideas.push({ ...input.ideas[0], key: "duplicate", code: "COPY" });
  input.learningSections[0].primaryIdeaKeys.push("duplicate");
  expect(codes(input, context)).toContain("IDEA_SEMANTIC_DUPLICATE_CANDIDATE");
});

test("source byte corruption, excessive input and markup-only quotes cannot produce artifacts", () => {
  const { input, context } = ideaDraftFixture();
  const changed = { ...context, sourcePack: { ...context.sourcePack, archive: { ...context.sourcePack.archive, files: new Map(context.sourcePack.archive.files) } } };
  changed.sourcePack.archive.files.set("documents/lesson.md", new TextEncoder().encode("Forged text"));
  expect(codes(input, changed)).toContain("IDEA_DRAFT_SOURCE_CHECKSUM_MISMATCH");
  expect(codes({ excess: "x".repeat(IDEA_DRAFT_LIMITS.requestBytes) }, context)).toContain("IDEA_DRAFT_REQUEST_TOO_LARGE");
  input.ideas[0].sourceRefs[0].quote = "<!-- source-unit: 1 -->";
  expect(codes(input, context)).toContain("IDEA_DRAFT_INPUT_INVALID");
});
