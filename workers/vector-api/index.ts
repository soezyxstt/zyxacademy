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

interface Env {
 VECTORIZE: VectorizeIndex;
 SHARED_SECRET: string;
}

// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
 return new Response(JSON.stringify(body), {
 status,
 headers: { 'Content-Type': 'application/json' },
 });
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
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[vector-api] ${pathname} error:`, message);
		return new Response(`Internal error: ${message}`, { status: 500 });
	}
	},
};

export default worker;
