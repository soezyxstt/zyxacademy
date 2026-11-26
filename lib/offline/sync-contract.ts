import { z } from "zod";
import type { OfflinePolicy } from "./policy-types";
export type { OfflinePolicy, OfflinePolicySettings } from "./policy-types";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";

export const OFFLINE_PROTOCOL_VERSION = 1 as const;
export const OFFLINE_REPRESENTATION_VERSION = 1 as const;
export const offlineLocaleSchema = z.enum(["id", "en"]);
export type OfflineLocale = z.infer<typeof offlineLocaleSchema>;
export const offlineResourceKindSchema = z.enum(["article", "diktat", "course_outline", "video_catalog", "achievement_catalog", "enrollments"]);
export type OfflineResourceKind = z.infer<typeof offlineResourceKindSchema>;
export const offlineCursorSchema = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const idSchema = z.string().min(1).max(256);

/** Freshness, storage retention and offline authorization have separate clocks. */
export const offlinePolicySettingsSchema = z.object({
  metadataMaxAgeMs: z.number().int().min(60_000).max(7 * 86_400_000),
  contentMaxAgeMs: z.number().int().min(60_000).max(30 * 86_400_000),
  retentionMs: z.number().int().min(86_400_000).max(90 * 86_400_000),
  accessLeaseMs: z.number().int().min(60_000).max(7 * 86_400_000),
  activeCheckIntervalMs: z.number().int().min(30_000).max(15 * 60_000),
  maxBytes: z.number().int().min(8 * 1024 * 1024).max(1024 * 1024 * 1024),
  maxEntries: z.number().int().min(25).max(1000),
  autoCache: z.boolean(),
  wifiOnly: z.boolean(),
  schedule: z.object({ frequency: z.enum(["daily", "weekly"]), weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), timeZone: z.literal("Asia/Jakarta") }).strict(),
}).strict();
export const offlinePolicySchema = offlinePolicySettingsSchema.extend({ revision: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative() });
export const DEFAULT_OFFLINE_POLICY: OfflinePolicy = {
  revision: 0, updatedAt: 0, metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 7 * 86_400_000,
  retentionMs: 30 * 86_400_000, accessLeaseMs: 24 * 60 * 60_000, activeCheckIntervalMs: 60_000,
  maxBytes: 100 * 1024 * 1024, maxEntries: 250, autoCache: true, wifiOnly: false,
  schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" },
};

export type OfflineResourceDescriptor = {
  key: string; kind: OfflineResourceKind; id: string; courseId: string | null; chapterIds: string[];
  title: string; revision: string; updatedAt: number; estimatedBytes: number;
};
export type OfflineAsset = { url: string; revision?: string; required: boolean };
export type OfflineEnrollment = { id: string; title: string; expiresAt: number | null };
export type OfflineCourseAccess = { courseId: string; allowed: boolean; fullContent: boolean; chapterIds: string[]; leaseExpiresAt: number };
export type OfflineCourseOutline = { id: string; title: string; chapters: Array<{ id: string; title: string; orderIndex: number }>; materials: OfflineResourceDescriptor[] };
export type OfflineVideoCatalog = { videos: Array<{ id: string; title: string; videoUrl: string; thumbnailUrl: string | null; playlistId: string | null; durationSeconds: number | null }>; playlists: Array<{ id: string; title: string }> };
export type OfflineAchievementCatalog = { achievements: Array<{ id: string; title: string; description: string; thresholds: number[]; icon: string }> };
export type OfflineTextMaterial = { id: string; courseId: string; title: string; body: string; docCategory: "diktat" | "materi"; kind: "article"; contentVersion: number };
export type OfflineResourceData = {
  article: PublicArticleReadModel;
  diktat: OfflineTextMaterial;
  course_outline: OfflineCourseOutline;
  video_catalog: OfflineVideoCatalog;
  achievement_catalog: OfflineAchievementCatalog;
  enrollments: OfflineEnrollment[];
};
export type OfflineIdentity = { protocolVersion: typeof OFFLINE_PROTOCOL_VERSION; accountId: string; sessionId: string; environment: string; locale: OfflineLocale };
export type OfflineResourceEnvelope<K extends OfflineResourceKind = OfflineResourceKind> = OfflineIdentity & {
  resource: OfflineResourceDescriptor & { kind: K }; cursor: string; validatedAt: number; leaseExpiresAt: number;
  data: OfflineResourceData[K]; assets: OfflineAsset[];
};
export type OfflineChange = { cursor: string; kind: OfflineResourceKind | "course" | "policy" | "access"; resourceId: string | null; courseId: string | null; action: "upsert" | "delete" | "invalidate"; revision: string | null };
export const offlineSyncRequestSchema = z.object({ cursor: offlineCursorSchema.nullable().default(null), courseIds: z.array(idSchema).max(100).default([]), locale: offlineLocaleSchema.default("id") }).strict();
export type OfflineSyncRequest = z.input<typeof offlineSyncRequestSchema>;
export type OfflineSyncResponse = OfflineIdentity & {
  cursor: string; reset: boolean; hasMore: boolean; serverTime: number; leaseExpiresAt: number; policy: OfflinePolicy;
  enrollments: OfflineEnrollment[]; access: OfflineCourseAccess[]; changes: OfflineChange[];
};
export type OfflineManifestResponse = OfflineIdentity & { cursor: string; serverTime: number; leaseExpiresAt: number; resource: OfflineCourseAccess; resources: OfflineResourceDescriptor[] };
export const offlineResourceRequestSchema = z.object({ kind: offlineResourceKindSchema, id: idSchema, courseId: idSchema.optional(), locale: offlineLocaleSchema.default("id") }).strict();
export const offlinePolicyPatchSchema = z.object({ expectedRevision: z.number().int().nonnegative(), policy: offlinePolicySettingsSchema }).strict();
export const offlineRevalidateSchema = z.object({ scope: z.enum(["all", "course", "resource"]), courseId: idSchema.optional(), kind: offlineResourceKindSchema.optional(), resourceId: idSchema.optional() }).strict().superRefine((value, ctx) => {
  if (value.scope === "course" && !value.courseId) ctx.addIssue({ code: "custom", path: ["courseId"], message: "Course is required" });
  if (value.scope === "resource" && (!value.kind || !value.resourceId)) ctx.addIssue({ code: "custom", path: ["resourceId"], message: "Resource identity is required" });
});
export type OfflinePolicyResponse = { policy: OfflinePolicy; revision: number; status: { cursor: string; lastChangedAt: number | null } };

export function offlineResourceKey(kind: OfflineResourceKind, id: string, courseId?: string | null): string { return JSON.stringify([kind, courseId ?? null, id]); }
export function offlineResourceUrl(resource: Pick<OfflineResourceDescriptor, "kind" | "id" | "courseId">, locale: OfflineLocale): string {
  const query = new URLSearchParams({ kind: resource.kind, id: resource.id, locale });
  if (resource.courseId) query.set("courseId", resource.courseId);
  return `/api/offline/resource?${query}`;
}

/** 304 still carries current auth identity and authorization lease. */
export const OFFLINE_HEADERS = { accountId: "x-offline-account-id", sessionId: "x-offline-session-id", environment: "x-offline-environment", locale: "x-offline-locale", leaseExpiresAt: "x-offline-lease-expires-at", cursor: "x-offline-cursor", revision: "x-offline-revision", validatedAt: "x-offline-validated-at" } as const;
