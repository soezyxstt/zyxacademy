import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { discoveredModelId, getModelEntry, getTextProfile, normalizeModelId } from "@/lib/ai/provider/model-registry";
import { modelSettingSchema, compatibleModelChain } from "@/lib/ai/model-settings";
import { textGatewaySettings } from "@/lib/ai/provider/compatible-text";
import { createProviderInvokerFromEnvironment } from "@/lib/ai/provider/runtime-invoker";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import type { GeminiGenerateClient } from "@/lib/ai/provider/provider-adapter";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";

afterEach(() => mock.restore());
const models = ["gateway:openai:gpt-future-fixture", "gateway:muse:muse-future-fixture", "gateway:gemini:gemini-future-fixture"] as const;

test("new gateway IDs validate for chat without relaxing image, tool or quarantine boundaries", () => {
  expect(modelSettingSchema.safeParse({ feature: "zyra", models }).success).toBe(true);
  expect(modelSettingSchema.safeParse({ feature: "admin-ops-ai", models }).success).toBe(false);
  expect(compatibleModelChain(models, true)).toEqual([]);
  expect(getModelEntry(models[0]).family).toBe("chat-completions");
  expect(getTextProfile(models[1])?.group).toBe("meta");
  expect(getModelEntry(models[2]).family).toBe("generate-content");
  expect(getModelEntry("gateway:gemini:gemini-3-flash-preview").ordinaryRoutingAllowed).toBe(false);
  for (const id of ["gateway:foreign:model", "gateway:openai:../../escape", "gateway:openai:model?key=x"]) expect(() => normalizeModelId(id)).toThrow();
});

test("a newly discovered model dispatches its actual upstream name and retains its logical identity", async () => {
  const env = { BETTER_AUTH_URL: "https://staging.zyxacademy.com", CF_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/account/gateway", CF_AI_GATEWAY_TOKEN: "fixture",
    ZYRA_CONTROL_PLANE_URL: "https://control.fixture", ZYRA_CONTROL_PLANE_TOKEN: "fixture", AI_OPENAI_MODEL: "old-configured-model" };
  expect(textGatewaySettings(env, models[0])?.model).toBe("gpt-future-fixture");
  spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
  spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content: "8" } }] }));
  const result = await createProviderInvokerFromEnvironment({ environment: env })({ requestId: "fixture", userCohort: "fixture", feature: "discussion-tutor", routeClass: "default", modelId: models[0], projectAlias: "openai", parts: [{ type: "text", text: "2 ** 3" }] });
  expect(result.modelId).toBe(models[0]); expect(result.upstreamModel).toBe("gpt-future-fixture");
  expect(JSON.parse(String(request.mock.calls[0][1]?.body)).model).toBe("gpt-future-fixture");
  expect(request).toHaveBeenCalledTimes(1);
});

test("new Gemini models use the upstream SDK name without granting unsupported image input", async () => {
  let called: unknown;
  const adapter = createGeminiGenerateAdapter({ models: { generateContent: async (request: unknown) => { called = request; return { text: "8" }; } } } as unknown as GeminiGenerateClient);
  const id = discoveredModelId("gemini", "gemini-future-fixture");
  const result = await adapter.generate({ modelId: id, parts: [{ type: "text", text: "2 ** 3" }] });
  expect(called).toMatchObject({ model: "gemini-future-fixture" });
  expect(result.modelId).toBe(id);
  expect(getModelEntry(id).input.image).toBe(false);
});
