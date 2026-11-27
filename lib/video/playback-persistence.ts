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

import { boundVideoProgress, playbackCheckpoint, validateActiveCourseVideo, validateVideoProgressMap, type ActiveCourseVideoState, type VideoProgressMap } from "./playback-progress";
export { ACTIVE_VIDEO_TTL_MS, VIDEO_PROGRESS_TTL_MS, validateVideoProgressMap } from "./playback-progress";
export type { ActiveCourseVideoState, VideoProgressEntry, VideoProgressMap } from "./playback-progress";

const STORAGE_VERSION = 1;
const PROGRESS_KEY = `zyx:video-progress:v${STORAGE_VERSION}`;

export function getActiveCourseVideoKey(courseId: string): string {
  return `zyx:course-active-video:v${STORAGE_VERSION}:${courseId}`;
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
  if (Object.keys(map).length === 0) {
    removePersistentDraft(PROGRESS_KEY, "local");
    return;
  }
  const bounded = boundVideoProgress(map);
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

  const checkpoint = playbackCheckpoint(currentTime, duration, now);
  if (!checkpoint) {
    if (Object.hasOwn(map, videoId)) {
      delete map[videoId];
      writeProgressMap(map);
    }
    return;
  }
  const next = { ...map, [videoId]: checkpoint };
  writeProgressMap(next);
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
    raw => validateActiveCourseVideo(raw, now),
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
