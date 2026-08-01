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
