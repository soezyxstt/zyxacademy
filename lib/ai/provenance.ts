/**
 * Privacy-safe AI generation provenance hashing and trace recording.
 * Standardized to NEVER store raw prompt text or student copy in database traces.
 */

import { createHash, randomUUID } from 'crypto';
import { db } from '@/db';
import { aiGenerationTraces } from '@/db/schema';

export type TerminalOutcome =
  | 'success'
  | 'rejected'
  | 'quota_exceeded'
  | 'provider_failure'
  | 'invalid_contract';

export interface GenerationTraceData {
  userId?: string;
  useCase?: string;
  stageId: string;
  promptVersion: string;
  policyVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  validatorVersion: string;
  sanitizedInputHash: string;
  evidenceHash?: string;
  model: string;
  route?: string;
  inputTokens: number;
  outputTokens: number;
  retryCount: number;
  terminalOutcome: TerminalOutcome;
  violationCodes?: string[];
  latencyMs: number;
  cacheResult?: 'hit' | 'miss' | 'none';
}

/**
 * Computes a privacy-safe SHA-256 hash of sanitized input variables or prompt parameters.
 */
export function hashSanitizedInput(input: any): string {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input ?? {});
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Computes a privacy-safe SHA-256 hash of context evidence data if provided.
 */
export function hashEvidence(evidence: any): string | undefined {
  if (evidence === undefined || evidence === null) return undefined;
  const serialized = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Records a privacy-safe generation trace to the database.
 * Gracefully swallows DB errors in unit test environments without throwing.
 */
export async function recordGenerationTrace(data: GenerationTraceData): Promise<string> {
  const traceId = `trc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  try {
    if (process.env.MOCK_GEMINI === 'true' && !process.env.DATABASE_URL) {
      // Return synthetic traceId when running in offline contract unit tests without DB
      return traceId;
    }

    await db.insert(aiGenerationTraces).values({
      id: traceId,
      userId: data.userId || null,
      useCase: data.useCase || null,
      stageId: data.stageId,
      promptVersion: data.promptVersion,
      policyVersion: data.policyVersion,
      inputSchemaVersion: data.inputSchemaVersion,
      outputSchemaVersion: data.outputSchemaVersion,
      validatorVersion: data.validatorVersion,
      sanitizedInputHash: data.sanitizedInputHash,
      evidenceHash: data.evidenceHash || null,
      model: data.model,
      route: data.route || null,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      retryCount: data.retryCount,
      terminalOutcome: data.terminalOutcome,
      violationCodes: data.violationCodes && data.violationCodes.length > 0 ? JSON.stringify(data.violationCodes) : null,
      latencyMs: data.latencyMs,
      cacheResult: data.cacheResult || 'none',
    });
  } catch (err: any) {
    console.warn(`[Provenance] Failed to write generation trace: ${err?.message || err}`);
  }

  return traceId;
}
