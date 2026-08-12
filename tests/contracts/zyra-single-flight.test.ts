import { describe, expect, it } from "bun:test";
import { SingleFlightCoordinator } from "@/lib/ai/cache/single-flight";

describe("Plan 006 single-flight", () => {
  it("creates one leader provider call and 49 followers", async () => {
    const coordinator = new SingleFlightCoordinator<string>();
    let providerCalls = 0;
    const results = await Promise.all(Array.from({ length: 50 }, () => coordinator.run(
      "zyra:exact:v1:" + "a".repeat(64),
      async () => {
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return "shared-scaffold";
      },
    )));
    expect(providerCalls).toBe(1);
    expect(results.filter((result) => result.role === "leader")).toHaveLength(1);
    expect(results.filter((result) => result.role === "follower")).toHaveLength(49);
    expect(results.reduce((sum, result) => sum + result.providerCalls, 0)).toBe(1);
  });

  it("releases failed flights and allows a later leader retry", async () => {
    const coordinator = new SingleFlightCoordinator<string>();
    const first = coordinator.run("key", async () => {
      throw new Error("provider failure");
    });
    await expect(first).rejects.toThrow("provider failure");
    expect(coordinator.size()).toBe(0);
    await expect(coordinator.run("key", async () => "recovered")).resolves.toMatchObject({
      role: "leader",
      providerCalls: 1,
      value: "recovered",
    });
  });

  it("returns a typed retry to followers when the leader fails", async () => {
    const coordinator = new SingleFlightCoordinator<string>();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const leader = coordinator.run("failure-key", async () => {
      await gate;
      throw new Error("failed");
    });
    const follower = coordinator.run("failure-key", async () => "not-leader");
    release?.();
    const [leaderResult, followerResult] = await Promise.allSettled([leader, follower]);
    expect(leaderResult.status).toBe("rejected");
    expect(followerResult.status).toBe("rejected");
    if (leaderResult.status === "rejected") expect(leaderResult.reason).toHaveProperty("message", "failed");
    if (followerResult.status === "rejected") expect(followerResult.reason).toMatchObject({ code: "CACHE_FLIGHT_RETRY" });
  });
});
