import { z } from "zod";
import { CANONICAL_VECTOR_PROFILE, type CanonicalVectorMetadata } from "@/lib/vectorize/contracts";

/**
 * Zyx Admin Ops Knowledge Pipeline Contracts.
 *
 * Defines contracts, schemas, error hierarchies, and bounds for the
 * isolated admin_ops_knowledge Vectorize namespace and catalog.
 */

// ============================================================================
// Constants & Policy Bounds
// ============================================================================

export const ADMIN_OPS_KNOWLEDGE_NAMESPACE = "admin_ops_knowledge" as const;
export const ADMIN_DOCUMENT_ENTITY_TYPE = "admin_document" as const;
export const ADMIN_ACCESS_CLASS = "admin" as const;

export const ADMIN_KNOWLEDGE_BOUNDS = {
  retrievalCandidateCount: 12,
  retrievalMaxFinalSources: 6,
  minSnippetLength: 20,
  maxSnippetLength: 1000,
  defaultMaxChunkChars: 2000,
  headingBoost: 0.15,
  headingTermBoost: 0.05,
  pathBoost: 0.05,
  maxBoostTotal: 0.35,
} as const;

// ============================================================================
// Schemas
// ============================================================================

export const AdminKnowledgeSourceTypeSchema = z.enum([
  "doc",
  "schema_projection",
  "catalog",
  "bundle_contract",
  "runbook",
]);
export type AdminKnowledgeSourceType = z.infer<typeof AdminKnowledgeSourceTypeSchema>;

export const AdminKnowledgeSourceStatusSchema = z.enum([
  "active",
  "stale",
  "archived",
]);
export type AdminKnowledgeSourceStatus = z.infer<typeof AdminKnowledgeSourceStatusSchema>;

export const AdminKnowledgeChunkStatusSchema = z.enum([
  "active",
  "stale",
]);
export type AdminKnowledgeChunkStatus = z.infer<typeof AdminKnowledgeChunkStatusSchema>;

export const AdminKnowledgeChunkSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  locator: z.string().min(1),
  headingHierarchy: z.array(z.string()).default([]),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  content: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  version: z.number().int().positive().default(1),
  status: AdminKnowledgeChunkStatusSchema.default("active"),
  vectorId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type AdminKnowledgeChunk = z.infer<typeof AdminKnowledgeChunkSchema>;

export const AdminKnowledgeSourceRecordSchema = z.object({
  id: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceType: AdminKnowledgeSourceTypeSchema,
  title: z.string().min(1),
  version: z.number().int().positive().default(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/i),
  chunkCount: z.number().int().nonnegative().default(0),
  status: AdminKnowledgeSourceStatusSchema.default("active"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lastSyncedAt: z.date().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
}).strict();
export type AdminKnowledgeSourceRecord = z.infer<typeof AdminKnowledgeSourceRecordSchema>;

export const AdminKnowledgeManifestSchema = z.object({
  sourceId: z.string().min(1),
  sourcePath: z.string().min(1),
  version: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/i),
  chunkCount: z.number().int().nonnegative(),
  chunks: z.array(AdminKnowledgeChunkSchema),
}).strict();
export type AdminKnowledgeManifest = z.infer<typeof AdminKnowledgeManifestSchema>;

export const AdminKnowledgeSyncOperationSchema = z.object({
  action: z.enum(["upsert", "delete", "retain", "stale"]),
  sourceId: z.string().min(1),
  chunkId: z.string().min(1),
  vectorId: z.string().min(1),
  reason: z.string().optional(),
}).strict();
export type AdminKnowledgeSyncOperation = z.infer<typeof AdminKnowledgeSyncOperationSchema>;

export const AdminKnowledgeSyncPlanSchema = z.object({
  sourcesToInsert: z.array(z.string()),
  sourcesToUpdate: z.array(z.string()),
  sourcesToRetain: z.array(z.string()),
  sourcesToArchive: z.array(z.string()),
  chunksToUpsert: z.array(AdminKnowledgeChunkSchema),
  chunkIdsToDelete: z.array(z.string()),
  chunkIdsToRetain: z.array(z.string()),
  manifestHash: z.string().min(1),
  operations: z.array(AdminKnowledgeSyncOperationSchema),
}).strict();
export type AdminKnowledgeSyncPlan = z.infer<typeof AdminKnowledgeSyncPlanSchema>;

export const AdminKnowledgeSyncResultSchema = z.object({
  sources: z.object({
    total: z.number().int().nonnegative(),
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
  }),
  chunks: z.object({
    total: z.number().int().nonnegative(),
    upserted: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  }),
  manifestHash: z.string().min(1),
  operations: z.array(AdminKnowledgeSyncOperationSchema),
}).strict();
export type AdminKnowledgeSyncResult = z.infer<typeof AdminKnowledgeSyncResultSchema>;

export const AdminKnowledgeSearchResultSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  source: z.literal("semantic-rag"),
  availability: z.literal("available"),
  title: z.string().min(1),
  filePath: z.string().min(1),
  section: z.string().optional(),
  snippet: z.string().min(1),
  score: z.number(),
  rawScore: z.number().optional(),
  boost: z.number().optional(),
  locator: z.string().optional(),
  version: z.number().int().positive().optional(),
}).strict();
export type AdminKnowledgeSearchResult = z.infer<typeof AdminKnowledgeSearchResultSchema>;

export const AdminKnowledgeRetrievalRequestSchema = z.object({
  query: z.string().min(1),
  callerRole: z.string().min(1),
  limit: z.number().int().positive().max(ADMIN_KNOWLEDGE_BOUNDS.retrievalMaxFinalSources).default(6),
}).strict();
export type AdminKnowledgeRetrievalRequest = z.infer<typeof AdminKnowledgeRetrievalRequestSchema>;

export const AdminKnowledgeRetrievalResultSchema = z.object({
  query: z.string().min(1),
  candidateCount: z.number().int().nonnegative(),
  results: z.array(AdminKnowledgeSearchResultSchema),
  executionMs: z.number().int().nonnegative().optional(),
}).strict();
export type AdminKnowledgeRetrievalResult = z.infer<typeof AdminKnowledgeRetrievalResultSchema>;

// ============================================================================
// Error Classes
// ============================================================================

export class AdminKnowledgeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = "AdminKnowledgeError";
    this.code = code;
    this.details = details;
  }
}

export class AdminKnowledgeSecurityError extends AdminKnowledgeError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "AdminKnowledgeSecurityError";
  }
}

export class AdminKnowledgeAuthError extends AdminKnowledgeError {
  constructor(message = "Admin Ops Knowledge retrieval requires admin access class", details?: Record<string, unknown>) {
    super("UNAUTHORIZED", message, details);
    this.name = "AdminKnowledgeAuthError";
  }
}

export class AdminKnowledgeRetrievalError extends AdminKnowledgeError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "AdminKnowledgeRetrievalError";
  }
}

export class AdminKnowledgeSyncError extends AdminKnowledgeError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "AdminKnowledgeSyncError";
  }
}
