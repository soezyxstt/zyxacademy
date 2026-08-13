import { describe, expect, it } from "bun:test";
import { classifyProviderRoute } from "@/lib/ai-router";
import { getModelEntry } from "@/lib/ai/provider/model-registry";

describe("Plan 005 provider fallback policy", () => {
  it("keeps the 3.5 Flash-Lite release gate quarantined", () => {
    const entry = getModelEntry("gemini-3.5-flash-lite");
    expect(entry.ordinaryRoutingAllowed).toBe(false);
    expect(entry.healthGate.required).toBe(true);
  });

  it("uses the other projects through the control-plane model contract", () => {
    const route = classifyProviderRoute({ useCase: "mistake-feedback" });
    expect(route.models).toEqual([
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
    ]);
    expect(new Set(route.models).size).toBe(route.models.length);
  });

  it("does not create a recursive fallback chain", () => {
    const route = classifyProviderRoute({ useCase: "explain-concept" });
    expect(route.models).toEqual([
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
  });
});
