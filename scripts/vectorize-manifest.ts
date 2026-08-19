import { createHash } from "node:crypto";
import type { createClient } from "@libsql/client";
import {
  assertCanonicalMetadata,
  CANONICAL_VECTOR_PROFILE,
  createVersionedVectorId,
  type CanonicalAccessClass,
  type CanonicalEntityType,
  type CanonicalNamespace,
  type CanonicalStatus,
  type CanonicalVectorMetadata,
} from "@/lib/vectorize/contracts";
import { stableStringify } from "@/lib/staging/migration-ledger";

type LibsqlClient = ReturnType<typeof createClient>;
type Row = Record<string, unknown>;

export interface CanonicalManifestEntry {
  vectorId: string;
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  namespace: CanonicalNamespace;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  status: CanonicalStatus;
  accessClass: CanonicalAccessClass;
  language: string;
  courseId?: string;
  chapterId?: string;
  title: string;
  content: string;
  contentHash: string;
  metadata: CanonicalVectorMetadata;
}

function rows(result: { rows: unknown[] }): Row[] {
  return result.rows as Row[];
}

function stringValue(row: Row, key: string, fallback = ""): string {
  const value = row[key];
  return value === null || value === undefined ? fallback : String(value);
}

function optionalString(row: Row, key: string): string | undefined {
  const value = stringValue(row, key);
  return value ? value : undefined;
}

function integerValue(row: Row, key: string, fallback = 1): number {
  const value = Number(row[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRuntimeIndexableReference(row: Row): boolean {
  return stringValue(row, "authoring_visibility") !== "holdout";
}

function entry(input: {
  namespace: CanonicalNamespace;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  status: CanonicalStatus;
  accessClass: CanonicalAccessClass;
  title: string;
  content: string;
  courseId?: string;
  chapterId?: string;
}): CanonicalManifestEntry {
  if (!input.entityId.trim()) throw new Error(`Invalid canonical entity ID ${input.entityId}`);
  if (!input.content.trim()) throw new Error(`Canonical content is empty for ${input.entityType}:${input.entityId}`);
  const hash = contentHash(input.content);
  const metadata: CanonicalVectorMetadata = {
    namespace: input.namespace,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    status: input.status,
    accessClass: input.accessClass,
    language: "id",
    profileId: CANONICAL_VECTOR_PROFILE.id,
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    contentHash: hash,
  };
  assertCanonicalMetadata(metadata);
  return {
    vectorId: createVersionedVectorId(input.entityType, input.entityId, input.version),
    profileId: CANONICAL_VECTOR_PROFILE.id,
    namespace: input.namespace,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    status: input.status,
    accessClass: input.accessClass,
    language: "id",
    ...(input.courseId ? { courseId: input.courseId } : {}),
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    title: input.title,
    content: input.content,
    contentHash: hash,
    metadata,
  };
}

function filterCourse(entries: CanonicalManifestEntry[], courseId: string | undefined): CanonicalManifestEntry[] {
  if (!courseId) return entries;
  return entries.filter((item) => item.courseId === courseId || item.namespace === "itb_question_references");
}

export async function loadCanonicalManifest(client: LibsqlClient, courseId?: string): Promise<CanonicalManifestEntry[]> {
  const result: CanonicalManifestEntry[] = [];

  const ideas = await client.execute(
    "SELECT id, mata_kuliah_id, bab_id, code, canonical_statement, concise_explanation, latex, version, status FROM ide WHERE status = 'published' ORDER BY id",
  );
  for (const row of rows(ideas)) {
    const latex = optionalString(row, "latex");
    const content = [stringValue(row, "canonical_statement"), stringValue(row, "concise_explanation"), latex ? `Formula: ${latex}` : ""]
      .filter(Boolean)
      .join("\n\n");
    result.push(entry({
      namespace: "canonical_ideas",
      entityType: "idea",
      entityId: stringValue(row, "id"),
      version: integerValue(row, "version"),
      status: "published",
      accessClass: "enrolled",
      title: stringValue(row, "code"),
      content,
      courseId: stringValue(row, "mata_kuliah_id"),
      chapterId: stringValue(row, "bab_id"),
    }));
  }

  const articles = await client.execute(
    "SELECT id, mata_kuliah_id, bab_id, title, content_markdown, version FROM artikel WHERE status = 'published' ORDER BY id",
  );
  for (const row of rows(articles)) {
    result.push(entry({
      namespace: "published_articles",
      entityType: "article",
      entityId: stringValue(row, "id"),
      version: integerValue(row, "version"),
      status: "published",
      accessClass: "enrolled",
      title: stringValue(row, "title"),
      content: stringValue(row, "content_markdown"),
      courseId: stringValue(row, "mata_kuliah_id"),
      chapterId: optionalString(row, "bab_id"),
    }));
  }

  const sourceChunks = await client.execute(
    "SELECT sm.mata_kuliah_id AS course_id, sm.bab_id AS chapter_id, ps.id AS chunk_id, sm.title, sm.version AS source_version, ps.content FROM sumber_materi sm JOIN potongan_sumber ps ON ps.sumber_materi_id = sm.id AND ps.source_version = sm.version WHERE sm.status = 'active' AND ps.embedding_eligible = 1 ORDER BY ps.id",
  );
  for (const row of rows(sourceChunks)) {
    result.push(entry({
      namespace: "source_materials",
      entityType: "source_material",
      entityId: stringValue(row, "chunk_id"),
      version: integerValue(row, "source_version"),
      status: "active",
      accessClass: "enrolled",
      title: stringValue(row, "title"),
      content: stringValue(row, "content"),
      courseId: stringValue(row, "course_id"),
      chapterId: optionalString(row, "chapter_id"),
    }));
  }

  const references = await client.execute(
    "SELECT id, source_label, authoring_visibility, content_snapshot, version FROM soal_itb_referensi ORDER BY id",
  );
  for (const row of rows(references)) {
    if (!isRuntimeIndexableReference(row)) continue;
    const content = stableStringify(jsonValue(row.content_snapshot));
    result.push(entry({
      namespace: "itb_question_references",
      entityType: "question_reference",
      entityId: stringValue(row, "id"),
      version: integerValue(row, "version"),
      status: "active",
      accessClass: "public",
      title: stringValue(row, "source_label"),
      content,
    }));
  }

  const questions = await client.execute(
    "SELECT id, mata_kuliah_id, bab_id, prompt, options_snapshot, version FROM soal WHERE status = 'published' ORDER BY id",
  );
  for (const row of rows(questions)) {
    const options = stableStringify(jsonValue(row.options_snapshot));
    result.push(entry({
      namespace: "published_questions",
      entityType: "question",
      entityId: stringValue(row, "id"),
      version: integerValue(row, "version"),
      status: "published",
      accessClass: "enrolled",
      title: "Published question",
      content: `${stringValue(row, "prompt")}\n\nOptions: ${options}`,
      courseId: stringValue(row, "mata_kuliah_id"),
      chapterId: optionalString(row, "bab_id"),
    }));
  }

  const solutions = await client.execute(
    "SELECT ps.id, ps.content, ps.version, s.mata_kuliah_id AS course_id, s.bab_id AS chapter_id FROM pembahasan_soal ps JOIN soal s ON s.id = ps.soal_id WHERE ps.status = 'published' AND s.status = 'published' ORDER BY ps.id",
  );
  for (const row of rows(solutions)) {
    result.push(entry({
      namespace: "published_solutions",
      entityType: "solution",
      entityId: stringValue(row, "id"),
      version: integerValue(row, "version"),
      status: "published",
      accessClass: "restricted_solution",
      title: "Published solution",
      content: stringValue(row, "content"),
      courseId: stringValue(row, "course_id"),
      chapterId: optionalString(row, "chapter_id"),
    }));
  }

  const filtered = filterCourse(result, courseId);
  const ids = new Set<string>();
  for (const item of filtered) {
    if (ids.has(item.vectorId)) throw new Error(`Duplicate canonical vector ID ${item.vectorId}`);
    ids.add(item.vectorId);
  }
  return filtered.sort((left, right) => left.vectorId.localeCompare(right.vectorId));
}

export function manifestMetadata(entryValue: CanonicalManifestEntry): Record<string, unknown> {
  return {
    vectorId: entryValue.vectorId,
    profileId: entryValue.profileId,
    dimensions: CANONICAL_VECTOR_PROFILE.dimensions,
    metadata: entryValue.metadata,
    contentHash: entryValue.contentHash,
  };
}
