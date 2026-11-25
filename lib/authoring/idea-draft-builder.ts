import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type IdeaBundleEntityType, type LearningSection, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { sha256Bytes, sha256Text } from "@/lib/bundle/validator";
import { DEFAULT_ZIP_SECURITY_LIMITS } from "@/lib/bundle/zip-reader";
import { ideaDifficultyMetadataSchema, ideaInstructionalRoleSchema, ideaKnowledgeKindSchema, ideaProvenanceRoleSchema, ideaRelationTypeSchema, type Idea, type IdeaProvenance, type IdeaRelation } from "@/lib/ide/contracts";
import type { SourceChunk, SourceMaterial } from "@/lib/sumber/contracts";
import { evaluateIdeaBundleQuality, type IdeaBundleQualityReport } from "./quality/idea-bundle";
import type { ValidatedSourcePack } from "./source-pack";

export const IDEA_DRAFT_LIMITS = { ideas: 256, sections: 128, relations: 1024, sourceRefs: 2048, documents: 128, units: 2048, requestBytes: 524_288, sourceBytes: 16 * 1024 * 1024, issues: 40 } as const;
const key = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/);
const text = z.string().trim().min(1).max(32_000);
const identifier = z.string().trim().min(1).max(256);
const keys = z.array(key).max(IDEA_DRAFT_LIMITS.ideas).refine(value => new Set(value).size === value.length, "Duplicate reference");
const sourceRef = z.object({
  documentId: identifier,
  unit: z.number().int().positive(),
  quote: z.string().min(1).max(65_536).refine(value => value.replace(/<!--[\s\S]*?-->/g, "").trim().length > 0, "Quote source content, not only markup"),
  // Absolute JavaScript string offset into the LF-normalized source. Only needed
  // when the exact quote appears more than once in the selected source unit.
  startOffset: z.number().int().nonnegative().optional(),
  role: ideaProvenanceRoleSchema.exclude(["tutor_authored"]).default("primary"),
  note: text.optional(),
}).strict();

/** Authors supply teaching decisions and source quotes, never hashes or archives. */
export const ideaDraftInputSchema = z.object({
  ideas: z.array(z.object({
    key, code: key, canonicalStatement: text, conciseExplanation: text, latex: text.optional(),
    knowledgeKind: ideaKnowledgeKindSchema, instructionalRole: ideaInstructionalRoleSchema,
    difficultyMetadata: ideaDifficultyMetadataSchema.optional(),
    sourceRefs: z.array(sourceRef).min(1).max(64),
  }).strict()).min(1).max(IDEA_DRAFT_LIMITS.ideas),
  learningSections: z.array(z.object({
    key, title: z.string().trim().min(1).max(1000), learningObjective: text,
    parentKey: key.optional(), slug: key.optional(),
    primaryIdeaKeys: keys.refine(value => value.length > 0, "At least one primary Idea is required"),
    supportingIdeaKeys: keys.default([]),
  }).strict()).min(1).max(IDEA_DRAFT_LIMITS.sections),
  relations: z.array(z.object({ sourceIdeaKey: key, targetIdeaKey: key, relationType: ideaRelationTypeSchema, explanation: text }).strict()).max(IDEA_DRAFT_LIMITS.relations).default([]),
}).strict();
export type IdeaDraftInput = z.input<typeof ideaDraftInputSchema>;
export type IdeaDraftContext = {
  bundleId: string; courseId: string; chapterId: string; creatorId: string; createdAt: string;
  sourcePack: ValidatedSourcePack;
};
export type IdeaDraftIssue = { code: string; message: string; path?: string };
export type IdeaDraftBuildResult =
  | { success: true; bytes: Uint8Array; bundle: ValidatedIdeaBundle; quality: IdeaBundleQualityReport; ideaIds: Record<string, string>; sectionIds: Record<string, string> }
  | { success: false; issues: readonly IdeaDraftIssue[]; issueCount: number };

const encode = (value: unknown) => strToU8(`${serializeDeterministically(value)}\n`);
const hash = (value: unknown) => sha256Text(serializeDeterministically(value));
const idFor = (kind: string, values: unknown[]) => `${kind}:${hash(values).slice(0, 32)}`;
const failed = (issues: readonly IdeaDraftIssue[]): IdeaDraftBuildResult => ({ success: false, issues: issues.slice(0, IDEA_DRAFT_LIMITS.issues), issueCount: issues.length });

/** Pure V3 assembly. Existing admission, review and publication remain separate. */
export function buildIdeaDraft(rawInput: unknown, context: IdeaDraftContext): IdeaDraftBuildResult {
  let size: number;
  try { size = Buffer.byteLength(JSON.stringify(rawInput), "utf8"); }
  catch { return failed([{ code: "IDEA_DRAFT_INPUT_INVALID", message: "Input must be JSON data", path: "draft" }]); }
  if (size > IDEA_DRAFT_LIMITS.requestBytes) return failed([{ code: "IDEA_DRAFT_REQUEST_TOO_LARGE", message: "Keep the draft within the advertised byte limit", path: "draft" }]);
  const parsed = ideaDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) return failed(parsed.error.issues.map(issue => ({ code: "IDEA_DRAFT_INPUT_INVALID", message: issue.message, path: ["draft", ...issue.path].join(".") })));
  const input = parsed.data;
  const issues: IdeaDraftIssue[] = [];
  const issue = (code: string, path: string, message: string) => { issues.push({ code, path, message }); };
  if (input.ideas.reduce((count, idea) => count + idea.sourceRefs.length, 0) > IDEA_DRAFT_LIMITS.sourceRefs) return failed([{ code: "IDEA_DRAFT_REFERENCE_LIMIT", path: "ideas", message: "Too many source references" }]);
  const metadata = z.object({ bundleId: identifier, courseId: identifier, chapterId: identifier, creatorId: identifier, createdAt: z.string().datetime({ offset: true }) }).safeParse(context);
  if (!metadata.success) return failed([{ code: "IDEA_DRAFT_CONTEXT_INVALID", path: "context", message: "The authorized server context is incomplete" }]);
  const pack = context.sourcePack;
  if (pack.manifest.documents.length > IDEA_DRAFT_LIMITS.documents || pack.manifest.documents.reduce((count, document) => count + document.expectedUnits, 0) > IDEA_DRAFT_LIMITS.units) return failed([{ code: "IDEA_DRAFT_SOURCE_LIMIT", path: "sourcePack", message: "The Source Pack exceeds the direct authoring document or unit limit; use the archive workflow" }]);
  const scope = [context.courseId, context.chapterId];
  const stamps = { createdAt: context.createdAt, updatedAt: context.createdAt };
  const files = new Map<string, Uint8Array>();
  const sourceMaterials: SourceMaterial[] = [];
  const sourceChunks: SourceChunk[] = [];
  const sourceVersions: ValidatedIdeaBundle["manifest"]["sourceVersions"] = [];
  const unitChunks = new Map<string, SourceChunk>();
  let totalSourceBytes = 0;

  // All documents and nonempty units are retained. Selecting a few quotes must
  // not hide other source units from the existing source-coverage quality gate.
  for (const document of pack.manifest.documents) {
    const bytes = pack.archive.files.get(document.markdownPath);
    if (!bytes || sha256Bytes(bytes) !== document.markdownSha256) { issue("IDEA_DRAFT_SOURCE_CHECKSUM_MISMATCH", "sourcePack", "The bound source bytes changed; reread the exact Source Pack"); continue; }
    totalSourceBytes += bytes.byteLength;
    if (totalSourceBytes > IDEA_DRAFT_LIMITS.sourceBytes) return failed([{ code: "IDEA_DRAFT_SOURCE_LIMIT", path: "sourcePack", message: "The source text exceeds the direct authoring byte limit; use the archive workflow" }]);
    const sourceId = idFor("source", [...scope, pack.manifest.packId, document.id, document.markdownSha256]);
    const contentPath = `sources/${sourceId.replace(":", "-")}.md`;
    files.set(contentPath, bytes);
    sourceVersions.push({ sourceMaterialId: sourceId, version: 1, checksum: document.markdownSha256, contentPath });
    sourceMaterials.push({ id: sourceId, courseId: context.courseId, chapterId: context.chapterId, sourceType: "markdown", title: document.title,
      canonicalUriOrR2Key: `source-pack:${pack.manifest.packId}:${document.id}:${document.markdownSha256}`, version: 1,
      checksum: document.markdownSha256, status: "active", creatorId: context.creatorId, ...stamps });
    let markdown: string;
    try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replaceAll("\r\n", "\n"); }
    catch { issue("IDEA_DRAFT_SOURCE_INVALID", "sourcePack", "Source text must contain valid UTF-8"); continue; }
    const anchors = [...markdown.matchAll(/<!--\s*source-unit:\s*(\d+)\s*-->/g)];
    if (anchors.length !== document.expectedUnits || anchors.some((anchor, index) => Number(anchor[1]) !== index + 1)) { issue("IDEA_DRAFT_SOURCE_INVALID", "sourcePack", "Source unit sequence does not match the validated document"); continue; }
    for (const [index, anchor] of anchors.entries()) {
      const unit = Number(anchor[1]);
      // The first span includes any source preamble; later spans start after
      // their marker. Raw canonical document bytes remain in the archive.
      const startOffset = index === 0 ? 0 : anchor.index! + anchor[0].length;
      const endOffset = anchors[index + 1]?.index ?? markdown.length;
      const content = markdown.slice(startOffset, endOffset);
      if (!content.replace(/<!--\s*source-unit:\s*\d+\s*-->/g, "").trim()) continue;
      const chunk: SourceChunk = { id: idFor("chunk", [sourceId, unit]), sourceMaterialId: sourceId, sourceVersion: 1,
        content, startOffset, endOffset, checksum: sha256Text(content), embeddingEligible: true,
        ...(document.unitKind === "page" ? { pageNumber: unit } : {}), sectionLocator: `${document.id}:${document.unitKind}:${unit}`, ...stamps };
      sourceChunks.push(chunk);
      unitChunks.set(JSON.stringify([document.id, unit]), chunk);
    }
  }
  if (issues.length) return failed(issues);
  const ideaIds = new Map<string, string>();
  const sectionIds = new Map<string, string>();
  const codes = new Set<string>();
  input.ideas.forEach((idea, index) => {
    if (ideaIds.has(idea.key)) issue("IDEA_DRAFT_KEY_DUPLICATE", `ideas.${index}.key`, "Each Idea key must be unique");
    if (codes.has(idea.code)) issue("IDEA_DRAFT_CODE_DUPLICATE", `ideas.${index}.code`, "Each Idea code must be unique");
    ideaIds.set(idea.key, idFor("idea", [...scope, idea.key])); codes.add(idea.code);
  });
  input.learningSections.forEach((section, index) => {
    if (sectionIds.has(section.key)) issue("IDEA_DRAFT_KEY_DUPLICATE", `learningSections.${index}.key`, "Each learning section key must be unique");
    sectionIds.set(section.key, idFor("section", [...scope, section.key]));
  });
  const ideas: Idea[] = input.ideas.map(idea => {
    const content = { code: idea.code, canonicalStatement: idea.canonicalStatement, conciseExplanation: idea.conciseExplanation,
      latex: idea.latex, knowledgeKind: idea.knowledgeKind, instructionalRole: idea.instructionalRole, difficultyMetadata: idea.difficultyMetadata };
    const value = { id: ideaIds.get(idea.key)!, courseId: context.courseId, chapterId: context.chapterId,
      stableKey: ideaIds.get(idea.key)!, ...content, version: 1, status: "published" as const, schemaVersion: "1.0",
      semanticHash: hash(content), sourcePolicy: "source_grounded" as const, creatorId: context.creatorId, ...stamps };
    // The V3 archive requires publication-ready entity status. This is an inert
    // artifact only; the staging service, review and publish gate own DB state.
    return { ...value, generationHash: hash(value) };
  });
  const provenance: IdeaProvenance[] = [];
  const provenanceIds = new Set<string>();
  for (const [ideaIndex, idea] of input.ideas.entries()) for (const [refIndex, ref] of idea.sourceRefs.entries()) {
    const path = `ideas.${ideaIndex}.sourceRefs.${refIndex}`;
    const chunk = unitChunks.get(JSON.stringify([ref.documentId, ref.unit]));
    if (!chunk) { issue("IDEA_DRAFT_SOURCE_OUT_OF_SCOPE", path, "Use a nonempty document unit from the exact bound Source Pack"); continue; }
    const relative = ref.startOffset === undefined ? chunk.content.indexOf(ref.quote) : ref.startOffset - chunk.startOffset;
    if (relative < 0 || chunk.content.slice(relative, relative + ref.quote.length) !== ref.quote) { issue("IDEA_DRAFT_QUOTE_NOT_FOUND", path, "The quote must match source text exactly within the selected unit (LF line endings)"); continue; }
    if (ref.startOffset === undefined && chunk.content.indexOf(ref.quote, relative + 1) !== -1) { issue("IDEA_DRAFT_QUOTE_AMBIGUOUS", path, "Use a longer unique quote or its exact startOffset; the server never chooses an occurrence silently"); continue; }
    const startOffset = chunk.startOffset + relative;
    const id = idFor("provenance", [ideaIds.get(idea.key), chunk.id, startOffset, startOffset + ref.quote.length, ref.role]);
    if (provenanceIds.has(id)) { issue("IDEA_DRAFT_SOURCE_DUPLICATE", path, "Remove the repeated source reference"); continue; }
    provenanceIds.add(id);
    provenance.push({ id, ideaId: ideaIds.get(idea.key)!, sourceChunkId: chunk.id, provenanceRole: ref.role,
      startOffset, endOffset: startOffset + ref.quote.length, sourceChecksum: chunk.checksum, ...(ref.note ? { note: ref.note } : {}) });
  }
  const siblingOrders = new Map<string, number>();
  const learningSections: LearningSection[] = input.learningSections.map((section, index) => {
    const resolveIdeas = (values: string[], field: string) => values.flatMap((value, ideaIndex) => {
      const id = ideaIds.get(value);
      if (!id) { issue("IDEA_DRAFT_IDEA_NOT_FOUND", `learningSections.${index}.${field}.${ideaIndex}`, "Reference an Idea key in this draft"); return []; }
      return [id];
    });
    const primaryIdeaIds = resolveIdeas(section.primaryIdeaKeys, "primaryIdeaKeys");
    const supportingIdeaIds = resolveIdeas(section.supportingIdeaKeys, "supportingIdeaKeys");
    const parentSectionId = section.parentKey ? sectionIds.get(section.parentKey) : undefined;
    if (section.parentKey && !parentSectionId) issue("IDEA_DRAFT_SECTION_NOT_FOUND", `learningSections.${index}.parentKey`, "Reference a parent section key in this draft");
    const group = section.parentKey ?? "";
    const orderIndex = siblingOrders.get(group) ?? 0;
    siblingOrders.set(group, orderIndex + 1);
    const members = new Set([...primaryIdeaIds, ...supportingIdeaIds]);
    const sourceChunkIds = [...new Set(provenance.filter(item => members.has(item.ideaId)).map(item => item.sourceChunkId))];
    return { id: sectionIds.get(section.key)!, stableKey: sectionIds.get(section.key)!, courseId: context.courseId, chapterId: context.chapterId,
      title: section.title, learningObjective: section.learningObjective, slug: section.slug ?? section.key, orderIndex,
      ...(parentSectionId ? { parentSectionId } : {}), primaryIdeaIds, supportingIdeaIds, sourceChunkIds };
  });
  const relations: IdeaRelation[] = input.relations.flatMap((relation, index) => {
    const sourceIdeaId = ideaIds.get(relation.sourceIdeaKey), targetIdeaId = ideaIds.get(relation.targetIdeaKey);
    if (!sourceIdeaId || !targetIdeaId) { issue("IDEA_DRAFT_IDEA_NOT_FOUND", `relations.${index}`, "Relations must reference Idea keys in this draft"); return []; }
    return [{ id: idFor("relation", [sourceIdeaId, targetIdeaId, relation.relationType]), sourceIdeaId, targetIdeaId,
      relationType: relation.relationType, explanation: relation.explanation, version: 1, status: "active", ...stamps }];
  });
  if (issues.length) return failed(issues);
  const entities: Record<IdeaBundleEntityType, readonly { id: string }[]> = { source_materials: sourceMaterials, source_chunks: sourceChunks, ideas, provenance, relations, learning_sections: learningSections };
  const entityFiles = (Object.keys(entities) as IdeaBundleEntityType[]).map(entityType => {
    const path = `entities/${entityType.replaceAll("_", "-")}.json`;
    const bytes = encode(entities[entityType]); files.set(path, bytes);
    return { path, entityType, checksum: sha256Bytes(bytes), stableIds: entities[entityType].map(value => value.id) };
  });
  const manifestBase = { bundleId: context.bundleId, bundleType: "idea" as const, schemaVersion: "idea-bundle.v3", courseId: context.courseId,
    creatorId: context.creatorId, createdAt: context.createdAt, sourceVersions, entityFiles, conflicts: [] };
  files.set("manifest.json", encode({ ...manifestBase, bundleChecksum: computeIdeaBundleChecksum(manifestBase, files) }));
  let uncompressedBytes = 0;
  for (const [path, bytes] of files) {
    uncompressedBytes += bytes.byteLength;
    if (bytes.byteLength > DEFAULT_ZIP_SECURITY_LIMITS.maxFileBytes) issue("IDEA_DRAFT_ARCHIVE_LIMIT", path, "The generated file exceeds the canonical archive limit; use a smaller scoped Source Pack");
  }
  if (uncompressedBytes > DEFAULT_ZIP_SECURITY_LIMITS.maxUncompressedBytes) issue("IDEA_DRAFT_ARCHIVE_LIMIT", "sourcePack", "The generated archive exceeds the canonical byte limit; use a smaller scoped Source Pack");
  if (issues.length) return failed(issues);
  const validation = validateIdeaBundle(files);
  if (!validation.success) return failed(validation.issues);
  const quality = evaluateIdeaBundleQuality(validation.data);
  if (!quality.valid) return failed(quality.issues.filter(item => item.severity === "blocking"));
  return { success: true, bytes: zipSync(Object.fromEntries(files), { level: 6, mtime: new Date("2000-01-01T00:00:00.000Z") }), bundle: validation.data,
    quality, ideaIds: Object.fromEntries(ideaIds), sectionIds: Object.fromEntries(sectionIds) };
}
