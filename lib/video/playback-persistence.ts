/**
 * lib/video/playback-persistence.ts
 *
 * Persists course video playback progress (currentTime) and active open
 * video modal state in localStorage so returning after a background reload
 * resumes the exact video and timestamp.
 */

import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";

const STORAGE_VERSION = 1;
const PROGRESS_KEY = `zyx:video-progress:v${STORAGE_VERSION}`;
const MAX_VIDEO_ENTRIES = 50;
export const VIDEO_PROGRESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ACTIVE_VIDEO_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_RESUME_SECONDS = 3;
const END_THRESHOLD_SECONDS = 5;

export interface VideoProgressEntry {
  time: number;
  duration?: number;
  updatedAt: number;
}

export type VideoProgressMap = Record<string, VideoProgressEntry>;

export interface ActiveCourseVideoState {
  videoId: string;
  updatedAt: number;
}

export function getActiveCourseVideoKey(courseId: string): string {
  return `zyx:course-active-video:v${STORAGE_VERSION}:${courseId}`;
}

export function validateVideoProgressMap(
  raw: unknown,
  now = Date.now(),
): VideoProgressMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result: VideoProgressMap = {};

  for (const [videoId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!videoId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (typeof record.time !== "number" || !Number.isFinite(record.time) || record.time < MIN_RESUME_SECONDS) {
      continue;
    }
    const updatedAt =
      typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : now;
    if (now - updatedAt > VIDEO_PROGRESS_TTL_MS || now - updatedAt < -60_000) continue;

    const duration =
      typeof record.duration === "number" && Number.isFinite(record.duration) && record.duration > 0
        ? record.duration
        : undefined;

    result[videoId] = {
      time: Math.floor(record.time),
      ...(duration !== undefined ? { duration: Math.floor(duration) } : {}),
      updatedAt,
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

function readProgressMap(now = Date.now()): VideoProgressMap {
  const envelope = readPersistentDraft<VideoProgressMap>(
    PROGRESS_KEY,
    STORAGE_VERSION,
    "local",
    (raw) => validateVideoProgressMap(raw, now),
  );
  return envelope?.data ?? {};
}

function writeProgressMap(map: VideoProgressMap): void {
  const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  if (entries.length === 0) {
    removePersistentDraft(PROGRESS_KEY, "local");
    return;
  }
  const bounded = Object.fromEntries(entries.slice(0, MAX_VIDEO_ENTRIES));
  writePersistentDraft(PROGRESS_KEY, STORAGE_VERSION, bounded, "local");
}

export function readVideoPlaybackTime(videoId: string | null | undefined, now = Date.now()): number {
  if (!videoId) return 0;
  const map = readProgressMap(now);
  return map[videoId]?.time ?? 0;
}

export function saveVideoPlaybackTime(
  videoId: string | null | undefined,
  currentTime: number,
  duration?: number,
  now = Date.now(),
): void {
  if (!videoId || !Number.isFinite(currentTime)) return;
  const map = readProgressMap(now);

  const hasValidDuration = typeof duration === "number" && Number.isFinite(duration) && duration > 0;
  const nearEnd =
    hasValidDuration &&
    (duration - currentTime <= END_THRESHOLD_SECONDS || currentTime / duration >= 0.98);

  if (currentTime < MIN_RESUME_SECONDS || nearEnd) {
    if (videoId in map) {
      delete map[videoId];
      writeProgressMap(map);
    }
    return;
  }

  map[videoId] = {
    time: Math.floor(currentTime),
    ...(hasValidDuration ? { duration: Math.floor(duration) } : {}),
    updatedAt: now,
  };
  writeProgressMap(map);
}

export function clearVideoPlaybackTime(videoId: string | null | undefined, now = Date.now()): void {
  if (!videoId) return;
  const map = readProgressMap(now);
  if (videoId in map) {
    delete map[videoId];
    writeProgressMap(map);
  }
}

export function readActiveCourseVideoId(
  courseId: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!courseId) return null;
  const envelope = readPersistentDraft<ActiveCourseVideoState>(
    getActiveCourseVideoKey(courseId),
    STORAGE_VERSION,
    "local",
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const record = raw as Record<string, unknown>;
      if (typeof record.videoId !== "string" || !record.videoId.trim()) return null;
      const updatedAt =
        typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
          ? record.updatedAt
          : now;
      if (now - updatedAt > ACTIVE_VIDEO_TTL_MS || now - updatedAt < -60_000) return null;
      return { videoId: record.videoId.trim(), updatedAt };
    },
  );
  return envelope?.data.videoId ?? null;
}

export function saveActiveCourseVideoId(
  courseId: string | null | undefined,
  videoId: string | null,
  now = Date.now(),
): void {
  if (!courseId) return;
  const key = getActiveCourseVideoKey(courseId);
  if (!videoId) {
    removePersistentDraft(key, "local");
    return;
  }
  writePersistentDraft<ActiveCourseVideoState>(
    key,
    STORAGE_VERSION,
    { videoId, updatedAt: now },
    "local",
  );
}

export function clearPersistedVideoState(): void {
  removePersistentDraft(PROGRESS_KEY, "local");
  if (typeof window === "undefined") return;
  try {
    const prefix = `zyx:course-active-video:v${STORAGE_VERSION}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore restricted storage errors.
  }
}
