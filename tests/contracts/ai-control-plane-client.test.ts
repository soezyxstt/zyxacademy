import { describe, expect, it } from "bun:test";
import { ControlPlaneClient, ControlPlaneClientError } from "@/lib/ai/control-plane-client";

function lease() {
  return {
    leaseId: "lease-1",
    idempotencyKey: "request-1",
    role: "murid",
    feature: "plan005-test",
    routeClass: "default",
    modelId: "gemini-3.1-flash-lite",
    projectAlias: "gemini-project-1",
    state: "reserved",
    providerDay: "2026-08-07",
    appDay: "2026-08-07",
    cacheStatus: "miss",
    createdAtMs: 1,
    expiresAtMs: 2,
    terminalAtMs: null,
    providerOutcomeCode: null,
  };
}

describe("Plan 005 control-plane client", () => {
  it("sends bearer auth and validates a typed reserve response", async () => {
    let captured: Request | undefined;
    const client = new ControlPlaneClient({
      baseUrl: "https://staging.example.invalid?token=must-not-be-used",
      token: "test-secret",
      requestIdFactory: () => "request-id",
      fetchImpl: async (input, init) => {
        captured = new Request(input, init);
        return new Response(JSON.stringify({ status: "reserved", lease: lease() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await client.reserve({
      idempotencyKey: "request-1",
      userId: "user-1",
      role: "murid",
      feature: "plan005-test",
      routeClass: "default",
      modelId: "gemini-3.1-flash-lite",
      cacheStatus: "miss",
    });

    expect(result.status).toBe("reserved");
    expect(captured?.url).toBe("https://staging.example.invalid/quota/reserve");
    expect(captured?.headers.get("authorization")).toBe("Bearer test-secret");
    expect(captured?.headers.get("x-request-id")).toBe("request-id");
  });

  it("masks non-JSON and HTTP failures without exposing URL query or token", async () => {
    const client = new ControlPlaneClient({
      baseUrl: "https://staging.example.invalid?secret=query-value",
      token: "secret-token-value",
      fetchImpl: async () => new Response("not-json", { status: 502 }),
    });

    await expect(client.diagnostics()).rejects.toMatchObject({ code: "CONTROL_PLANE_NON_JSON" });
    try {
      await client.diagnostics();
    } catch (error) {
      expect(error).toBeInstanceOf(ControlPlaneClientError);
      expect(String(error)).not.toContain("secret-token-value");
      expect(String(error)).not.toContain("query-value");
    }
  });

  it("fails closed on a deadline", async () => {
    const client = new ControlPlaneClient({
      baseUrl: "https://staging.example.invalid",
      token: "test-secret",
      deadlineMs: 5,
      fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    });

    await expect(client.diagnostics()).rejects.toMatchObject({ code: "CONTROL_PLANE_TIMEOUT" });
  });
});
