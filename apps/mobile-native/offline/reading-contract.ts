import type { NativeResponse } from "../network/transport";
import {
  compareNativeOfflineCursors,
  isNativeOfflineCursor,
  NATIVE_OFFLINE_HEADERS,
  NativeOfflineProtocolError,
  type NativeOfflineResourceDescriptor,
  type NativeOfflineScope,
} from "./sync-contract";

const MiB = 1024 * 1024;
export const READING_BODY_LIMIT = 10 * MiB;
export const READING_ASSET_LIMIT = 8 * MiB;
export const READING_PACKAGE_LIMIT = 25 * MiB;
export const READING_STORAGE_LIMIT = 100 * MiB;
export const READING_ENTRY_LIMIT = 250;
export const READING_ASSET_COUNT_LIMIT = 80;

export type OfflineReadingTarget = { kind: "article" | "diktat"; id: string; courseId: string };
// Stable fields validated at the Expo boundary. Authored payloads are preserved
// for their future renderer without importing the server's parser graph.
type RawReadingIdentity = { id: string; courseId: string; title: string };
export type OfflineReadingArticle = RawReadingIdentity & {
  chapterId: string | null;
  version: number;
  sections: Array<{
    id: string;
    slug: string;
    blocks: Array<{ id: string; blockType: string; content: string } & Record<string, unknown>>;
  } & Record<string, unknown>>;
} & Record<string, unknown>;
export type OfflineReadingDiktat = RawReadingIdentity & {
  kind: "article";
  docCategory: "diktat";
  contentVersion: number;
  body: string;
};
export type OfflineReadingData = OfflineReadingArticle | OfflineReadingDiktat;
export type OfflineReadingSummary = OfflineReadingTarget & {
  key: string;
  title: string;
  revision: string;
  bytes: number;
  leaseExpiresAt: number;
  savedAt: number;
  pinned?: boolean;
};
export type OfflineReadingAsset = {
  url: string;
  mime: string;
  bytes: Uint8Array;
};
export type OfflineReadingPackage = {
  summary: OfflineReadingSummary;
  data: OfflineReadingData;
  assets: OfflineReadingAsset[];
};
export type OfflineReadingDownloadStatus = "saved" | "unavailable" | "changed" | "storage-full" | "unsupported" | "too-large" | "cancelled" | "retry";
export type OfflineReadingDownload = { status: OfflineReadingDownloadStatus };
export type OfflineReadingRevalidation = { attempted: number; restored: number };

export class OfflineReadingError extends Error {
  constructor(readonly code: OfflineReadingDownloadStatus | "revoked" | "course-denied", readonly invalidatesSaved = false) {
    super("The offline reading operation could not be completed.");
    this.name = "OfflineReadingError";
  }
}

export function readingKey({ kind, id, courseId }: OfflineReadingTarget) {
  if ((kind !== "article" && kind !== "diktat") || typeof id !== "string" || !id || id.length > 256
    || typeof courseId !== "string" || !courseId || courseId.length > 256) throw new OfflineReadingError("unavailable");
  return JSON.stringify([kind, courseId, id]);
}

export function readingResourcePath(target: OfflineReadingTarget, locale: NativeOfflineScope["locale"]) {
  readingKey(target);
  return `/api/offline/resource?${new URLSearchParams({ kind: target.kind, id: target.id, courseId: target.courseId, locale })}`;
}

function expectValue(condition: unknown): asserts condition {
  if (!condition) throw new NativeOfflineProtocolError();
}

function row(value: unknown): Record<string, unknown> {
  expectValue(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function timestamp(header: string | null) {
  expectValue(header && /^[1-9][0-9]{0,15}$/.test(header));
  const parsed = Number(header);
  expectValue(Number.isSafeInteger(parsed));
  return parsed;
}

export function readOfflineReadingHeaders(response: NativeResponse, scope: NativeOfflineScope, {
  revision, minCursor, now,
}: { revision: string; minCursor: string; now: number }) {
  expectValue(response.headers.get(NATIVE_OFFLINE_HEADERS.accountId) === scope.accountId
    && response.headers.get(NATIVE_OFFLINE_HEADERS.sessionId) === scope.sessionId
    && response.headers.get(NATIVE_OFFLINE_HEADERS.environment) === scope.origin
    && response.headers.get(NATIVE_OFFLINE_HEADERS.locale) === scope.locale);
  const cursor = response.headers.get("x-offline-cursor");
  const actualRevision = response.headers.get("x-offline-revision");
  expectValue(isNativeOfflineCursor(cursor) && typeof actualRevision === "string" && /^[a-f0-9]{64}$/.test(actualRevision));
  if (actualRevision !== revision || compareNativeOfflineCursors(cursor, minCursor) < 0) throw new OfflineReadingError("changed");
  const validatedAt = timestamp(response.headers.get("x-offline-validated-at"));
  const leaseExpiresAt = timestamp(response.headers.get("x-offline-lease-expires-at"));
  if (leaseExpiresAt <= Math.max(now, validatedAt)) throw new OfflineReadingError("changed");
  return { cursor, validatedAt, leaseExpiresAt, revision };
}

export function offlineReadingAssetSource(path: string, target: OfflineReadingTarget, locale: NativeOfflineScope["locale"], revision: string) {
  const prefix = "/api/offline/asset?";
  if (!path.startsWith(prefix) || path.length > 40_000 || path.includes("#")) return null;
  const query = new URLSearchParams(path.slice(prefix.length));
  const values = { kind: target.kind, id: target.id, courseId: target.courseId, locale, revision };
  const source = query.get("asset");
  return [...query.keys()].length === 6 && source && source.length <= 4096 && !source.includes("\u0000")
    && Object.entries(values).every(([key, value]) => query.get(key) === value) ? source : null;
}

export function parseReadingData(value: unknown, target: OfflineReadingTarget, chapters?: readonly string[]): OfflineReadingData {
  const data = row(value);
  expectValue(data.id === target.id && data.courseId === target.courseId && typeof data.title === "string");
  if (target.kind === "diktat") {
    expectValue(data.kind === "article" && data.docCategory === "diktat" && typeof data.body === "string"
      && Number.isSafeInteger(data.contentVersion));
  } else {
    expectValue(!Object.hasOwn(data, "progress") && Number.isSafeInteger(data.version) && Array.isArray(data.sections)
      && (data.chapterId === null || (typeof data.chapterId === "string" && (!chapters || chapters.includes(data.chapterId)))));
    for (const value of data.sections) {
      const section = row(value);
      expectValue(typeof section.id === "string" && typeof section.slug === "string" && Array.isArray(section.blocks));
      for (const value of section.blocks) {
        const block = row(value);
        expectValue(typeof block.id === "string" && typeof block.content === "string" && typeof block.blockType === "string");
      }
    }
  }
  return data as unknown as OfflineReadingData;
}

export function parseOfflineReadingResource(value: unknown, target: OfflineReadingTarget, scope: NativeOfflineScope,
  descriptor: NativeOfflineResourceDescriptor, metadata: ReturnType<typeof readOfflineReadingHeaders>) {
  const envelope = row(value);
  expectValue(envelope.protocolVersion === 1 && envelope.accountId === scope.accountId && envelope.sessionId === scope.sessionId
    && envelope.locale === scope.locale && envelope.environment === scope.origin && envelope.cursor === metadata.cursor
    && envelope.validatedAt === metadata.validatedAt && envelope.leaseExpiresAt === metadata.leaseExpiresAt);
  const resource = row(envelope.resource);
  const chapters = resource.chapterIds;
  expectValue(resource.key === readingKey(target) && resource.kind === target.kind && resource.id === target.id
    && resource.courseId === target.courseId && resource.revision === descriptor.revision && resource.title === descriptor.title
    && resource.updatedAt === descriptor.updatedAt && Array.isArray(chapters) && chapters.length === descriptor.chapterIds.length
    && descriptor.chapterIds.every(chapter => chapters.includes(chapter)));
  const data = parseReadingData(envelope.data, target, descriptor.chapterIds);
  expectValue(Array.isArray(envelope.assets) && envelope.assets.length <= READING_ASSET_COUNT_LIMIT);
  const assets = envelope.assets.map(value => {
    const asset = row(value);
    expectValue(typeof asset.url === "string" && asset.required === true && offlineReadingAssetSource(asset.url, target, scope.locale, metadata.revision));
    return asset.url;
  });
  expectValue(new Set(assets).size === assets.length);
  return { data, assets };
}
