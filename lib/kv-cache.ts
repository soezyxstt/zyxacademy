/**
 * Cloudflare Workers KV REST client (P3).
 *
 * Cache semantics only: any failure (missing config, network, timeout, non-2xx)
 * degrades to a silent miss so the caller always falls through to generation.
 *
 * Free-tier guard: KV allows ONLY 1,000 writes/day. A daily counter under
 * `meta:writes:{yyyy-mm-dd}` stops all writes once it reaches WRITE_DAILY_LIMIT.
 */

import { zyraRuntimeEnv } from '@/lib/zyra/runtime-env';
import { todayUtc } from '@/lib/date-utils';

const TIMEOUT_MS = 1500;
const WRITE_DAILY_LIMIT = 900;

function kvBaseUrl(): string | null {
  if (
    !zyraRuntimeEnv.CF_ACCOUNT_ID
    || !zyraRuntimeEnv.CF_KV_NAMESPACE_ID
    || !zyraRuntimeEnv.CF_API_TOKEN
  ) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${zyraRuntimeEnv.CF_ACCOUNT_ID}/storage/kv/namespaces/${zyraRuntimeEnv.CF_KV_NAMESPACE_ID}`;
}

async function kvFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = kvBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${zyraRuntimeEnv.CF_API_TOKEN}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res;
  } catch {
    return null;
  }
}

/** Reads a key. Returns the parsed JSON value, or null on miss/any failure. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const res = await kvFetch(`/values/${encodeURIComponent(key)}`);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function todayKey(): string {
  return `meta:writes:${todayUtc()}`;
}

/**
 * Atomically claims N write slots using KV compare-and-swap (ETag / If-Match).
 * Retries on conflict up to MAX_RETRIES times. Returns true if slots were claimed.
 */
async function claimWriteSlots(slots = 2, maxRetries = 5): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const todayKey_ = todayKey();
    const res = await kvFetch(`/values/${encodeURIComponent(todayKey_)}`);

    let count = 0;
    let etag: string | null = null;

    if (res && res.ok) {
      const text = await res.text().catch(() => '0');
      const n = parseInt(text, 10);
      count = Number.isNaN(n) ? 0 : n;
      etag = res.headers.get('ETag');
    }

    if (count + slots > WRITE_DAILY_LIMIT) return false;

    const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
    if (etag) headers['If-Match'] = etag;

    const putRes = await kvFetch(
      `/values/${encodeURIComponent(todayKey_)}?expiration_ttl=172800`,
      { method: 'PUT', headers, body: String(count + slots) },
    );

    if (!putRes) return false;
    if (putRes.status === 412) continue;
    return putRes.ok;
  }
  return false;
}

/**
 * Writes a JSON value with a TTL. Silently does nothing when the daily
 * write counter is at or past the limit, or on any failure.
 */
export async function kvPut(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const claimed = await claimWriteSlots(2);
  if (!claimed) return;

  await kvFetch(
    `/values/${encodeURIComponent(key)}?expiration_ttl=${Math.max(60, Math.floor(ttlSeconds))}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    },
  );
}

/** Deletes a key. Failures are ignored. */
export async function kvDelete(key: string): Promise<void> {
  await kvFetch(`/values/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
