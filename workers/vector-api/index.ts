/**
 * zyx-vector-api ; Cloudflare Worker
 *
 * Exposes a thin REST proxy over the Vectorize binding, because Vectorize has
 * no public data-plane REST API. The Next.js app (and scripts) call this Worker
 * via fetch with a shared-secret Authorization header.
 *
 * Endpoints (all POST, JSON body):
 * /upsert { vectors: VectorizeVector[] }
 * /query { vector, topK?, namespace?, filter?, returnMetadata? }
 * /delete { ids: string[] }
 *
 * Run before deploying:
 * wrangler vectorize create zyx-edu --dimensions=1024 --metric=cosine
 * wrangler secret put SHARED_SECRET
 * wrangler deploy
 */

// --- Minimal Vectorize types (avoids requiring @cloudflare/workers-types locally) ---

interface VzVector {
 id: string;
 values: number[];
 namespace?: string;
 metadata?: Record<string, string | number | boolean | string[] | number[]>;
}

interface VzQueryOptions {
 topK: number;
 namespace?: string;
 returnMetadata?: 'all' | 'none' | 'indexed';
 filter?: Record<string, unknown>;
}

interface VzMatch {
 id: string;
 score: number;
 metadata?: Record<string, unknown>;
 namespace?: string;
}

interface VzQueryResult {
 matches: VzMatch[];
 count: number;
}

interface VectorizeIndex {
 upsert(vectors: VzVector[]): Promise<{ count: number; mutationId: string }>;
 query(vector: number[], options: VzQueryOptions): Promise<VzQueryResult>;
 deleteByIds(ids: string[]): Promise<{ count: number; mutationId: string }>;
 getByIds(ids: string[]): Promise<VzVector[]>;
}

import {
  assertCanonicalDelete,
  assertCanonicalQuery,
  assertCanonicalProfile,
  assertCanonicalVector,
  type CanonicalDeleteRequest,
  type CanonicalQueryRequest,
  type CanonicalUpsertRequest,
  type CanonicalVectorRecord,
} from "../../lib/vectorize/contracts";

interface Env {
 VECTORIZE: VectorizeIndex;
 VECTORIZE_V2?: VectorizeIndex;
 SHARED_SECRET: string;
 RESTRICTED_SOLUTION_CAPABILITY?: string;
}

// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
 return new Response(JSON.stringify(body), {
 status,
 headers: { 'Content-Type': 'application/json' },
 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contractError(error: unknown): Response {
 const message = error instanceof Error ? error.message : String(error);
 const code = error && typeof error === 'object' && 'code' in error
  ? String((error as { code: unknown }).code)
  : 'INVALID_CONTRACT';
 const status = code === 'CAPABILITY_REQUIRED' ? 403 : 400;
 return json({ ok: false, error: { code, message } }, status);
}

function requireCanonicalIndex(env: Env): VectorizeIndex {
 if (!env.VECTORIZE_V2) {
  throw new Error('VECTORIZE_V2 binding is not configured');
 }
 return env.VECTORIZE_V2;
}

function parseCanonicalVector(value: unknown): CanonicalVectorRecord {
 if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.values) || !isRecord(value.metadata)) {
  throw new Error('each canonical vector must contain id, values, and metadata');
 }
 const record = value as unknown as CanonicalVectorRecord;
 assertCanonicalVector(record);
 return record;
}

function parseCanonicalUpsert(value: unknown): CanonicalUpsertRequest {
 if (!isRecord(value) || typeof value.profileId !== 'string' || !Array.isArray(value.vectors)) {
  throw new Error('canonical upsert requires profileId and vectors');
 }
 assertCanonicalProfile(value.profileId);
 if (value.vectors.length === 0) throw new Error('canonical upsert requires a non-empty vector list');
 return {
  profileId: value.profileId,
  vectors: value.vectors.map(parseCanonicalVector),
 };
}

function parseCanonicalQuery(value: unknown): CanonicalQueryRequest {
 if (
  !isRecord(value) ||
  typeof value.profileId !== 'string' ||
  !Array.isArray(value.vector) ||
  typeof value.topK !== 'number' ||
  typeof value.namespace !== 'string'
 ) {
  throw new Error('canonical query requires profileId, vector, topK, and namespace');
 }
 const request = value as unknown as CanonicalQueryRequest;
 assertCanonicalQuery(request);
 return request;
}

function parseCanonicalDelete(value: unknown): CanonicalDeleteRequest {
 if (!isRecord(value) || typeof value.profileId !== 'string' || !Array.isArray(value.ids)) {
  throw new Error('canonical delete requires profileId and ids');
 }
 assertCanonicalProfile(value.profileId);
 if (value.ids.length === 0 || !value.ids.every((id) => typeof id === 'string')) {
  throw new Error('canonical delete requires a non-empty string id list');
 }
 const request = { profileId: value.profileId, ids: value.ids };
 assertCanonicalDelete(request);
 return request;
}

const worker = {
	async fetch(request: Request, env: Env): Promise<Response> {
	// Shared-secret auth
	const auth = request.headers.get('Authorization');
	if (!auth || auth !== `Bearer ${env.SHARED_SECRET}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const { pathname } = new URL(request.url);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Invalid JSON body', { status: 400 });
	}

	try {
		// The v2 routes use an explicitly selected binding and the canonical
		// profile contract. The legacy routes below remain unchanged for rollback.
		if (pathname === '/v2/upsert') {
			const requestBody = parseCanonicalUpsert(body);
			const result = await requireCanonicalIndex(env).upsert(
				requestBody.vectors.map((vector) => ({
					id: vector.id,
					values: vector.values,
					metadata: { ...vector.metadata },
				})),
			);
			return json({ ok: true, count: result.count, mutationId: result.mutationId });
		}

		if (pathname === '/v2/query') {
			const requestBody = parseCanonicalQuery(body);
			if (requestBody.namespace === 'published_solutions') {
				if (
					!env.RESTRICTED_SOLUTION_CAPABILITY ||
					requestBody.capability !== 'read:published_solutions' ||
					requestBody.capability !== env.RESTRICTED_SOLUTION_CAPABILITY
				) {
					return json({ ok: false, error: { code: 'CAPABILITY_REQUIRED', message: 'restricted solution capability denied' } }, 403);
				}
			}
			const result = await requireCanonicalIndex(env).query(requestBody.vector, {
				topK: requestBody.topK,
				returnMetadata: 'all',
				filter: {
					...requestBody.filter,
					namespace: { $eq: requestBody.namespace },
				},
			});
			return json(result);
		}

		if (pathname === '/v2/delete') {
			const requestBody = parseCanonicalDelete(body);
			const result = await requireCanonicalIndex(env).deleteByIds(requestBody.ids);
			return json({ ok: true, count: result.count, mutationId: result.mutationId });
		}

		// POST /upsert
		if (pathname === '/upsert') {
		const { vectors } = body as { vectors: VzVector[] };
		if (!Array.isArray(vectors) || vectors.length === 0) {
			return new Response('vectors must be a non-empty array', { status: 400 });
		}
		const result = await env.VECTORIZE.upsert(vectors);
		return json({ ok: true, count: result.count });
		}

		// POST /query
		if (pathname === '/query') {
		const {
			vector,
			topK = 10,
			namespace,
			filter,
			returnMetadata = 'all',
		} = body as {
			vector: number[];
			topK?: number;
			namespace?: string;
			filter?: Record<string, unknown>;
			returnMetadata?: 'all' | 'none' | 'indexed';
		};
		if (!Array.isArray(vector) || vector.length === 0) {
			return new Response('vector must be a non-empty number[]', { status: 400 });
		}
		const opts: VzQueryOptions = { topK, returnMetadata };
		if (namespace !== undefined) opts.namespace = namespace;
		if (filter !== undefined) opts.filter = filter;
		const result = await env.VECTORIZE.query(vector, opts);
		return json(result);
		}

		// POST /delete
		if (pathname === '/delete') {
		const { ids } = body as { ids: string[] };
		if (!Array.isArray(ids) || ids.length === 0) {
			return new Response('ids must be a non-empty string[]', { status: 400 });
		}
		const result = await env.VECTORIZE.deleteByIds(ids);
		return json({ ok: true, count: result.count });
		}

		return new Response('Not found', { status: 404 });
	} catch (err: unknown) {
		if (pathname.startsWith('/v2/')) {
			if (err instanceof Error && err.message === 'VECTORIZE_V2 binding is not configured') {
				return json({ ok: false, error: { code: 'V2_BINDING_UNAVAILABLE', message: err.message } }, 503);
			}
			return contractError(err);
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[vector-api] ${pathname} error:`, message);
		return new Response(`Internal error: ${message}`, { status: 500 });
	}
	},
};

export default worker;
