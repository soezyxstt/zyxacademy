export type CacheFlightRole = "leader" | "follower";

export type CacheFlightOptions = {
  readonly waitMs?: number;
  readonly flightTtlMs?: number;
};

export type CacheFlightResult<T> = {
  readonly role: CacheFlightRole;
  readonly value: T;
  readonly providerCalls: 0 | 1;
};

export type CacheFlightErrorCode = "CACHE_FLIGHT_TIMEOUT" | "CACHE_FLIGHT_RETRY";

export class CacheFlightError extends Error {
  readonly code: CacheFlightErrorCode;

  constructor(code: CacheFlightErrorCode, message: string) {
    super(message);
    this.name = "CacheFlightError";
    this.code = code;
  }
}
type Flight<T> = {
  readonly promise: Promise<T>;
  readonly expiresAt: number;
};

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

export class SingleFlightCoordinator<T> {
  private readonly flights = new Map<string, Flight<T>>();

  async run(
    key: string,
    leaderTask: () => Promise<T>,
    options: CacheFlightOptions = {},
  ): Promise<CacheFlightResult<T>> {
    const now = Date.now();
    const flightTtlMs = bounded(options.flightTtlMs, 15_000, 1_000, 60_000);
    const waitMs = bounded(options.waitMs, 10_000, 100, flightTtlMs);
    const existing = this.flights.get(key);
    if (existing && existing.expiresAt > now) {
      try {
        return { role: "follower", value: await withTimeout(existing.promise, waitMs), providerCalls: 0 };
      } catch (error) {
        if (error instanceof CacheFlightError && error.code === "CACHE_FLIGHT_TIMEOUT") throw error;
        throw new CacheFlightError("CACHE_FLIGHT_RETRY", "cache flight leader failed; retry the request");
      }
    }

    const promise = leaderTask();
    this.flights.set(key, { promise, expiresAt: now + flightTtlMs });
    try {
      return { role: "leader", value: await promise, providerCalls: 1 };
    } finally {
      const current = this.flights.get(key);
      if (current?.promise === promise) this.flights.delete(key);
    }
  }

  size(): number {
    return this.flights.size;
  }
}

async function withTimeout<T>(promise: Promise<T>, waitMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CacheFlightError("CACHE_FLIGHT_TIMEOUT", "cache flight wait exceeded its deadline")), waitMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
