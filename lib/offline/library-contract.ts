import type { OfflineCacheScope } from "./cache-scope";
import type { OfflinePolicy, OfflineResourceDescriptor, OfflineResourceEnvelope, OfflineResourceKind } from "./sync-contract";

export interface NativeOfflineLibrarySnapshot extends OfflineCacheScope {
  schemaVersion: 2;
  sessionId?: string;
  accessValidUntil: number;
  lastVerifiedAt: number;
  syncCursor: string;
  enrollmentIds?: string[];
  courses: Array<{ id: string; title: string; code?: string; thumbnailUrl?: string; accessValidUntil?: number; chapterIds?: string[] }>;
  achievements: Array<{ id: string; title: string; description?: string; icon?: string }>;
  materials: Array<{ id: string; courseId: string; title: string; kind: string; accessValidUntil?: number; thumbnailUrl?: string; videoUrl?: string; contentVersion: string }>;
  policy: OfflinePolicy;
  syncState: "ready" | "syncing" | "error";
  syncError?: "network" | "storage" | "access";
}
export interface OfflineMetadataSnapshot extends NativeOfflineLibrarySnapshot {
  resources: Partial<Record<string, OfflineResourceEnvelope<OfflineResourceKind>>>;
  manifests: Record<string, { cursor: string; checkedAt: number; resources: OfflineResourceDescriptor[] }>;
}
export const OFFLINE_CACHE_CHANGED_EVENT = "zyx:offline-cache-changed";
export const OFFLINE_RESOURCE_CHANGED_EVENT = "zyx:offline-resource-changed";
export const OFFLINE_SYNC_REQUEST_EVENT = "zyx:offline-sync-request";
export function notifyOfflineCacheChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_CACHE_CHANGED_EVENT));
}
export function requestOfflineSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_SYNC_REQUEST_EVENT));
}
