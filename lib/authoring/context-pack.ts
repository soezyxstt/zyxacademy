import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { AUTHORING_CONTEXT_CONTRACT, AUTHORING_CONTEXT_POLICY_VERSION, AUTHORING_CONTEXT_SCHEMA_VERSION } from "./policy";
import { assertAuthoringContextSafe, isSafeRelativeCitation, scanAuthoringContext, type RedactionFinding } from "./redaction";

export type AuthoringCourse = { id: string; code?: string; title: string };
export type AuthoringChapter = { id: string; courseId: string; code?: string; title: string; orderIndex: number };
export type AuthoringIdea = {
  id: string;
  courseId: string;
  chapterId: string;
  stableKey: string;
  code: string;
  canonicalStatement: string;
  conciseExplanation: string;
  latex?: string | null;
  knowledgeKind: string;
  instructionalRole: string;
  difficultyMetadata?: Record<string, unknown>;
  version: number;
  status: string;
  sourcePolicy: string;
  semanticHash: string;
  generationHash: string;
  reviewed: boolean;
  stale?: boolean;
};
export type AuthoringSource = {
  id: string;
  courseId: string;
  chapterId?: string | null;
  title: string;
  version: number;
  checksum: string;
  status: string;
  citation?: string;
};
export type AuthoringExcerpt = {
  id: string;
  sourceId: string;
  sourceVersion: number;
  content: string;
  startOffset: number;
  endOffset: number;
  sectionLocator?: string | null;
  pageNumber?: number | null;
  checksum: string;
};
export type AuthoringProvenance = {
  id: string;
  ideaId: string;
  excerptId: string;
  role: string;
  startOffset: number;
  endOffset: number;
  sourceChecksum: string;
};
export type AuthoringRelation = {
  id: string;
  sourceIdeaId: string;
  targetIdeaId: string;
  relationType: string;
  explanation?: string | null;
  version: number;
};
export type AuthoringObjective = {
  id: string;
  courseId: string;
  chapterId: string;
  objectiveText: string;
  bloomLevel: string;
  relatedIdeaIds: readonly string[];
};
export type AuthoringRequirement = { id: string; kind: string; text: string; chapterId?: string | null };
export type AuthoringBenchmark = {
  id: string;
  datasetKey: string;
  authoringVisibility: "allowed" | "holdout";
  version: number;
  checksum: string;
  status: "active" | "retired";
  summary: string;
};

export type AuthoringContextInput = {
  snapshotId: string;
  createdAt: string;
  retentionUntil: string;
  course: AuthoringCourse;
  chapters: readonly AuthoringChapter[];
  ideas: readonly AuthoringIdea[];
  sources: readonly AuthoringSource[];
  excerpts: readonly AuthoringExcerpt[];
  provenance: readonly AuthoringProvenance[];
  relations: readonly AuthoringRelation[];
  objectives: readonly AuthoringObjective[];
  requirements?: readonly AuthoringRequirement[];
  benchmarks?: readonly AuthoringBenchmark[];
};

export type AuthoringContextManifest = {
  schemaVersion: string;
  policyVersion: string;
  packId: string;
  snapshotId: string;
  courseId: string;
  createdAt: string;
  retentionUntil: string;
  files: readonly { path: string; checksum: string; count: number }[];
  holdoutExcludedCount: number;
  packChecksum: string;
};

export type AuthoringContextPack = {
  manifest: AuthoringContextManifest;
  files: ReadonlyMap<string, Uint8Array>;
  checksum: string;
  holdoutExcludedCount: number;
  findings: readonly RedactionFinding[];
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${stable(value)}\n`);
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function project(input: AuthoringContextInput) {
  const eligibleIdeas = [...input.ideas]
    .filter((idea) => idea.courseId === input.course.id && idea.status === "published" && idea.reviewed && idea.stale !== true)
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey) || right.version - left.version || left.id.localeCompare(right.id))
    .filter((idea, index, values) => index === values.findIndex((candidate) => candidate.stableKey === idea.stableKey));
  const ideaIds = new Set(eligibleIdeas.map((idea) => idea.id));
  const eligibleSources = sorted(input.sources.filter((source) => source.courseId === input.course.id && source.status === "active"), (source) => `${source.id}:${source.version}`);
  const sourceIds = new Set(eligibleSources.map((source) => source.id));
  const eligibleExcerpts = sorted(input.excerpts.filter((excerpt) => sourceIds.has(excerpt.sourceId) && eligibleSources.some((source) => source.id === excerpt.sourceId && source.version === excerpt.sourceVersion)), (excerpt) => `${excerpt.sourceId}:${excerpt.startOffset}:${excerpt.endOffset}:${excerpt.id}`);
  const excerptIds = new Set(eligibleExcerpts.map((excerpt) => excerpt.id));
  const eligibleProvenance = sorted(input.provenance.filter((item) => ideaIds.has(item.ideaId) && excerptIds.has(item.excerptId)), (item) => `${item.ideaId}:${item.excerptId}:${item.startOffset}:${item.endOffset}:${item.id}`);
  const eligibleRelations = sorted(input.relations.filter((relation) => ideaIds.has(relation.sourceIdeaId) && ideaIds.has(relation.targetIdeaId)), (relation) => relation.id);
  const eligibleObjectives = sorted(input.objectives.filter((objective) => objective.courseId === input.course.id && objective.relatedIdeaIds.some((id) => ideaIds.has(id))), (objective) => objective.id);
  const eligibleRequirements = sorted((input.requirements ?? []).filter((requirement) => !requirement.chapterId || input.chapters.some((chapter) => chapter.id === requirement.chapterId && chapter.courseId === input.course.id)), (requirement) => requirement.id);
  const benchmarks = sorted(input.benchmarks ?? [], (benchmark) => `${benchmark.datasetKey}:${benchmark.version}:${benchmark.id}`);
  const allowedBenchmarks = benchmarks.filter((benchmark) => benchmark.authoringVisibility === "allowed" && benchmark.status === "active").map((benchmark) => ({ id: benchmark.id, datasetKey: benchmark.datasetKey, version: benchmark.version, checksum: benchmark.checksum, summary: benchmark.summary }));
  return {
    course: { id: input.course.id, code: input.course.code ?? null, title: input.course.title },
    chapters: sorted(input.chapters.filter((chapter) => chapter.courseId === input.course.id), (chapter) => `${chapter.orderIndex}:${chapter.id}`).map((chapter) => ({ id: chapter.id, code: chapter.code ?? null, title: chapter.title, orderIndex: chapter.orderIndex })),
    ideas: eligibleIdeas.map((idea) => ({
      id: idea.id,
      courseId: idea.courseId,
      chapterId: idea.chapterId,
      stableKey: idea.stableKey,
      code: idea.code,
      canonicalStatement: idea.canonicalStatement,
      conciseExplanation: idea.conciseExplanation,
      latex: idea.latex ?? null,
      knowledgeKind: idea.knowledgeKind,
      instructionalRole: idea.instructionalRole,
      difficultyMetadata: idea.difficultyMetadata ?? {},
      version: idea.version,
      status: idea.status,
      sourcePolicy: idea.sourcePolicy,
      semanticHash: idea.semanticHash,
      generationHash: idea.generationHash,
    })),
    sources: eligibleSources.map((source) => ({ id: source.id, chapterId: source.chapterId ?? null, title: source.title, version: source.version, checksum: source.checksum, citation: source.citation && isSafeRelativeCitation(source.citation) ? source.citation : null })),
    excerpts: eligibleExcerpts.map((excerpt) => ({ id: excerpt.id, sourceId: excerpt.sourceId, sourceVersion: excerpt.sourceVersion, content: excerpt.content, startOffset: excerpt.startOffset, endOffset: excerpt.endOffset, sectionLocator: excerpt.sectionLocator ?? null, pageNumber: excerpt.pageNumber ?? null, checksum: excerpt.checksum })),
    provenance: eligibleProvenance,
    relations: eligibleRelations,
    objectives: eligibleObjectives,
    requirements: eligibleRequirements,
    benchmarks: allowedBenchmarks,
  };
}

export function buildAuthoringContextPack(input: AuthoringContextInput): AuthoringContextPack {
  if (input.retentionUntil <= input.createdAt) throw new Error("AUTHORING_CONTEXT_RETENTION_INVALID");
  const projected = project(input);
  const excludedHoldoutCount = (input.benchmarks ?? []).filter((benchmark) => benchmark.authoringVisibility === "holdout").length;
  const packId = `authoring-${hash(`${input.snapshotId}:${input.course.id}:${AUTHORING_CONTEXT_POLICY_VERSION}`).slice(0, 32)}`;
  const entityValues: Record<string, unknown> = {
    "entities/course.json": projected.course,
    "entities/chapters.json": projected.chapters,
    "entities/ideas.json": projected.ideas,
    "entities/sources.json": projected.sources,
    "entities/excerpts.json": projected.excerpts,
    "entities/provenance.json": projected.provenance,
    "entities/relations.json": projected.relations,
    "entities/objectives.json": projected.objectives,
    "entities/requirements.json": projected.requirements,
    "entities/benchmark-summaries.json": projected.benchmarks,
    "contracts/authoring-context.json": AUTHORING_CONTEXT_CONTRACT,
  };
  const fileMap = new Map<string, Uint8Array>();
  for (const [path, value] of Object.entries(entityValues).sort(([left], [right]) => left.localeCompare(right))) fileMap.set(path, bytes(value));
  const fileEntries = [...fileMap.entries()].map(([path, content]) => ({ path, checksum: hash(Buffer.from(content).toString("utf8")), count: Array.isArray(entityValues[path]) ? (entityValues[path] as unknown[]).length : 1 }));
  const manifestWithoutChecksum = { schemaVersion: AUTHORING_CONTEXT_SCHEMA_VERSION, policyVersion: AUTHORING_CONTEXT_POLICY_VERSION, packId, snapshotId: input.snapshotId, courseId: input.course.id, createdAt: input.createdAt, retentionUntil: input.retentionUntil, files: fileEntries, holdoutExcludedCount: excludedHoldoutCount };
  const packChecksum = hash(stable(manifestWithoutChecksum));
  const manifest = { ...manifestWithoutChecksum, packChecksum };
  fileMap.set("manifest.json", bytes(manifest));
  const findings = scanAuthoringContext({ manifest, files: Object.fromEntries(fileMap) });
  assertAuthoringContextSafe({ manifest, files: Object.fromEntries(fileMap) });
  return { manifest, files: fileMap, checksum: packChecksum, holdoutExcludedCount: excludedHoldoutCount, findings };
}

export function serializeAuthoringContextPack(pack: AuthoringContextPack): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of [...pack.files.entries()].sort(([left], [right]) => left.localeCompare(right))) entries[path] = content;
  return zipSync(entries, { level: 6 });
}

export function scanAuthoringContextPack(pack: AuthoringContextPack): readonly RedactionFinding[] {
  return scanAuthoringContext({ manifest: pack.manifest, files: Object.fromEntries(pack.files) });
}
