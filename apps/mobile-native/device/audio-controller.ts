import { audioCheckSources, type AudioCheckSource } from "./audio-source";

export type LocalAudioStatus = {
  currentTime: number;
  duration: number;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  error: string | null;
  mediaServicesDidReset?: boolean;
};

export type LocalAudioPlayer = {
  status(): LocalAudioStatus;
  subscribe(listener: (status: LocalAudioStatus) => void): () => void;
  play(): void;
  seek(seconds: number): Promise<void>;
  release(): void;
};

type AudioPhase = "idle" | "starting" | "playing" | "paused" | "interrupted" | "ended" | "error";
type AudioSnapshot = Readonly<{
  source: AudioCheckSource;
  phase: AudioPhase;
  duration: number;
  position: number;
  active: boolean;
  seeking: boolean;
}>;

type Playback = {
  requestedPosition: number;
  player?: LocalAudioPlayer;
  unsubscribe?: () => void;
  timeout?: ReturnType<typeof setTimeout>;
  preparing: boolean;
};

function initialSnapshot(source: AudioCheckSource, active: boolean): AudioSnapshot {
  return { source, active, phase: "idle", position: 0, duration: audioCheckSources[source].duration, seeking: false };
}

function clampPosition(position: number, duration: number) {
  return Math.min(duration, Math.max(0, position));
}

export function createLocalAudioController({ configure, open, startupTimeoutMs = 8_000 }: {
  configure(): Promise<void>;
  open(source: AudioCheckSource): LocalAudioPlayer;
  startupTimeoutMs?: number;
}) {
  let snapshot = initialSnapshot("low", false);
  let playback: Playback | null = null;
  let scope: (() => void) | null = null;
  const subscribers = new Set<() => void>();

  function publish(update: Partial<AudioSnapshot>) {
    const next = { ...snapshot, ...update };
    if (next.source === snapshot.source && next.phase === snapshot.phase && next.position === snapshot.position
      && next.duration === snapshot.duration && next.active === snapshot.active && next.seeking === snapshot.seeking) return;
    snapshot = next;
    for (const subscriber of subscribers) subscriber();
  }

  function release() {
    const current = playback;
    playback = null;
    if (!current) return;
    clearTimeout(current.timeout);
    try {
      current.unsubscribe?.();
    } finally {
      current.player?.release();
    }
  }

  function stop(phase: AudioPhase, position = snapshot.position) {
    release();
    publish({ phase, position, seeking: false });
  }

  function pausePosition() {
    if (snapshot.phase !== "playing" || snapshot.seeking) return snapshot.position;
    try {
      const position = playback?.player?.status().currentTime;
      if (position !== undefined && Number.isFinite(position)) return clampPosition(position, snapshot.duration);
    } catch { /* Use the last reported position after a native interruption. */ }
    return snapshot.position;
  }

  function observe(current: Playback, status: LocalAudioStatus) {
    if (playback !== current) return;
    if (status.error) {
      stop("error");
      return;
    }

    const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : snapshot.duration;
    const position = Number.isFinite(status.currentTime) ? clampPosition(status.currentTime, duration) : snapshot.position;
    if (status.mediaServicesDidReset) {
      stop("interrupted", position);
      return;
    }
    if (status.didJustFinish || (snapshot.phase === "playing" && !status.playing && position >= duration - 0.05)) {
      stop("ended", duration);
      return;
    }

    if (status.playing && !status.isBuffering) {
      clearTimeout(current.timeout);
      publish({ phase: "playing", duration, ...(!snapshot.seeking && { position }) });
    } else if (snapshot.phase === "playing" && !status.isBuffering && !snapshot.seeking) {
      // A route change or system audio focus loss can pause the native player.
      // Release this instance so a later native focus gain cannot resume it.
      stop("interrupted", position);
      return;
    }

    if (status.isLoaded && !current.preparing && current.player) {
      current.preparing = true;
      void startNative(current, current.player, duration);
    }
  }

  async function startNative(current: Playback, player: LocalAudioPlayer, duration: number) {
    try {
      if (current.requestedPosition > 0 && current.requestedPosition < duration) {
        await player.seek(current.requestedPosition);
      }
      if (playback === current) player.play();
    } catch {
      if (playback === current) stop("error");
    }
  }

  async function play() {
    if (!snapshot.active || playback) return;
    const { source, duration, position } = snapshot;
    const requestedPosition = position >= duration ? 0 : position;
    const current: Playback = { requestedPosition, preparing: false };
    playback = current;
    current.timeout = setTimeout(() => {
      if (playback === current) stop("error");
    }, startupTimeoutMs);
    publish({ phase: "starting", position: requestedPosition });
    try {
      await configure();
      if (playback !== current) return;
      const player = open(source);
      current.player = player;
      current.unsubscribe = player.subscribe(status => observe(current, status));
      observe(current, player.status());
    } catch {
      if (playback === current) stop("error");
    }
  }

  async function seekBy(seconds: number) {
    if (!snapshot.active || snapshot.phase === "starting" || snapshot.seeking || !Number.isFinite(seconds)) return;
    const position = clampPosition(snapshot.position + seconds, snapshot.duration);
    const current = playback;
    if (!current?.player) {
      publish({ position, phase: snapshot.phase === "ended" ? "paused" : snapshot.phase });
      return;
    }
    publish({ seeking: true });
    try {
      await current.player.seek(position);
      if (playback === current) publish({ position, seeking: false });
    } catch {
      if (playback === current) stop("error");
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    attach(signal?: AbortSignal) {
      scope?.();
      if (signal?.aborted) return () => {};
      const detach = () => {
        if (scope !== detach) return;
        signal?.removeEventListener("abort", detach);
        scope = null;
        release();
        publish(initialSnapshot("low", false));
      };
      scope = detach;
      signal?.addEventListener("abort", detach, { once: true });
      return detach;
    },
    setForeground(foreground: boolean) {
      if (!scope || snapshot.active === foreground) return;
      const position = pausePosition();
      const stopping = !foreground && playback;
      if (stopping) release();
      publish({ active: foreground, phase: stopping ? "paused" : snapshot.phase, position, seeking: false });
    },
    select(source: AudioCheckSource) {
      if (!snapshot.active || source === snapshot.source || !Object.hasOwn(audioCheckSources, source)) return;
      release();
      publish(initialSnapshot(source, true));
    },
    play,
    pause() {
      if (playback) stop("paused", pausePosition());
    },
    seekBy,
  };
}
