/**
 * Provider-neutral contracts for the canonical Vectorize foundation.
 *
 * This module deliberately contains no Cloudflare, Pinecone, database, or
 * environment dependencies. It is shared by the application client, the
 * Worker boundary, and deterministic fake adapters.
 */

import { EMBEDDING_PROFILES } from "../ai/provider/model-registry";

export const CANONICAL_VECTOR_PROFILE = EMBEDDING_PROFILES["canonical-content-v2"];

export const CANONICAL_VECTOR_INDEX = "zyx-vectors-staging-v2" as const;
export const CANONICAL_MAX_TOP_K = 50;

export const CANONICAL_NAMESPACES = [
  "canonical_ideas",
  "published_articles",
  "source_materials",
  "itb_question_references",
  "published_questions",
  "published_solutions",
  "admin_ops_knowledge",
] as const;

export type CanonicalNamespace = (typeof CANONICAL_NAMESPACES)[number];

export const CANONICAL_ENTITY_TYPES = [
  "idea",
  "article",
  "source_material",
  "question_reference",
  "question",
  "solution",
  "admin_document",
] as const;

export type CanonicalEntityType = (typeof CANONICAL_ENTITY_TYPES)[number];

export type CanonicalStatus =
  | "draft"
  | "published"
  | "active"
  | "superseded"
  | "retired"
  | "needs_review";

export type CanonicalAccessClass = "public" | "enrolled" | "restricted_solution" | "admin";

export type VectorMetadataScalar = string | number | boolean;

/**
 * These are the only metadata fields allowed on a canonical vector. The
 * profile and content hash are retained for hydration and reconciliation;
 * they are not automatically indexed by the provider.
 */
export const CANONICAL_METADATA_ALLOWLIST = [
  "namespace",
  "courseId",
  "chapterId",
  "entityType",
  "entityId",
  "status",
  "version",
  "accessClass",
  "language",
  "profileId",
  "contentHash",
] as const;

export type CanonicalMetadataKey = (typeof CANONICAL_METADATA_ALLOWLIST)[number];

/** Vectorize metadata indexes. Keep this list at or below the provider limit. */
export const CANONICAL_INDEXED_METADATA_ALLOWLIST = [
  "namespace",
  "courseId",
  "chapterId",
  "entityType",
  "status",
  "version",
  "accessClass",
  "language",
] as const satisfies readonly CanonicalMetadataKey[];

export interface CanonicalVectorMetadata {
  namespace: CanonicalNamespace;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  status: CanonicalStatus;
  accessClass: CanonicalAccessClass;
  language: string;
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  courseId?: string;
  chapterId?: string;
  contentHash?: string;
}

export interface CanonicalVectorRecord {
  id: string;
  values: number[];
  metadata: CanonicalVectorMetadata;
}

export interface CanonicalUpsertRequest {
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  vectors: CanonicalVectorRecord[];
}

export interface CanonicalDeleteRequest {
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  ids: string[];
}

export type CanonicalFilterValue =
  | VectorMetadataScalar
  | { $eq: VectorMetadataScalar | null }
  | { $ne: VectorMetadataScalar | null }
  | { $in: Array<VectorMetadataScalar | null> }
  | { $nin: Array<VectorMetadataScalar | null> };

export type CanonicalMetadataFilter = Partial<
  Record<(typeof CANONICAL_INDEXED_METADATA_ALLOWLIST)[number], CanonicalFilterValue>
>;

export interface CanonicalQueryRequest {
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  vector: number[];
  topK: number;
  namespace: CanonicalNamespace;
  filter?: CanonicalMetadataFilter;
  capability?: "read:published_solutions";
}

export interface CanonicalVectorMatch {
  id: string;
  score: number;
  metadata: CanonicalVectorMetadata;
}

export interface CanonicalQueryResult {
  matches: CanonicalVectorMatch[];
  count: number;
}

export interface CanonicalListRequest {
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  limit?: number;
  cursor?: string;
  prefix?: string;
}

export interface CanonicalListResult {
  ids: string[];
  count: number;
  totalCount?: number;
  isTruncated: boolean;
  nextCursor?: string;
}

export interface CanonicalGetRequest {
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  ids: string[];
}

export interface CanonicalGetResult {
  vectors: CanonicalVectorRecord[];
}

export interface CanonicalMutationResult {
  count: number;
  mutationId?: string;
}

/** Provider-neutral seam used by the fake adapter and future providers. */
export interface CanonicalVectorProvider {
  upsert(request: CanonicalUpsertRequest): Promise<CanonicalMutationResult>;
  query(request: CanonicalQueryRequest): Promise<CanonicalQueryResult>;
  delete(request: CanonicalDeleteRequest): Promise<CanonicalMutationResult>;
  list(request: CanonicalListRequest): Promise<CanonicalListResult>;
  get(request: CanonicalGetRequest): Promise<CanonicalGetResult>;
}

export type CanonicalEmbeddingPurpose = "document" | "query";

export interface CanonicalEmbeddingInput {
  purpose: CanonicalEmbeddingPurpose;
  text: string;
  title?: string;
}

export interface CanonicalEmbeddingClientRequest {
  model: typeof CANONICAL_VECTOR_PROFILE.model;
  contents: string;
  config: {
    outputDimensionality: typeof CANONICAL_VECTOR_PROFILE.dimensions;
  };
}

export interface CanonicalEmbeddingClientResponse {
  embeddings?: Array<{ values?: number[] }>;
}

export interface CanonicalEmbeddingClient {
  readonly projectId: string;
  embedContent(
    request: CanonicalEmbeddingClientRequest,
  ): Promise<CanonicalEmbeddingClientResponse>;
}

export class VectorizeContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "VectorizeContractError";
    this.code = code;
  }
}

export function assertCanonicalProfile(profileId: string): asserts profileId is typeof CANONICAL_VECTOR_PROFILE.id {
  if (profileId !== CANONICAL_VECTOR_PROFILE.id) {
    throw new VectorizeContractError(
      "PROFILE_MISMATCH",
      `expected ${CANONICAL_VECTOR_PROFILE.id}, received ${profileId}`,
    );
  }
}

export function assertCanonicalDimensions(
  values: readonly number[],
  context: string,
): asserts values is number[] {
  if (values.length !== CANONICAL_VECTOR_PROFILE.dimensions) {
    throw new VectorizeContractError(
      "DIMENSION_MISMATCH",
      `${context} must contain exactly ${CANONICAL_VECTOR_PROFILE.dimensions} values, received ${values.length}`,
    );
  }

  if (!values.every((value) => Number.isFinite(value))) {
    throw new VectorizeContractError("INVALID_VECTOR", `${context} contains a non-finite value`);
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new VectorizeContractError("INVALID_METADATA", `${name} must be non-empty`);
  }
}

function assertVersion(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new VectorizeContractError("INVALID_VERSION", "version must be a positive integer");
  }
}

function assertSafeIdSegment(value: string, name: string): void {
  assertNonEmpty(value, name);
  if (value.includes(":")) {
    throw new VectorizeContractError("INVALID_ID", `${name} cannot contain ':'`);
  }
}

function assertCanonicalEntityId(value: string, name = "entityId"): void {
  assertNonEmpty(value, name);
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new VectorizeContractError("INVALID_ID", `${name} contains a control character`);
  }
}

function encodeVectorEntityId(entityId: string): string {
  return encodeURIComponent(entityId);
}

function decodeVectorEntityId(encodedEntityId: string): string {
  try {
    return decodeURIComponent(encodedEntityId);
  } catch {
    throw new VectorizeContractError("INVALID_ID", "entityId is not valid URI encoding");
  }
}

export function createVersionedVectorId(
  entityType: CanonicalEntityType,
  entityId: string,
  version: number,
): string {
  assertSafeIdSegment(entityType, "entityType");
  assertCanonicalEntityId(entityId);
  assertVersion(version);
  return `v2:${entityType}:${encodeVectorEntityId(entityId)}:${version}`;
}

export function parseVersionedVectorId(id: string): {
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
} {
  const parts = id.split(":");
  if (parts.length !== 4 || parts[0] !== "v2") {
    throw new VectorizeContractError("INVALID_ID", `expected v2:<entityType>:<entityId>:<version>, received ${id}`);
  }

  const [, entityType, encodedEntityId, versionText] = parts;
  if (!CANONICAL_ENTITY_TYPES.includes(entityType as CanonicalEntityType)) {
    throw new VectorizeContractError("INVALID_ID", `unknown entity type ${entityType}`);
  }
  const version = Number(versionText);
  const entityId = decodeVectorEntityId(encodedEntityId);
  assertCanonicalEntityId(entityId);
  if (encodeVectorEntityId(entityId) !== encodedEntityId) {
    throw new VectorizeContractError("INVALID_ID", "entityId is not canonically encoded");
  }
  assertVersion(version);
  return { entityType: entityType as CanonicalEntityType, entityId, version };
}

export function assertCanonicalMetadata(metadata: CanonicalVectorMetadata): void {
  assertCanonicalProfile(metadata.profileId);
  if (!CANONICAL_NAMESPACES.includes(metadata.namespace)) {
    throw new VectorizeContractError("INVALID_NAMESPACE", `unknown namespace ${metadata.namespace}`);
  }
  if (!CANONICAL_ENTITY_TYPES.includes(metadata.entityType)) {
    throw new VectorizeContractError("INVALID_METADATA", `unknown entity type ${metadata.entityType}`);
  }
  assertCanonicalEntityId(metadata.entityId);
  assertVersion(metadata.version);
  assertNonEmpty(metadata.language, "language");
  if (metadata.courseId !== undefined) assertNonEmpty(metadata.courseId, "courseId");
  if (metadata.chapterId !== undefined) assertNonEmpty(metadata.chapterId, "chapterId");
  if (metadata.contentHash !== undefined && !/^[a-f0-9]{64}$/i.test(metadata.contentHash)) {
    throw new VectorizeContractError("INVALID_METADATA", "contentHash must be a SHA-256 hex string");
  }

  const keys = Object.keys(metadata);
  const invalidKeys = keys.filter(
    (key) => !(CANONICAL_METADATA_ALLOWLIST as readonly string[]).includes(key),
  );
  if (invalidKeys.length > 0) {
    throw new VectorizeContractError(
      "METADATA_NOT_ALLOWED",
      `metadata fields are not allowed: ${invalidKeys.join(", ")}`,
    );
  }
}

export function assertCanonicalVector(record: CanonicalVectorRecord): void {
  const parsedId = parseVersionedVectorId(record.id);
  assertCanonicalMetadata(record.metadata);
  assertCanonicalDimensions(record.values, `vector ${record.id}`);
  if (
    parsedId.entityType !== record.metadata.entityType ||
    parsedId.entityId !== record.metadata.entityId ||
    parsedId.version !== record.metadata.version
  ) {
    throw new VectorizeContractError(
      "ID_METADATA_MISMATCH",
      `vector ${record.id} does not match its entity metadata`,
    );
  }
}

export function assertCanonicalTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK < 1 || topK > CANONICAL_MAX_TOP_K) {
    throw new VectorizeContractError(
      "INVALID_TOP_K",
      `topK must be an integer between 1 and ${CANONICAL_MAX_TOP_K}`,
    );
  }
}

export function assertCanonicalList(request: CanonicalListRequest): void {
  assertCanonicalProfile(request.profileId);
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1000)) {
    throw new VectorizeContractError("INVALID_LIST_LIMIT", "list limit must be an integer between 1 and 1000");
  }
  if (request.cursor !== undefined) assertNonEmpty(request.cursor, "cursor");
  if (request.prefix !== undefined) assertNonEmpty(request.prefix, "prefix");
}

export function assertCanonicalGet(request: CanonicalGetRequest): void {
  assertCanonicalProfile(request.profileId);
  if (request.ids.length === 0 || request.ids.length > 1000) {
    throw new VectorizeContractError("INVALID_GET", "canonical get requires between 1 and 1000 IDs");
  }
  request.ids.forEach(parseVersionedVectorId);
}

export function assertCanonicalFilter(filter: CanonicalMetadataFilter | undefined): void {
  if (!filter) return;
  for (const [key, value] of Object.entries(filter)) {
    if (!(CANONICAL_INDEXED_METADATA_ALLOWLIST as readonly string[]).includes(key)) {
      throw new VectorizeContractError("FILTER_NOT_ALLOWED", `metadata field ${key} is not indexed or allowed`);
    }
    if (value === null || value === undefined) {
      throw new VectorizeContractError("INVALID_FILTER", `filter value for ${key} must be explicit`);
    }
  }
}

export function assertCanonicalQuery(request: CanonicalQueryRequest): void {
  assertCanonicalProfile(request.profileId);
  assertCanonicalDimensions(request.vector, "query vector");
  assertCanonicalTopK(request.topK);
  assertCanonicalFilter(request.filter);
  if (request.namespace === "published_solutions" && request.capability !== "read:published_solutions") {
    throw new VectorizeContractError(
      "CAPABILITY_REQUIRED",
      "published_solutions requires the server-side read:published_solutions capability",
    );
  }
}

export function assertCanonicalDelete(request: CanonicalDeleteRequest): void {
  assertCanonicalProfile(request.profileId);
  if (request.ids.length === 0) {
    throw new VectorizeContractError("INVALID_DELETE", "canonical delete requires a non-empty id list");
  }
  request.ids.forEach(parseVersionedVectorId);
}

export function serializeCanonicalEmbeddingInput(input: CanonicalEmbeddingInput): string {
  if (input.text.trim().length === 0) {
    throw new VectorizeContractError("INVALID_EMBEDDING_INPUT", "text must be non-empty");
  }

  if (input.purpose === "query") {
    return `task: search result | query: ${input.text}`;
  }

  const title = input.title?.trim() || "none";
  return `title: ${title} | text: ${input.text}`;
}

export interface ProviderNeutralVectorOutboxUpsert {
  schemaVersion: 2;
  operation: "upsert";
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  vectorId: string;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  content: string;
  metadata: CanonicalVectorMetadata;
}

export interface ProviderNeutralVectorOutboxDelete {
  schemaVersion: 2;
  operation: "delete";
  profileId: typeof CANONICAL_VECTOR_PROFILE.id;
  vectorId: string;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
}

export type ProviderNeutralVectorOutbox =
  | ProviderNeutralVectorOutboxUpsert
  | ProviderNeutralVectorOutboxDelete;

export function createProviderNeutralVectorOutboxUpsert(input: {
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  content: string;
  metadata: Omit<CanonicalVectorMetadata, "profileId" | "entityType" | "entityId" | "version">;
}): ProviderNeutralVectorOutboxUpsert {
  const vectorId = createVersionedVectorId(input.entityType, input.entityId, input.version);
  const metadata: CanonicalVectorMetadata = {
    ...input.metadata,
    profileId: CANONICAL_VECTOR_PROFILE.id,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
  };
  assertCanonicalMetadata(metadata);
  if (input.content.trim().length === 0) {
    throw new VectorizeContractError("INVALID_OUTBOX", "content must be non-empty");
  }
  return {
    schemaVersion: 2,
    operation: "upsert",
    profileId: CANONICAL_VECTOR_PROFILE.id,
    vectorId,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    content: input.content,
    metadata,
  };
}

export function createProviderNeutralVectorOutboxDelete(input: {
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
}): ProviderNeutralVectorOutboxDelete {
  return {
    schemaVersion: 2,
    operation: "delete",
    profileId: CANONICAL_VECTOR_PROFILE.id,
    vectorId: createVersionedVectorId(input.entityType, input.entityId, input.version),
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
  };
}

export function assertProviderNeutralVectorOutbox(payload: ProviderNeutralVectorOutbox): void {
  assertCanonicalProfile(payload.profileId);
  const expectedId = createVersionedVectorId(payload.entityType, payload.entityId, payload.version);
  if (payload.vectorId !== expectedId) {
    throw new VectorizeContractError("INVALID_OUTBOX", "vectorId does not match the entity identity");
  }

  if (payload.operation === "upsert") {
    assertCanonicalMetadata(payload.metadata);
    if (payload.content.trim().length === 0) {
      throw new VectorizeContractError("INVALID_OUTBOX", "content must be non-empty");
    }
  }

  const forbidden = JSON.stringify(payload).match(/pinecone|indexName|namespaceId/i);
  if (forbidden) {
    throw new VectorizeContractError("PROVIDER_FIELD_FORBIDDEN", `provider-specific field ${forbidden[0]} is forbidden`);
  }
}
