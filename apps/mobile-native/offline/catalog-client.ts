import { inlineImage } from "../network/inline-image";
import type { NativeResponse, NativeSessionTransport } from "../network/transport";
import { offlineCatalogPath, parseOfflineCatalog, type OfflineCatalogTarget, type OfflineLibraryCatalog } from "./catalog-model";
import { readOfflineReadingHeaders } from "./reading-contract";
import { NATIVE_OFFLINE_HEADERS, NativeOfflineProtocolError, type NativeOfflineScope } from "./sync-contract";

const catalogBodyLimit = 800 * 1024;
const thumbnailLimit = 48 * 1024;
const requestTimeout = 8_000;
const imageTypes = /^image\/(?:jpeg|png|webp|gif|avif)$/;

export class OfflineCatalogAccessError extends Error {
  constructor(readonly scope: "session" | "course") { super("Offline catalog access changed"); }
}

async function readBounded(response: NativeResponse, limit: number) {
  if (!response.body || Number(response.headers.get("content-length")) > limit) throw new NativeOfflineProtocolError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) throw new NativeOfflineProtocolError();
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function catalogRequest<T>(session: NativeSessionTransport, scope: NativeOfflineScope, path: string,
  signal: AbortSignal, accept: string, consume: (response: NativeResponse) => Promise<T>) {
  if (signal.aborted) throw new NativeOfflineProtocolError();
  session.assertCurrent();
  const request = new AbortController();
  const abort = () => request.abort();
  const timeout = setTimeout(abort, requestTimeout);
  signal.addEventListener("abort", abort, { once: true });
  let response: NativeResponse | undefined;
  try {
    response = await session.request(path, { signal: request.signal, headers: {
      [NATIVE_OFFLINE_HEADERS.accountId]: scope.accountId, [NATIVE_OFFLINE_HEADERS.sessionId]: scope.sessionId,
      Origin: scope.origin, Accept: accept,
    } });
    if (response.status === 401) throw new OfflineCatalogAccessError("session");
    if (response.status === 403 || response.status === 409) {
      const value = await readBounded(response, 4096).then(bytes => JSON.parse(new TextDecoder().decode(bytes)) as { code?: string }).catch(() => null);
      if (value?.code === "OFFLINE_ACCESS_REVOKED" || value?.code === "OFFLINE_ACCOUNT_CHANGED") throw new OfflineCatalogAccessError("session");
      if (value?.code === "OFFLINE_COURSE_ACCESS_DENIED" || value?.code === "OFFLINE_ACCESS_CHANGED") throw new OfflineCatalogAccessError("course");
    }
    if (response.status !== 200) throw new NativeOfflineProtocolError();
    const data = await consume(response);
    session.assertCurrent();
    if (signal.aborted) throw new NativeOfflineProtocolError();
    return data;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    response?.dispose();
  }
}

export async function fetchOfflineCatalog(session: NativeSessionTransport, scope: NativeOfflineScope, target: OfflineCatalogTarget,
  minimumCursor: string, signal: AbortSignal, grant?: string, now = Date.now): Promise<OfflineLibraryCatalog> {
  const { catalog, thumbnails } = await catalogRequest(session, scope, offlineCatalogPath(target, scope.locale), signal, "application/json", async response => {
    if (response.headers.get("content-type")?.split(";")[0] !== "application/json") throw new NativeOfflineProtocolError();
    const data: unknown = JSON.parse(new TextDecoder().decode(await readBounded(response, catalogBodyLimit)));
    return parseOfflineCatalog(response, data, scope, target, minimumCursor, now(), grant);
  });
  if (catalog.kind === "video_catalog") {
    const images = await Promise.all(thumbnails.slice(0, 4).map(async ({ id, path }) => {
      try {
        const image = await catalogRequest(session, scope, path, signal, "image/*", async response => {
          const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
          if (!imageTypes.test(mime)) throw new NativeOfflineProtocolError();
          const proof = readOfflineReadingHeaders(response, scope, { revision: catalog.revision, minCursor: catalog.cursor, now: now() });
          return { uri: await inlineImage(response, mime, thumbnailLimit), leaseExpiresAt: Math.min(catalog.leaseExpiresAt, proof.leaseExpiresAt) };
        });
        return [id, image] as const;
      } catch (error) {
        if (error instanceof OfflineCatalogAccessError) throw error;
        return null;
      }
    }));
    const byId = new Map(images.flatMap(image => image ? [image] : []));
    return { ...catalog, videos: catalog.videos.map(video => ({ ...video, thumbnail: byId.get(video.id) })) };
  }
  return catalog;
}

export async function syncOfflineCatalogs({
  session, scope, repository, signal, cursorStart = 0, now = Date.now,
}: {
  session: NativeSessionTransport;
  scope: NativeOfflineScope;
  repository: Pick<import("./metadata-store").NativeOfflineMetadataStore, "accessRevision" | "read" | "saveCatalogs">;
  signal: AbortSignal;
  cursorStart?: number;
  now?: () => number;
}): Promise<number> {
  const revision = await repository.accessRevision(scope);
  const snapshot = await repository.read(scope, now());
  if (!snapshot?.cursor || signal.aborted) return cursorStart;
  const minimumCursor = snapshot.cursor;
  const fresh = new Set((snapshot.catalogs ?? []).filter(catalog => catalog.leaseExpiresAt > now() + 60_000 &&
    now() - catalog.validatedAt < (snapshot.metadataMaxAgeMs ?? 86_400_000)).map(catalog => catalog.courseId));
  const targets = snapshot.courses.flatMap(course => course.catalogGrant && !fresh.has(course.id)
    ? [{ target: { kind: "video_catalog", id: course.id, courseId: course.id } as const, grant: course.catalogGrant }] : []);
  const offset = targets.length ? cursorStart % targets.length : 0;
  const candidates: { target: OfflineCatalogTarget; grant?: string }[] = [...targets.slice(offset), ...targets.slice(0, offset)].slice(0, 8);
  if (!fresh.has(null)) candidates.unshift({ target: { kind: "achievement_catalog", id: "catalog", courseId: null } });
  if (!candidates.length) return 0;
  const latest: OfflineLibraryCatalog[] = [];
  const denied: OfflineCatalogTarget[] = [];
  for (let i = 0; i < candidates.length; i += 3) {
    if (signal.aborted) break;
    await Promise.all(candidates.slice(i, i + 3).map(async ({ target, grant }) => {
      try {
        latest.push(await fetchOfflineCatalog(session, scope, target, minimumCursor, signal, grant, now));
      } catch (error) {
        if (error instanceof OfflineCatalogAccessError && error.scope === "session") throw error;
        if (error instanceof OfflineCatalogAccessError && error.scope === "course") denied.push(target);
      }
    }));
  }
  if (signal.aborted || !session.isCurrent() || (!latest.length && !denied.length)) return cursorStart + 8;
  await repository.saveCatalogs(scope, revision, latest, denied, () => {
    session.assertCurrent();
    if (signal.aborted) throw new NativeOfflineProtocolError();
  }, now());
  return cursorStart + 8;
}
