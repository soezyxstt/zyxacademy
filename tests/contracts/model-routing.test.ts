import { describe, expect, it } from "bun:test";
import { classifyProviderRoute, getProviderRoutePlan } from "@/lib/ai-router";

describe("Plan 005 deterministic model routing", () => {
  it("defaults ordinary tutoring to 3.5 Flash-Lite", () => {
    const route = classifyProviderRoute({ feature: "tutor", useCase: "explain-concept" });
    expect(route.routeClass).toBe("default");
    expect(route.models[0]).toBe("gemini-3.5-flash-lite");
    expect(route.premium).toBe(false);
  });

  it("selects premium pedagogy only from server-owned diagnosis state", () => {
    const route = getProviderRoutePlan({ useCase: "mistake-feedback", explicitUserAction: "diagnose" });
    expect(route.routeClass).toBe("premium-pedagogy");
    expect(route.models[0]).toBe("gemini-3.5-flash");
    expect(route.premium).toBe(true);
  });

  it("selects visual premium routing for multimodal requests", () => {
    const route = classifyProviderRoute({ multimodal: true, useCase: "explain-concept" });
    expect(route.routeClass).toBe("premium-visual");
    expect(route.models[0]).toBe("gemini-3.6-flash");
  });

  it("keeps quarantined emergency models behind the explicit emergency route", () => {
    const route = classifyProviderRoute({ useCase: "ungrounded-tutor-gemma", explicitUserAction: "emergency" });
    expect(route.routeClass).toBe("emergency");
    expect(route.models[0]).toBe("gemma-4-31b-it");
  });

  it("does not let a prompt-provided model name change the route", () => {
    const route = classifyProviderRoute({ feature: "tutor", explicitUserAction: "explain" });
    expect(route.models[0]).toBe("gemini-3.5-flash-lite");
    expect(route.models).not.toContain("gemini-3-flash-preview");
  });
});
