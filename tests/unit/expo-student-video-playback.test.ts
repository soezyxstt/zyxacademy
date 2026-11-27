import { expect, test } from "bun:test";
import { createCoursePlaybackMemory, playableVideoNeighbors } from "../../apps/mobile-native/features/student/learning/video-playback";
import { buildYouTubePlaybackFrame, youtubePlaybackEvent } from "../../apps/mobile-native/features/course-video/youtube-playback";
import { ACTIVE_VIDEO_TTL_MS, VIDEO_PROGRESS_TTL_MS } from "../../lib/video/playback-progress";

function localStore() {
  const items = new Map<string, string>();
  return {
    get: async (key: string) => items.get(key) ?? null,
    set: async (key: string, value: string) => { items.set(key, value); },
    remove: async (key: string) => { items.delete(key); },
  };
}

test("video continuity retains progress across player reopen and isolates course and account", async () => {
  const scope = localStore();
  const secondAccount = localStore();
  let now = 1_750_000_000_000;
  const clock = () => now;
  const playback = createCoursePlaybackMemory(scope, "course-a", clock);
  const reopen = createCoursePlaybackMemory(scope, "course-a", clock);
  await Promise.all([playback.activate("episode"), playback.checkpoint("episode", 8.9, 30)]);
  expect(await reopen.read()).toEqual({
    active: { videoId: "episode", updatedAt: now }, progress: { episode: { time: 8, duration: 30, updatedAt: now } },
  });
  for (const isolated of [createCoursePlaybackMemory(scope, "course-b", clock), createCoursePlaybackMemory(secondAccount, "course-a", clock)]) {
    expect(await isolated.read()).toEqual({ active: null, progress: {} });
  }
  await playback.activate(null);
  expect((await reopen.read()).active).toBeNull();
  expect((await reopen.read()).progress.episode.time).toBe(8);
  await playback.activate("episode");
  now += ACTIVE_VIDEO_TTL_MS + 1;
  expect((await reopen.read()).active).toBeNull();
  expect((await reopen.read()).progress.episode.time).toBe(8);
  await playback.checkpoint("episode", 26, 30);
  expect((await reopen.read()).progress).toEqual({});
  await playback.checkpoint("episode", 9, 30);
  now += VIDEO_PROGRESS_TTL_MS + 1;
  expect((await reopen.read()).progress).toEqual({});
});

test("playlist previous and next can only select currently playable episodes", () => {
  const items = [
    { id: "video-a", locked: false }, { id: "locked", locked: true }, { id: "video-c", locked: false },
  ];
  expect(playableVideoNeighbors(items, "video-a")).toEqual({ previous: undefined, next: items[2] });
  expect(playableVideoNeighbors(items, "video-c")).toEqual({ previous: items[0], next: undefined });
  expect(playableVideoNeighbors(items, "locked")).toEqual({ previous: undefined, next: undefined });
});

test("YouTube progress bridge accepts a bounded event for the current local embed only", () => {
  const nonce = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const origin = "https://com.zyx.academy.nativeparity";
  const frame = buildYouTubePlaybackFrame("x1pJgx8bEZU", origin, 15.8, nonce);
  expect(frame).toMatchObject({ baseUrl: origin + "/course-playback", embedUrl: "https://www.youtube.com/embed/x1pJgx8bEZU", start: 15 });
  expect(frame?.html).toContain('origin: "https://com.zyx.academy.nativeparity"');
  expect(frame?.html).toContain("window.onYouTubeIframeAPIReady");
  expect(frame?.html).toContain("https://www.youtube.com/iframe_api");
  expect(buildYouTubePlaybackFrame('<iframe src="bad">', origin, 15, nonce)).toBeNull();
  expect(buildYouTubePlaybackFrame("x1pJgx8bEZU", origin + "/redirect", 15, nonce)).toBeNull();
  const payload = { nonce, type: "checkpoint", time: 15, duration: 40 };
  expect(youtubePlaybackEvent(JSON.stringify(payload), nonce)).toEqual({ type: "checkpoint", time: 15, duration: 40 });
  expect(youtubePlaybackEvent(JSON.stringify({ ...payload, nonce: "outside" }), nonce)).toBeNull();
  expect(youtubePlaybackEvent(JSON.stringify({ ...payload, time: "15" }), nonce)).toBeNull();
  expect(youtubePlaybackEvent(JSON.stringify({ nonce, type: "ended" }), nonce)).toEqual({ type: "ended" });
});
