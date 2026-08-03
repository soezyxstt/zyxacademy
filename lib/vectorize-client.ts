/**
 * Provider-neutral HTTP client for the canonical Vectorize worker boundary.
 * Application code never imports Cloudflare or provider-native types.
 */

import { env } from "@/lib/env";
import {
  assertCanonicalDelete,
  assertCanonicalGet,
  assertCanonicalList,
  assertCanonicalProfile,
  assertCanonicalQuery,
  assertCanonicalVector,
  type CanonicalDeleteRequest,
  type CanonicalGetRequest,
  type CanonicalGetResult,
  type CanonicalListRequest,
  type CanonicalListResult,
  type CanonicalMutationResult,
  type CanonicalQueryRequest,
  type CanonicalQueryResult,
  type CanonicalUpsertRequest,
  type CanonicalVectorProvider,
} from "@/lib/vectorize/contracts";

export interface CanonicalVectorClientOptions {
  baseUrl?: string;
  sharedSecret?: string;
  fetcher?: typeof fetch;
}

const CANONICAL_GET_BATCH_SIZE = 20;

function canonicalClientDefaults(options: CanonicalVectorClientOptions) {
  const baseUrl = options.baseUrl ?? process.env.VECTORIZE_WORKER_URL ?? env.VECTORIZE_WORKER_URL;
  const sharedSecret = options.sharedSecret ?? process.env.VECTORIZE_SHARED_SECRET ?? env.VECTORIZE_SHARED_SECRET;
  if (!baseUrl || !sharedSecret) {
    throw new Error("VECTORIZE_WORKER_URL and VECTORIZE_SHARED_SECRET must be set for canonical-content-v2");
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    sharedSecret,
    fetcher: options.fetcher ?? fetch,
  };
}

function createCanonicalRequestClient(options: CanonicalVectorClientOptions): CanonicalVectorProvider {
  const defaults = canonicalClientDefaults(options);

  async function postCanonical<T>(
    path: "/v2/upsert" | "/v2/query" | "/v2/delete" | "/v2/list" | "/v2/get",
    body: unknown,
  ): Promise<T> {
    const response = await defaults.fetcher(`${defaults.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
      if (request.vectors.length === 0) throw new Error("canonical upsert requires at least one vector");
      request.vectors.forEach(assertCanonicalVector);
      return postCanonical<CanonicalMutationResult>("/v2/upsert", request);
    },
    async query(request: CanonicalQueryRequest): Promise<CanonicalQueryResult> {
      assertCanonicalQuery(request);
      return postCanonical<CanonicalQueryResult>("/v2/query", request);
    },
    async delete(request: CanonicalDeleteRequest): Promise<CanonicalMutationResult> {
      assertCanonicalDelete(request);
      return postCanonical<CanonicalMutationResult>("/v2/delete", request);
    },
    async list(request: CanonicalListRequest): Promise<CanonicalListResult> {
      assertCanonicalList(request);
      return postCanonical<CanonicalListResult>("/v2/list", request);
    },
    async get(request: CanonicalGetRequest): Promise<CanonicalGetResult> {
      assertCanonicalGet(request);
      if (request.ids.length <= CANONICAL_GET_BATCH_SIZE) {
        return postCanonical<CanonicalGetResult>("/v2/get", request);
      }

      const vectors: CanonicalGetResult["vectors"] = [];
      for (let offset = 0; offset < request.ids.length; offset += CANONICAL_GET_BATCH_SIZE) {
        const result = await postCanonical<CanonicalGetResult>("/v2/get", {
          profileId: request.profileId,
          ids: request.ids.slice(offset, offset + CANONICAL_GET_BATCH_SIZE),
        });
        vectors.push(...result.vectors);
      }
      return { vectors };
    },
  };
}

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
