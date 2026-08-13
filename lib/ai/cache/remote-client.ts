import { CacheFlightError } from "./single-flight";
import {
  validateSharedScaffold,
  type SharedScaffold,
} from "./contracts";
import {
  ControlPlaneClient,
  type ControlPlaneCacheFlightAcquireResult,
} from "@/lib/ai/control-plane-client";

export class ZyraRemoteCache {
  constructor(private readonly client = new ControlPlaneClient()) {}

  async get(cacheKey: string): Promise<SharedScaffold | null> {
    const response = await this.client.cacheGet(cacheKey);
    if (response.status === "miss") return null;
    try {
      return validateSharedScaffold(response.payload);
    } catch {
      return null;
    }
  }

  async put(cacheKey: string, scaffold: SharedScaffold, ttlSeconds: number): Promise<void> {
    const validated = validateSharedScaffold(scaffold);
    const response = await this.client.cachePut(cacheKey, validated, ttlSeconds);
    if (response.status !== "stored") throw new CacheFlightError("CACHE_FLIGHT_RETRY", "cache write was not accepted");
  }

  async acquire(cacheKey: string, leaderId: string, leaseMs = 10_000): Promise<ControlPlaneCacheFlightAcquireResult> {
    return this.client.cacheFlightAcquire(cacheKey, leaderId, leaseMs);
  }

  async waitForResult(cacheKey: string, waitMs = 10_000): Promise<SharedScaffold | null> {
    const deadline = Date.now() + Math.max(100, Math.min(30_000, waitMs));
    while (Date.now() < deadline) {
      const status = await this.client.cacheFlightStatus(cacheKey);
      if (status.status === "completed") return this.get(cacheKey);
      if (status.status === "missing") return null;
      const delay = Math.min(500, Math.max(50, status.retryAfterMs));
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, Math.max(1, deadline - Date.now()))));
    }
    throw new CacheFlightError("CACHE_FLIGHT_TIMEOUT", "remote cache flight wait exceeded its deadline");
  }

  async complete(cacheKey: string, flightId: string, resultKey: string): Promise<void> {
    const result = await this.client.cacheFlightComplete(cacheKey, flightId, resultKey);
    if (result.status !== "completed") throw new CacheFlightError("CACHE_FLIGHT_RETRY", "remote cache flight was not completed");
  }

  async fail(cacheKey: string, flightId: string): Promise<void> {
    await this.client.cacheFlightFail(cacheKey, flightId);
  }
}
