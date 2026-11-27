import { boundVideoProgress, playbackCheckpoint, validateActiveCourseVideo, validateVideoProgressMap,
  type ActiveCourseVideoState, type VideoProgressMap } from "../../../../../lib/video/playback-progress";
import type { StudentServices } from "../contracts";

type Stored = { active: ActiveCourseVideoState | null; progress: VideoProgressMap };
const empty = (): Stored => ({ active: null, progress: {} });

function decode(raw: string | null, now: number): Stored {
  if (!raw || raw.length > 24_000) return empty();
  try {
    const payload = JSON.parse(raw);
    return {
      active: validateActiveCourseVideo(payload?.active, now),
      progress: boundVideoProgress(validateVideoProgressMap(payload?.progress, now) ?? {}),
    };
  } catch { return empty(); }
}

export function createCoursePlaybackMemory(drafts: StudentServices["drafts"], courseId: string, now = Date.now) {
  const key = "video:course:" + JSON.stringify(courseId);
  let pending = Promise.resolve();
  let local = empty();

  async function read() {
    await pending;
    return drafts ? decode(await drafts.get(key), now()) : local;
  }

  function write(change: (current: Stored, clock: number) => Stored) {
    const operation = pending.then(async () => {
      const clock = now();
      if (!drafts) { local = change(local, clock); return; }
      if (drafts.update) {
        await drafts.update(key, raw => JSON.stringify(change(decode(raw, clock), clock)));
      } else {
        await drafts.set(key, JSON.stringify(change(decode(await drafts.get(key), clock), clock)));
      }
    });
    pending = operation.catch(() => {});
    return operation;
  }

  return {
    read,
    activate: (videoId: string | null) => write((value, updatedAt) => ({ ...value, active: videoId ? { videoId, updatedAt } : null })),
    checkpoint: (videoId: string, time: number, duration?: number) => write((value, clock) => {
      if (!Number.isFinite(time)) return value;
      const progress = { ...value.progress };
      const checkpoint = playbackCheckpoint(time, duration, clock);
      if (checkpoint) return { ...value, progress: boundVideoProgress({ ...progress, [videoId]: checkpoint }) };
      delete progress[videoId];
      return { ...value, progress };
    }),
  };
}

export function playableVideoNeighbors<T extends { id: string; locked: boolean }>(items: readonly T[], id: string) {
  const playable = items.filter(item => !item.locked);
  const index = playable.findIndex(item => item.id === id);
  return { previous: index > 0 ? playable[index - 1] : undefined, next: index >= 0 ? playable[index + 1] : undefined };
}
