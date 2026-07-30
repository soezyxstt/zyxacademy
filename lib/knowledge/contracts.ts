import { z } from 'zod';

/**
 * Knowledge Object domain content kinds.
 * Separated cleanly from instructional roles and Bloom cognition levels.
 */
export const knowledgeKindEnum = z.enum([
  'definition',
  'principle',
  'formula',
  'procedure',
  'example',
  'constraint',
  'misconception',
  'other',
]);
export type KnowledgeKind = z.infer<typeof knowledgeKindEnum>;

/**
 * Instructional role of a Knowledge Object within a curriculum or course.
 */
export const instructionalRoleEnum = z.enum([
  'core',
  'prerequisite',
  'enrichment',
  'assessment_support',
  'reference',
]);
export type InstructionalRole = z.infer<typeof instructionalRoleEnum>;

/**
 * State of an extraction run lifecycle.
 */
export const extractionRunStateEnum = z.enum([
  'staged',
  'accepted',
  'needs_review',
  'failed',
  'superseded',
]);
export type ExtractionRunState = z.infer<typeof extractionRunStateEnum>;

/**
 * Bloom Taxonomy Cognitive Levels (assigned to Learning Objectives, not isolated KOs).
 */
export const bloomLevelEnum = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);
export type BloomLevel = z.infer<typeof bloomLevelEnum>;

/**
 * Zod schema for KO Source Span Provenance.
 */
export const koSourceSpanSchema = z.object({
  sourceDocumentId: z.string().min(1),
  sourceVersion: z.string().min(1).default('1.0'),
  chapterId: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  sourceHash: z.string().min(1),
  excerptHash: z.string().min(1),
  extractionRunId: z.string().optional(),
  supportRole: instructionalRoleEnum.default('core'),
});
export type KoSourceSpan = z.infer<typeof koSourceSpanSchema>;

/**
 * Zod schema for Learning Objective contract.
 */
export const learningObjectiveSchema = z.object({
  id: z.string().min(1),
  objectiveText: z.string().min(1),
  bloomLevel: bloomLevelEnum,
  evidenceSourceIds: z.array(z.string()).default([]),
  relatedKoIds: z.array(z.string()).default([]),
});
export type LearningObjective = z.infer<typeof learningObjectiveSchema>;

/**
 * Zod schema for candidate Knowledge Object input to identity & upsert engine.
 */
export const candidateKoSchema = z.object({
  stableKey: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  knowledgeKind: knowledgeKindEnum.default('other'),
  instructionalRole: instructionalRoleEnum.default('core'),
  sourceSpans: z.array(koSourceSpanSchema).default([]),
  learningObjective: learningObjectiveSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CandidateKo = z.infer<typeof candidateKoSchema>;
