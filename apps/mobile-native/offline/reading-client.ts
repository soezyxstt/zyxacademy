import type { NativeResponse, NativeSessionTransport } from "../network/transport";
import {
  OfflineReadingError,
  READING_ASSET_LIMIT,
  READING_BODY_LIMIT,
  READING_PACKAGE_LIMIT,
  parseOfflineReadingResource,
  readOfflineReadingHeaders,
  readingKey,
  readingResourcePath,
  type OfflineReadingAsset,
  type OfflineReadingDownload,
  type OfflineReadingTarget,
} from "./reading-contract";
import type { NativeOfflineReadingStore } from "./reading-store";
import { NATIVE_OFFLINE_HEADERS, NativeOfflineProtocolError, type NativeOfflineScope } from "./sync-contract";

const MIME = /^image\/(?:png|jpeg|webp|gif|avif)$/;
const REQUEST_TIMEOUT = 20_000;
const CASE_TIMEOUT = 120_000;

function contentType(response: NativeResponse) {
  return response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

async function readBytes(response: NativeResponse, maxBytes: number, sizeRequired = false): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get("content-length");
  const declared = length && /^[0-9]+$/.test(length) ? Number(length) : null;
  if (declared !== null && declared > maxBytes) throw new OfflineReadingError("too-large");
  const reader = response.body?.getReader();
  if (!reader) throw new NativeOfflineProtocolError();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new OfflineReadingError("too-large");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total || (sizeRequired && total !== declared)) throw new NativeOfflineProtocolError();
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function json(response: NativeResponse, maxBytes: number): Promise<unknown> {
  if (contentType(response) !== "application/json") throw new NativeOfflineProtocolError();
  return JSON.parse(new TextDecoder().decode(await readBytes(response, maxBytes))) as unknown;
}

async function failure(response: NativeResponse, asset: boolean): Promise<OfflineReadingError> {
  if (response.status === 401) return new OfflineReadingError("revoked");
  if (response.status === 413) return new OfflineReadingError("too-large");
  if (asset && response.status === 422) return new OfflineReadingError("unsupported");
  if ([403, 404, 409].includes(response.status)) {
    const data = await json(response, 4096).catch(() => null);
    const code = data && typeof data === "object" && "code" in data ? data.code : null;
    if (code === "OFFLINE_ACCESS_REVOKED" || code === "OFFLINE_ACCOUNT_CHANGED") return new OfflineReadingError("revoked");
    if (response.status === 404 || code === "OFFLINE_COURSE_ACCESS_DENIED" || code === "OFFLINE_ACCESS_CHANGED"
      || code === "OFFLINE_MATERIAL_CHANGED") return new OfflineReadingError("changed");
    if (asset && code === "OFFLINE_ASSET_NOT_ADMITTED") return new OfflineReadingError("unsupported");
  }
  return new OfflineReadingError("retry");
}

type Options = {
  scope: NativeOfflineScope;
  verifiedUntil: number;
  repository: () => Promise<NativeOfflineReadingStore>;
  session: NativeSessionTransport | null;
  onRevoked(): Promise<void>;
  now?: () => number;
  checkAsset(bytes: Uint8Array<ArrayBuffer>, digest: string): Promise<boolean>;
};

export function createOfflineReadingController({ scope, verifiedUntil, repository, session, onRevoked, now = Date.now, checkAsset }: Options) {
  const lifetime = new AbortController();
  const flights = new Map<string, { operation: AbortController; promise: Promise<OfflineReadingDownload> }>();
  const forgetting = new Set<string>();
  let revoked = false;

  if (session && (session.scope.origin !== scope.origin || session.scope.accountId !== scope.accountId
    || session.scope.sessionId !== scope.sessionId)) throw new NativeOfflineProtocolError();

  function assertCurrent(signal?: AbortSignal) {
    if (lifetime.signal.aborted || session?.signal.aborted || signal?.aborted || revoked || verifiedUntil <= now()) {
      throw new OfflineReadingError("cancelled");
    }
  }

  const guard = { verifiedUntil, assertCurrent };

  async function request<T>(path: string, operation: AbortSignal, asset: boolean, consume: (response: NativeResponse) => Promise<T>) {
    assertCurrent(operation);
    if (!session) throw new OfflineReadingError("unavailable");
    const request = new AbortController();
    const stopRequest = () => request.abort();
    operation.addEventListener("abort", stopRequest, { once: true });
    const timeout = setTimeout(stopRequest, REQUEST_TIMEOUT);
    let response: NativeResponse | undefined;
    try {
      response = await session.request(path, {
        signal: request.signal,
        retry: "transient-read",
        headers: {
          [NATIVE_OFFLINE_HEADERS.accountId]: scope.accountId,
          [NATIVE_OFFLINE_HEADERS.sessionId]: scope.sessionId,
          Origin: scope.origin,
          Accept: asset ? "image/*" : "application/json",
        },
      });
      if (response.status !== 200) throw await failure(response, asset);
      const result = await consume(response);
      assertCurrent(operation);
      return result;
    } finally {
      response?.dispose();
      operation.removeEventListener("abort", stopRequest);
      clearTimeout(timeout);
    }
  }

  async function perform(target: OfflineReadingTarget, operation: AbortController): Promise<OfflineReadingDownload> {
    const activeGuard = { verifiedUntil, assertCurrent: () => assertCurrent(operation.signal) };
    const timeout = setTimeout(() => operation.abort(), CASE_TIMEOUT);
    let revision: string | undefined;
    let verifiedNetwork = false;
    try {
      const store = await repository();
      const authority = await store.authorize(scope, target, activeGuard);
      if (!authority) return { status: "unavailable" };
      const verify = { revision: authority.descriptor.revision, minCursor: authority.cursor };
      revision = verify.revision;
      const payload = await request(readingResourcePath(target, scope.locale), operation.signal, false, async response => {
        const metadata = readOfflineReadingHeaders(response, scope, { ...verify, now: now() });
        if (response.headers.get("etag") !== `"${metadata.revision}"`) throw new NativeOfflineProtocolError();
        const resource = parseOfflineReadingResource(await json(response, READING_BODY_LIMIT), target, scope, authority.descriptor, metadata);
        return { ...metadata, ...resource };
      });
      const body = new TextEncoder().encode(JSON.stringify(payload.data));
      const assets: OfflineReadingAsset[] = [];
      let remaining = READING_PACKAGE_LIMIT - body.byteLength;
      const leaseExpiresAt = Math.min(verifiedUntil, authority.leaseExpiresAt, payload.leaseExpiresAt);
      let assetLeaseExpiresAt: number | null = null;
      for (const url of payload.assets) {
        const item = await request(url, operation.signal, true, async response => {
          const metadata = readOfflineReadingHeaders(response, scope, { ...verify, minCursor: payload.cursor, now: now() });
          if (metadata.validatedAt < payload.validatedAt) throw new NativeOfflineProtocolError();
          const mime = contentType(response);
          if (!MIME.test(mime)) throw new OfflineReadingError("unsupported");
          const etag = response.headers.get("etag");
          if (!etag || !/^"[a-f0-9]{64}"$/.test(etag)) throw new NativeOfflineProtocolError();
          const bytes = await readBytes(response, Math.min(remaining, READING_ASSET_LIMIT), true);
          if (!await checkAsset(bytes, etag.slice(1, -1))) throw new NativeOfflineProtocolError();
          return { item: { url, mime, bytes }, leaseExpiresAt: metadata.leaseExpiresAt };
        });
        remaining -= item.item.bytes.byteLength;
        assetLeaseExpiresAt = Math.min(assetLeaseExpiresAt ?? Infinity, item.leaseExpiresAt);
        assets.push(item.item);
      }
      verifiedNetwork = true;
      await store.store(scope, { target, revision, cursor: payload.cursor, resetGeneration: authority.resetGeneration,
        validatedAt: payload.validatedAt, leaseExpiresAt, assetLeaseExpiresAt, body, assets }, activeGuard);
      return { status: "saved" };
    } catch (error) {
      try { assertCurrent(operation.signal); } catch { return { status: "cancelled" }; }
      if (!(error instanceof OfflineReadingError)) return { status: "retry" };
      if (error.code === "revoked") {
        revoked = true;
        for (const { operation } of flights.values()) operation.abort();
        await onRevoked().catch(() => {});
        return { status: "unavailable" };
      }
      if (error.code === "changed" && !verifiedNetwork && revision) {
        // This response withdrew or changed the very version we requested.
        const store = await repository().catch(() => null);
        await store?.forget(scope, target, activeGuard, revision).catch(() => {});
      }
      return { status: error.code };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async list() {
      if (revoked || lifetime.signal.aborted || session?.signal.aborted || verifiedUntil <= now()) return [];
      return (await repository()).list(scope, guard);
    },
    async read(target: OfflineReadingTarget) {
      if (revoked || lifetime.signal.aborted || session?.signal.aborted || verifiedUntil <= now()) return null;
      return (await repository()).read(scope, target, guard);
    },
    async forget(target: OfflineReadingTarget) {
      const key = readingKey(target);
      assertCurrent();
      forgetting.add(key);
      flights.get(key)?.operation.abort();
      try {
        return await (await repository()).forget(scope, target, guard);
      } finally {
        forgetting.delete(key);
      }
    },
    download(target: OfflineReadingTarget): Promise<OfflineReadingDownload> {
      if (!session || revoked) return Promise.resolve({ status: "unavailable" });
      const key = readingKey(target);
      if (forgetting.has(key) || lifetime.signal.aborted || session.signal.aborted || verifiedUntil <= now()) {
        return Promise.resolve({ status: "cancelled" });
      }
      const pending = flights.get(key);
      if (pending) return pending.promise;
      const operation = new AbortController();
      const promise = perform(target, operation).finally(() => { flights.delete(key); });
      flights.set(key, { operation, promise });
      return promise;
    },
    dispose() {
      lifetime.abort();
      for (const { operation } of flights.values()) operation.abort();
    },
  };
}
