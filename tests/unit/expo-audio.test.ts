import { expect, test } from "bun:test";

import {
  createLocalAudioController,
  type LocalAudioStatus,
} from "../../apps/mobile-native/device/audio-controller";
import { audioCheckSources, createAudioCheckWave, type AudioCheckSource } from "../../apps/mobile-native/device/audio-source";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}

function fixture(configure: () => Promise<void> = async () => {}, startupTimeoutMs?: number) {
  const instances: Array<ReturnType<typeof createPlayer>> = [];
  let seekWork: Promise<void> | undefined;

  function createPlayer(source: AudioCheckSource) {
    let status: LocalAudioStatus = {
      currentTime: 0,
      duration: audioCheckSources[source].duration,
      playing: false,
      isLoaded: false,
      isBuffering: false,
      didJustFinish: false,
      error: null,
    };
    let listener: (value: LocalAudioStatus) => void = () => {};
    const calls: Array<string | number> = [];
    const started = deferred();
    return {
      source,
      calls,
      started: started.promise,
      emit(update: Partial<LocalAudioStatus>) {
        status = { ...status, ...update };
        // Simulate an already queued native event, which can arrive after unsubscribe.
        listener(status);
      },
      status: () => status,
      subscribe(callback: typeof listener) {
        listener = callback;
        return () => calls.push("unsubscribe");
      },
      play() {
        calls.push("play");
        started.resolve();
      },
      async seek(seconds: number) {
        calls.push(seconds);
        await seekWork;
        status = { ...status, currentTime: seconds };
      },
      release: () => { calls.push("release"); },
    };
  }

  const controller = createLocalAudioController({
    configure,
    startupTimeoutMs,
    open(source) {
      const player = createPlayer(source);
      instances.push(player);
      return player;
    },
  });
  const session = new AbortController();
  const detach = controller.attach(session.signal);
  controller.setForeground(true);
  return {
    controller,
    instances,
    session,
    detach,
    holdSeek(promise: Promise<void>) { seekWork = promise; },
  };
}

test("only an explicit play command opens a player and waits for the local source", async () => {
  const { controller, instances, detach } = fixture();
  controller.select("high");
  await controller.seekBy(3);
  expect(instances).toHaveLength(0);
  expect(controller.getSnapshot()).toMatchObject({ position: 3, duration: 12, phase: "idle" });
  await controller.play();
  const player = instances[0];
  expect(player.source).toBe("high");
  expect(player.calls).toEqual([]);

  player.emit({ isLoaded: true });
  await player.started;
  expect(player.calls).toEqual([3, "play"]);
  player.emit({ playing: true });
  expect(controller.getSnapshot()).toMatchObject({ phase: "playing", position: 3 });
  detach();
  expect(player.calls).toEqual([3, "play", "unsubscribe", "release"]);
});

test("pause releases the player and explicit play resumes from the held position", async () => {
  const { controller, instances, detach } = fixture();
  await controller.play();
  instances[0].emit({ isLoaded: true, playing: true, currentTime: 2.25 });
  controller.pause();
  expect(controller.getSnapshot()).toMatchObject({ phase: "paused", position: 2.25 });
  expect(instances[0].calls).toEqual(["play", "unsubscribe", "release"]);
  await controller.play();
  instances[1].emit({ isLoaded: true });
  await instances[1].started;
  expect(instances[1].calls).toEqual([2.25, "play"]);
  detach();
});

test("seek is bounded, finish releases the player, and explicit replay starts at zero", async () => {
  const { controller, instances, detach } = fixture();
  await controller.seekBy(-20);
  expect(controller.getSnapshot().position).toBe(0);
  await controller.play();
  instances[0].emit({ isLoaded: true, playing: true });
  await controller.seekBy(3);
  expect(controller.getSnapshot()).toMatchObject({ position: 3, seeking: false });
  await controller.seekBy(20);
  expect(instances[0].calls).toEqual(["play", 3, 8]);
  instances[0].emit({ currentTime: 8, didJustFinish: true, playing: false });
  expect(controller.getSnapshot()).toMatchObject({ phase: "ended", position: 8 });
  await controller.play();
  instances[1].emit({ isLoaded: true, playing: true });
  expect(instances[1].calls).toEqual(["play"]);
  expect(controller.getSnapshot()).toMatchObject({ phase: "playing", position: 0 });
  detach();
});

test("backgrounding and audio focus loss both require another explicit play", async () => {
  const { controller, instances, detach } = fixture();
  await controller.play();
  instances[0].emit({ isLoaded: true, playing: true, currentTime: 1.5 });
  controller.setForeground(false);
  expect(controller.getSnapshot()).toMatchObject({ active: false, phase: "paused", position: 1.5 });
  await controller.play();
  controller.setForeground(true);
  expect(instances).toHaveLength(1);
  await controller.play();

  instances[1].emit({ isLoaded: true, playing: true, currentTime: 2 });
  instances[1].emit({ playing: false, currentTime: 3 });
  expect(controller.getSnapshot()).toMatchObject({ active: true, phase: "interrupted", position: 3 });
  expect(instances[1].calls).toContain("release");
  instances[1].emit({ playing: true, currentTime: 4 });
  expect(controller.getSnapshot()).toMatchObject({ phase: "interrupted", position: 3 });
  detach();
});

test("changing source discards old seek completions and resets playback without autoplay", async () => {
  const { controller, instances, holdSeek, detach } = fixture();
  await controller.play();
  instances[0].emit({ isLoaded: true, playing: true, currentTime: 1 });
  const waiting = deferred();
  holdSeek(waiting.promise);
  const seeking = controller.seekBy(3);
  controller.select("high");
  waiting.resolve();
  await seeking;
  instances[0].emit({ currentTime: 8, didJustFinish: true, playing: false });
  expect(instances).toHaveLength(1);
  expect(instances[0].calls).toEqual(["play", 4, "unsubscribe", "release"]);
  expect(controller.getSnapshot()).toMatchObject({ source: "high", duration: 12, position: 0, phase: "idle" });
  detach();
});

test("logout and focus cleanup drop pending starts and playback state across scopes", async () => {
  const waiting = deferred();
  const { controller, instances, session, detach } = fixture(() => waiting.promise);
  controller.select("high");
  const starting = controller.play();
  session.abort();
  waiting.resolve();
  await starting;
  expect(instances).toHaveLength(0);
  expect(controller.getSnapshot()).toMatchObject({ active: false, source: "low", phase: "idle", position: 0 });

  const replacement = new AbortController();
  const detachReplacement = controller.attach(replacement.signal);
  controller.setForeground(true);
  detach();
  await controller.play();
  detachReplacement();
  expect(instances[0].calls).toEqual(["unsubscribe", "release"]);
  expect(controller.getSnapshot()).toMatchObject({ active: false, phase: "idle", position: 0 });
});

test("a native playback error releases the old player and can be retried", async () => {
  const { controller, instances, detach } = fixture();
  await controller.play();
  instances[0].emit({ error: "native path detail" });
  expect(controller.getSnapshot()).toMatchObject({ phase: "error" });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("native path detail");
  expect(instances[0].calls).toEqual(["unsubscribe", "release"]);
  await controller.play();
  instances[1].emit({ isLoaded: true, playing: true });
  expect(controller.getSnapshot().phase).toBe("playing");
  detach();
});

test("playback also recovers when the native player never starts", async () => {
  const { controller, instances, detach } = fixture(undefined, 10);
  const failed = deferred();
  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().phase === "error") failed.resolve();
  });
  await controller.play();
  instances[0].emit({ isLoaded: true });
  await failed.promise;
  expect(instances[0].calls).toEqual(["play", "unsubscribe", "release"]);
  unsubscribe();
  detach();
});

test("the original audio fixtures are valid, distinct PCM waves with low amplitude", () => {
  for (const source of ["low", "high"] as const) {
    const bytes = createAudioCheckWave(source);
    const wave = new DataView(bytes.buffer);
    expect(wave.getUint32(0)).toBe(0x52494646);
    expect(wave.getUint32(4, true)).toBe(bytes.length - 8);
    expect(wave.getUint32(8)).toBe(0x57415645);
    expect(wave.getUint16(20, true)).toBe(1);
    expect(wave.getUint16(22, true)).toBe(1);
    expect(wave.getUint32(24, true)).toBe(8_000);
    expect(wave.getUint16(34, true)).toBe(16);
    expect(wave.getUint32(40, true)).toBe(audioCheckSources[source].duration * 16_000);
    expect(Math.abs(wave.getInt16(2_044, true))).toBeLessThanOrEqual(3_200);
  }
  expect(createAudioCheckWave("low")[1_001]).not.toBe(createAudioCheckWave("high")[1_001]);
  expect(() => createAudioCheckWave("https://example.test/audio.wav" as AudioCheckSource)).toThrow();
});
