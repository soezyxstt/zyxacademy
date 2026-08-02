/**
 * HTTP client for the zyx-vector-api Cloudflare Worker (P8).
 *
 * Import only from lib/pinecone.ts, lib/vector-store.ts, lib/inngest-functions.ts,
 * and the P8 scripts. Never import this from application UI code.
 *
 * Three helpers are exported for use:
 * vectorizeUpsert ; batch upsert pre-embedded vectors
 * vectorizeQuery ; semantic search
 * vectorizeDelete ; delete by ID list
 *
 * Two predicates control routing:
 * shouldMirrorToVectorize ; true when VECTOR_STORE is 'dual' or 'vectorize'
 * shouldReadFromVectorize ; true when VECTOR_STORE is 'vectorize'
 */

import { env } from '@/lib/env';
import {
  assertCanonicalDelete,
  assertCanonicalQuery,
  assertCanonicalProfile,
  assertCanonicalVector,
  type CanonicalDeleteRequest,
  type CanonicalQueryRequest,
  type CanonicalQueryResult,
  type CanonicalUpsertRequest,
  type CanonicalVectorProvider,
  type CanonicalMutationResult,
} from '@/lib/vectorize/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VzVector {
 id: string;
 values: number[];
 namespace?: string;
 metadata?: Record<string, string | number | boolean>;
}

export interface VzMatch {
 id: string;
 score: number;
 metadata?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Routing predicates
// ---------------------------------------------------------------------------

export function shouldMirrorToVectorize(): boolean {
  const mode = process.env.VECTOR_STORE;
  return (
    (mode === 'dual' || mode === 'vectorize') &&
    !!(process.env.VECTORIZE_WORKER_URL || env?.VECTORIZE_WORKER_URL) &&
    !!(process.env.VECTORIZE_SHARED_SECRET || env?.VECTORIZE_SHARED_SECRET)
  );
}

export function shouldReadFromVectorize(): boolean {
  return (
    process.env.VECTOR_STORE === 'vectorize' &&
    !!(process.env.VECTORIZE_WORKER_URL || env?.VECTORIZE_WORKER_URL) &&
    !!(process.env.VECTORIZE_SHARED_SECRET || env?.VECTORIZE_SHARED_SECRET)
  );
}

// ---------------------------------------------------------------------------
// Internal POST helper
// ---------------------------------------------------------------------------

async function post(path: '/upsert' | '/query' | '/delete', body: unknown): Promise<unknown> {
 const base = env.VECTORIZE_WORKER_URL;
 const secret = env.VECTORIZE_SHARED_SECRET;
 if (!base || !secret) {
 throw new Error('VECTORIZE_WORKER_URL and VECTORIZE_SHARED_SECRET must be set');
 }
 const res = await fetch(`${base}${path}`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${secret}`,
 },
 body: JSON.stringify(body),
 });
 if (!res.ok) {
 const text = await res.text();
 throw new Error(`Vectorize worker ${path} failed (${res.status}): ${text}`);
 }
 return res.json();
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/**
 * Flatten metadata to Vectorize-compatible scalars.
 * Arrays are JSON-stringified so they survive the round-trip.
 */
export function serializeVzMetadata(
 metadata: Record<string, unknown>,
): Record<string, string | number | boolean> {
 const out: Record<string, string | number | boolean> = {};
 for (const [k, v] of Object.entries(metadata)) {
 if (Array.isArray(v)) {
 out[k] = JSON.stringify(v);
 } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
 out[k] = v;
 }
 }
 return out;
}

/**
 * Translate a Pinecone-style flat equality filter { field: value } to the
 * Vectorize operator syntax { field: { $eq: value } }.
 */
export function toVzFilter(
 filter: Record<string, unknown>,
): Record<string, unknown> {
 const out: Record<string, unknown> = {};
 for (const [k, v] of Object.entries(filter)) {
 if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
 out[k] = { $eq: v };
 } else {
 // Pass through already-structured operators
 out[k] = v;
 }
 }
 return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Batch upsert pre-embedded vectors into Vectorize. */
export async function vectorizeUpsert(vectors: VzVector[]): Promise<void> {
 if (!vectors.length) return;
 await post('/upsert', { vectors });
}

/**
 * Query Vectorize by embedding vector.
 * filter uses Pinecone-style flat equality syntax; it is translated internally.
 */
export async function vectorizeQuery(
 vector: number[],
 topK: number,
 namespace: string,
 filter?: Record<string, unknown>,
): Promise<VzMatch[]> {
 const body: Record<string, unknown> = {
 vector,
 topK,
 namespace,
 returnMetadata: 'all',
 };
 if (filter && Object.keys(filter).length > 0) {
 body.filter = toVzFilter(filter);
 }
 const res = (await post('/query', body)) as { matches?: VzMatch[] };
 return res.matches ?? [];
}

/** Delete vectors by ID list. */
export async function vectorizeDelete(ids: string[]): Promise<void> {
 if (!ids.length) return;
 await post('/delete', { ids });
}

// ---------------------------------------------------------------------------
// Canonical-content-v2 provider-neutral client
// ---------------------------------------------------------------------------

export interface CanonicalVectorClientOptions {
  baseUrl?: string;
  sharedSecret?: string;
  fetcher?: typeof fetch;
}

function canonicalClientDefaults(options: CanonicalVectorClientOptions) {
  const baseUrl = options.baseUrl ?? process.env.VECTORIZE_WORKER_URL ?? env.VECTORIZE_WORKER_URL;
  const sharedSecret = options.sharedSecret ?? process.env.VECTORIZE_SHARED_SECRET ?? env.VECTORIZE_SHARED_SECRET;
  if (!baseUrl || !sharedSecret) {
    throw new Error('VECTORIZE_WORKER_URL and VECTORIZE_SHARED_SECRET must be set for canonical-content-v2');
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sharedSecret,
    fetcher: options.fetcher ?? fetch,
  };
}

function createCanonicalRequestClient(options: CanonicalVectorClientOptions): CanonicalVectorProvider {
  const defaults = canonicalClientDefaults(options);

  async function postCanonical<T>(path: '/v2/upsert' | '/v2/query' | '/v2/delete', body: unknown): Promise<T> {
    const response = await defaults.fetcher(`${defaults.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${defaults.sharedSecret}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Vectorize canonical worker ${path} failed (${response.status}): ${text}`);
    }
    return (await response.json()) as T;
  }

  return {
    async upsert(request: CanonicalUpsertRequest): Promise<CanonicalMutationResult> {
      assertCanonicalProfile(request.profileId);
      if (request.vectors.length === 0) throw new Error('canonical upsert requires at least one vector');
      request.vectors.forEach(assertCanonicalVector);
      return postCanonical<CanonicalMutationResult>('/v2/upsert', request);
    },
    async query(request: CanonicalQueryRequest): Promise<CanonicalQueryResult> {
      assertCanonicalQuery(request);
      return postCanonical<CanonicalQueryResult>('/v2/query', request);
    },
    async delete(request: CanonicalDeleteRequest): Promise<CanonicalMutationResult> {
      assertCanonicalDelete(request);
      return postCanonical<CanonicalMutationResult>('/v2/delete', request);
    },
  };
}

/** Creates an authenticated HTTP adapter without exposing provider-native types to callers. */
export function createCanonicalVectorClient(
  options: CanonicalVectorClientOptions = {},
): CanonicalVectorProvider {
  return createCanonicalRequestClient(options);
}

export async function vectorizeCanonicalUpsert(
  request: CanonicalUpsertRequest,
  options: CanonicalVectorClientOptions = {},
): Promise<CanonicalMutationResult> {
  return createCanonicalRequestClient(options).upsert(request);
}

export async function vectorizeCanonicalQuery(
  request: CanonicalQueryRequest,
  options: CanonicalVectorClientOptions = {},
): Promise<CanonicalQueryResult> {
  return createCanonicalRequestClient(options).query(request);
}

export async function vectorizeCanonicalDelete(
  request: CanonicalDeleteRequest,
  options: CanonicalVectorClientOptions = {},
): Promise<CanonicalMutationResult> {
  return createCanonicalRequestClient(options).delete(request);
}
