export const MAX_VIDEO_ENTRIES = 50;
export const VIDEO_PROGRESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ACTIVE_VIDEO_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_RESUME_SECONDS = 3;

export type VideoProgressEntry = { time: number; duration?: number; updatedAt: number };
export type VideoProgressMap = Record<string, VideoProgressEntry>;
export type ActiveCourseVideoState = { videoId: string; updatedAt: number };

export function playbackCheckpoint(time: number, duration: number | undefined, now = Date.now()): VideoProgressEntry | null {
  if (!Number.isFinite(time) || time < MIN_RESUME_SECONDS) return null;
  const length = typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : undefined;
  if (length !== undefined && (length - time <= 5 || time / length >= 0.98)) return null;
  return { time: Math.floor(time), ...(length !== undefined && { duration: Math.floor(length) }), updatedAt: now };
}

export function validateVideoProgressMap(raw: unknown, now = Date.now()): VideoProgressMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries: Array<[string, VideoProgressEntry]> = [];
  for (const [videoId, value] of Object.entries(raw)) {
    if (!videoId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (typeof record.time !== "number" || !Number.isFinite(record.time) || record.time < MIN_RESUME_SECONDS) continue;
    const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : now;
    if (now - updatedAt > VIDEO_PROGRESS_TTL_MS || now - updatedAt < -60_000) continue;
    const duration = typeof record.duration === "number" && Number.isFinite(record.duration) && record.duration > 0
      ? Math.floor(record.duration) : undefined;
    entries.push([videoId, { time: Math.floor(record.time), ...(duration !== undefined && { duration }), updatedAt }]);
  }
  return entries.length ? Object.fromEntries(entries) : null;
}

export function validateActiveCourseVideo(raw: unknown, now = Date.now()): ActiveCourseVideoState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.videoId !== "string" || !record.videoId.trim()) return null;
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : now;
  if (now - updatedAt > ACTIVE_VIDEO_TTL_MS || now - updatedAt < -60_000) return null;
  return { videoId: record.videoId.trim(), updatedAt };
}

export function boundVideoProgress(map: VideoProgressMap): VideoProgressMap {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_VIDEO_ENTRIES));
}
