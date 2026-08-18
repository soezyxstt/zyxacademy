/**
 * zyx-vector-api ; Cloudflare Worker
 *
 * Exposes the canonical Vectorize profile through a shared-secret boundary.
 * All active routes use canonical-content-v2 and the 768-dimensional index.
 */

// --- Minimal Vectorize types (avoids requiring @cloudflare/workers-types locally) ---

interface VectorizeIndex {
 upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>): Promise<{ count: number; mutationId: string }>;
 query(vector: number[], options: { topK: number; returnMetadata?: 'all' | 'none' | 'indexed'; filter?: Record<string, unknown> }): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>; count: number }>;
 deleteByIds(ids: string[]): Promise<{ count: number; mutationId: string }>;
 getByIds(ids: string[]): Promise<Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>>;
 list?(options: { limit?: number; cursor?: string; prefix?: string }): Promise<{
  vectors: Array<{ id: string }>;
  count?: number;
  totalCount?: number;
  isTruncated?: boolean;
  nextCursor?: string | null;
 }>;
}

import {
  assertCanonicalDelete,
  assertCanonicalGet,
  assertCanonicalList,
  assertCanonicalQuery,
  assertCanonicalProfile,
  assertCanonicalVector,
  type CanonicalDeleteRequest,
  type CanonicalGetRequest,
  type CanonicalListRequest,
  type CanonicalQueryRequest,
  type CanonicalUpsertRequest,
  type CanonicalVectorRecord,
} from "../../lib/vectorize/contracts";

interface Env {
	VECTORIZE_V2?: VectorizeIndex;
	VECTORIZE_SEARCH?: VectorizeIndex;
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

function requireSearchIndex(env: Env): VectorizeIndex {
	if (!env.VECTORIZE_SEARCH) {
		throw new Error('VECTORIZE_SEARCH binding is not configured');
	}
	return env.VECTORIZE_SEARCH;
}

function parseSearchVector(value: unknown): { id: string; values: number[]; metadata?: Record<string, string | number | boolean> } {
	if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.values)) {
		throw new Error('each search vector must contain id and values');
	}
	if (!value.values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
		throw new Error('search vector values must be finite numbers');
	}
	return {
		id: value.id,
		values: value.values,
		metadata: isRecord(value.metadata) ? (value.metadata as Record<string, string | number | boolean>) : undefined,
	};
}

function parseSearchUpsert(value: unknown): { vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }> } {
	if (!isRecord(value) || !Array.isArray(value.vectors) || value.vectors.length === 0) {
		throw new Error('search upsert requires a non-empty vectors array');
	}
	return {
		vectors: value.vectors.map(parseSearchVector),
	};
}

function parseSearchDelete(value: unknown): { ids: string[] } {
	if (!isRecord(value) || !Array.isArray(value.ids) || value.ids.length === 0 || !value.ids.every((id) => typeof id === 'string' && id.trim().length > 0)) {
		throw new Error('search delete requires a non-empty string ids array');
	}
	return {
		ids: value.ids,
	};
}

function parseSearchQuery(value: unknown): {
	vector: number[];
	topK?: number;
	min_role?: number;
	course_id?: string;
	entity_type?: string;
	filter?: Record<string, unknown>;
} {
	if (!isRecord(value) || !Array.isArray(value.vector) || value.vector.length === 0) {
		throw new Error('search query requires a non-empty vector array');
	}
	if (!value.vector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
		throw new Error('search query vector must contain finite numbers');
	}
	return {
		vector: value.vector,
		topK: typeof value.topK === 'number' ? value.topK : undefined,
		min_role: typeof value.min_role === 'number' ? value.min_role : undefined,
		course_id: typeof value.course_id === 'string' ? value.course_id : undefined,
		entity_type: typeof value.entity_type === 'string' ? value.entity_type : undefined,
		filter: isRecord(value.filter) ? value.filter : undefined,
	};
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

function parseCanonicalList(value: unknown): CanonicalListRequest {
 if (!isRecord(value) || typeof value.profileId !== 'string') {
  throw new Error('canonical list requires profileId');
 }
 const request = {
  profileId: value.profileId,
  ...(typeof value.limit === 'number' ? { limit: value.limit } : {}),
  ...(typeof value.cursor === 'string' ? { cursor: value.cursor } : {}),
  ...(typeof value.prefix === 'string' ? { prefix: value.prefix } : {}),
 } as CanonicalListRequest;
 assertCanonicalProfile(request.profileId);
 if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1000)) {
  throw new Error('canonical list limit must be an integer between 1 and 1000');
 }
 if (request.cursor !== undefined && request.cursor.trim().length === 0) throw new Error('canonical list cursor must be non-empty');
 if (request.prefix !== undefined && request.prefix.trim().length === 0) throw new Error('canonical list prefix must be non-empty');
 assertCanonicalList(request);
 return request;
}

function parseCanonicalGet(value: unknown): CanonicalGetRequest {
 if (!isRecord(value) || typeof value.profileId !== 'string' || !Array.isArray(value.ids)) {
  throw new Error('canonical get requires profileId and ids');
 }
 const request = { profileId: value.profileId, ids: value.ids } as CanonicalGetRequest;
 assertCanonicalProfile(request.profileId);
 if (request.ids.length === 0 || request.ids.length > 1000 || !request.ids.every((id) => typeof id === 'string')) {
  throw new Error('canonical get requires between 1 and 1000 string IDs');
 }
	assertCanonicalGet(request);
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
		// Every route uses the explicitly selected canonical binding.
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

		if (pathname === '/v2/list') {
			const requestBody = parseCanonicalList(body);
			const list = requireCanonicalIndex(env).list;
			if (!list) {
				return json({ ok: false, error: { code: 'V2_LIST_UNAVAILABLE', message: 'Vectorize list is unavailable on this binding' } }, 503);
			}
			const result = await list({
				...(requestBody.limit !== undefined ? { limit: requestBody.limit } : {}),
				...(requestBody.cursor !== undefined ? { cursor: requestBody.cursor } : {}),
				...(requestBody.prefix !== undefined ? { prefix: requestBody.prefix } : {}),
			});
			return json({
				ids: result.vectors.map((vector) => vector.id),
				count: result.count ?? result.vectors.length,
				totalCount: result.totalCount,
				isTruncated: result.isTruncated ?? Boolean(result.nextCursor),
				...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
			});
		}

		if (pathname === '/v2/get') {
			const requestBody = parseCanonicalGet(body);
			const vectors = await requireCanonicalIndex(env).getByIds(requestBody.ids);
			return json({
				vectors,
			});
		}

		if (pathname === '/v2/search/upsert') {
			const requestBody = parseSearchUpsert(body);
			const result = await requireSearchIndex(env).upsert(
				requestBody.vectors.map((vector) => ({
					id: vector.id,
					values: vector.values,
					metadata: vector.metadata ? { ...vector.metadata } : {},
				})),
			);
			return json({ ok: true, count: result.count, mutationId: result.mutationId });
		}

		if (pathname === '/v2/search/query') {
			const requestBody = parseSearchQuery(body);
			const filter: Record<string, unknown> = {
				...(requestBody.filter || {}),
			};
			if (typeof requestBody.min_role === 'number') {
				filter.min_role = { $lte: requestBody.min_role };
			} else if (filter.min_role !== undefined && typeof filter.min_role === 'number') {
				filter.min_role = { $lte: filter.min_role };
			}
			if (typeof requestBody.course_id === 'string' && requestBody.course_id.trim().length > 0) {
				filter.course_id = { $eq: requestBody.course_id };
			}
			if (typeof requestBody.entity_type === 'string' && requestBody.entity_type.trim().length > 0) {
				filter.entity_type = { $eq: requestBody.entity_type };
			}

			const result = await requireSearchIndex(env).query(requestBody.vector, {
				topK: typeof requestBody.topK === 'number' && requestBody.topK > 0 ? requestBody.topK : 20,
				returnMetadata: 'all',
				...(Object.keys(filter).length > 0 ? { filter } : {}),
			});
			return json(result);
		}

		if (pathname === '/v2/search/delete') {
			const requestBody = parseSearchDelete(body);
			const result = await requireSearchIndex(env).deleteByIds(requestBody.ids);
			return json({ ok: true, count: result.count, mutationId: result.mutationId });
		}

		return new Response('Not found', { status: 404 });
	} catch (err: unknown) {
		if (pathname.startsWith('/v2/')) {
			if (err instanceof Error && err.message === 'VECTORIZE_V2 binding is not configured') {
				return json({ ok: false, error: { code: 'V2_BINDING_UNAVAILABLE', message: err.message } }, 503);
			}
			if (err instanceof Error && err.message === 'VECTORIZE_SEARCH binding is not configured') {
				return json({ ok: false, error: { code: 'SEARCH_BINDING_UNAVAILABLE', message: err.message } }, 503);
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
