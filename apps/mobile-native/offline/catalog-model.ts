import type { NativeResponse } from "../network/transport";
import { readOfflineReadingHeaders } from "./reading-contract";
import type { NativeOfflineCourseAccess, NativeOfflineScope } from "./sync-contract";
import { NativeOfflineProtocolError } from "./sync-contract";

export type OfflineCatalogTarget =
  | { kind: "video_catalog"; id: string; courseId: string }
  | { kind: "achievement_catalog"; id: "catalog"; courseId: null };

export type OfflineCatalogVideo = {
  id: string;
  title: string;
  playlistTitle?: string;
  durationSeconds?: number;
  playable: boolean;
  thumbnail?: { uri: string; leaseExpiresAt: number };
};
export type OfflineAchievementDefinition = { id: string; title: string; description: string; thresholds: number[] };
type CatalogBase = { cursor: string; revision: string; validatedAt: number; leaseExpiresAt: number };
export type OfflineLibraryCatalog =
  | (CatalogBase & { kind: "video_catalog"; courseId: string; grant: string; videos: OfflineCatalogVideo[] })
  | (CatalogBase & { kind: "achievement_catalog"; courseId: null; achievements: OfflineAchievementDefinition[] });

type ThumbnailTarget = { id: string; path: string };

export function catalogGrant({ chapterIds, fullContent }: Pick<NativeOfflineCourseAccess, "chapterIds" | "fullContent">) {
  return JSON.stringify([fullContent, [...chapterIds].sort()]);
}

function expectCatalog(condition: unknown): asserts condition {
  if (!condition) throw new NativeOfflineProtocolError();
}

function record(input: unknown): Record<string, unknown> {
  expectCatalog(input && typeof input === "object" && !Array.isArray(input));
  return input as Record<string, unknown>;
}

function boundedText(value: unknown, max: number) {
  expectCatalog(typeof value === "string" && value.length <= max);
  return value;
}

function id(value: unknown) {
  const text = boundedText(value, 256);
  expectCatalog(text && !/[/?#\\\u0000-\u001f]/u.test(text));
  return text;
}

function items(value: unknown, max: number): unknown[] {
  expectCatalog(Array.isArray(value) && value.length <= max);
  return value;
}

function whole(value: unknown) {
  expectCatalog(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  return value;
}

export function offlineCatalogPath(target: OfflineCatalogTarget, locale: NativeOfflineScope["locale"]) {
  const query = new URLSearchParams({ kind: target.kind, id: target.id, locale });
  if (target.courseId) query.set("courseId", target.courseId);
  return `/api/offline/resource?${query}`;
}

function admittedThumbnail(value: unknown, target: OfflineCatalogTarget, scope: NativeOfflineScope, revision: string) {
  if (typeof value !== "string" || !value.startsWith("/api/offline/asset?") || value.length > 28_000 || value.includes("#")) return null;
  const url = new URL(value, scope.origin);
  if (url.origin !== scope.origin || url.pathname !== "/api/offline/asset") return null;
  const { searchParams: query } = url;
  const source = query.get("asset");
  return [...query.keys()].length === 6 && source && source.length <= 4096 && !source.includes("\u0000")
    && query.get("kind") === target.kind && query.get("id") === target.id && query.get("courseId") === target.courseId
    && query.get("locale") === scope.locale && query.get("revision") === revision ? value : null;
}

export function parseOfflineCatalog(response: NativeResponse, value: unknown, scope: NativeOfflineScope,
  target: OfflineCatalogTarget, minCursor: string, now: number, courseGrant?: string) {
  const body = record(value);
  const descriptor = record(body.resource);
  const { revision } = descriptor;
  expectCatalog(typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision));
  const proof = readOfflineReadingHeaders(response, scope, { revision, minCursor, now });
  expectCatalog(body.protocolVersion === 1 && body.accountId === scope.accountId && body.sessionId === scope.sessionId
    && body.environment === scope.origin && body.locale === scope.locale && body.cursor === proof.cursor
    && body.leaseExpiresAt === proof.leaseExpiresAt && body.validatedAt === proof.validatedAt
    && descriptor.id === target.id && descriptor.kind === target.kind && descriptor.courseId === target.courseId
    && descriptor.key === JSON.stringify([target.kind, target.courseId, target.id]));
  const data = record(body.data);
  const thumbnails: ThumbnailTarget[] = [];

  if (target.kind === "achievement_catalog") {
    const achievements = items(data.achievements, 250).map(input => {
      const item = record(input);
      return { id: id(item.id), title: boundedText(item.title, 512), description: boundedText(item.description, 2048),
        thresholds: items(item.thresholds, 20).map(whole) };
    });
    const catalog: OfflineLibraryCatalog = { ...proof, kind: target.kind, courseId: null, achievements };
    return { catalog, thumbnails };
  }

  expectCatalog(typeof courseGrant === "string");
  const grant = JSON.parse(courseGrant) as [boolean, string[]];
  const admitted = new Set(items(body.assets, 750).map(asset => record(asset).url));
  const playlists = new Map(items(data.playlists, 500).map(input => {
    const row = record(input);
    return [id(row.id), boundedText(row.title, 512)] as const;
  }));
  const videos = items(data.videos, 1000).map(input => {
    const row = record(input);
    const videoId = id(row.id);
    const path = admittedThumbnail(row.thumbnailUrl, target, scope, revision);
    if (path && admitted.has(path)) thumbnails.push({ id: videoId, path });
    return { id: videoId, title: boundedText(row.title, 1024), playlistTitle: typeof row.playlistId === "string" ? playlists.get(row.playlistId) : undefined,
      durationSeconds: row.durationSeconds === null ? undefined : whole(row.durationSeconds),
      playable: grant[0] === true && typeof row.videoUrl === "string" && row.videoUrl.length > 0 };
  });
  const catalog: OfflineLibraryCatalog = { ...proof, kind: target.kind, courseId: target.courseId, grant: courseGrant, videos };
  return { catalog, thumbnails };
}
