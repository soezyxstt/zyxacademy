import { afterAll, expect, test, spyOn } from "bun:test";
import { ControlPlaneClient } from "@/lib/ai/control-plane-client";
const health = spyOn(ControlPlaneClient.prototype, "aliasHealth").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
const record = spyOn(ControlPlaneClient.prototype, "recordAliasAttempt").mockResolvedValue({ failures: 0, cooldownUntil: 0 });
afterAll(() => { health.mockRestore(); record.mockRestore(); });
import { compatibleSettings, prepareCompatibleText } from "../../lib/ai/provider/compatible-text";
import { MODEL_IDS } from "../../lib/ai/provider/model-registry";
import { withGatewayAlias, resetAliasHealthForTests } from "../../lib/ai/provider/alias-health";
import { getWorkerModelContract, projectDailyCeiling } from "../../workers/zyra-control-plane/src/quota/model-contract";

const env = {BETTER_AUTH_URL:"https://staging.zyxacademy.com", ZYRA_CONTROL_PLANE_URL:"https://example.invalid", ZYRA_CONTROL_PLANE_TOKEN:"test", AI_COMPATIBLE_MODEL:"test-model", CF_AI_GATEWAY_URL:"https://gateway.ai.cloudflare.com/v1/account/gateway/google-ai-studio", CF_AI_GATEWAY_TOKEN:"gateway-token", AI_COMPATIBLE_GATEWAY_ROUTE:"custom-test", AI_COMPATIBLE_BYOK_ALIASES:"test-a,test-b"};
const input = { requestId:"request-1", userCohort:"masked", routeClass:"default", modelId:MODEL_IDS.compatibleText, feature:"playground", projectAlias:"compatible-text", parts:[{type:"text",text:"Test"}] } as const;
test("gates the pilot while leaving provider request limits to the provider", async () => {
  expect(compatibleSettings({...env,BETTER_AUTH_URL:"https://zyxacademy.com"})).toBeNull();
  await expect(prepareCompatibleText({...input,feature:"embedding"},env)).rejects.toThrow();
  await expect(prepareCompatibleText({...input,projectAlias:"gemini-project-1"},env)).rejects.toThrow();
  expect(projectDailyCeiling(getWorkerModelContract(input.modelId)!)).toBeNull();
});

test("discussion answers use the configured text provider with the same response contract", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content: '{"answer":"2 pangkat 3 adalah 8."}' } }] }));
  try {
    const result = await (await prepareCompatibleText({ ...input, feature: "discussion-tutor",
      config: { responseMimeType: "application/json", responseSchema: { type: "object", properties: { answer: { type: "string" } } } },
    }, env))();
    expect(JSON.parse(result.text).answer).toBe("2 pangkat 3 adalah 8.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format).toEqual({ type: "json_object" });
  } finally { fetchMock.mockRestore(); }
});
test("sends a single authenticated text call and returns usage", async () => {
  const fetchMock = spyOn(globalThis,"fetch").mockResolvedValue(Response.json({choices:[{message:{content:"result"},finish_reason:"stop"}],usage:{prompt_tokens:3}}));
  try {
    const result = await (await prepareCompatibleText(input,env))();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/custom-test/chat/completions");
    const headers = new Headers(init?.headers);
    expect(headers.get("cf-aig-no-wholesale")).toBe("true");
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("cf-aig-max-attempts")).toBe("1");
    expect(headers.get("cf-aig-collect-log-payload")).toBe("false");
    expect(headers.get("cf-aig-skip-cache")).toBe("true");
    expect(headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    expect(headers.get("cf-aig-byok-alias")).toMatch(/^test-[ab]$/);
    expect(result.usage?.promptTokens).toBe(3);
    expect(result.text).toBe("result");
    expect(result.upstreamModel).toBe(env.AI_COMPATIBLE_MODEL);
  } finally { fetchMock.mockRestore(); }
});

test("does not replay a failed request or cool an alias after only one failure", async () => {
  const invoke = async () => (await prepareCompatibleText(input,{ ...env, AI_COMPATIBLE_BYOK_ALIASES: "single-fixture-alias" }))();
  const fetchMock = spyOn(globalThis,"fetch")
    .mockResolvedValueOnce(new Response(null,{status:401}))
    .mockResolvedValueOnce(Response.json({choices:[{message:{content:"ok"}}]}));
  try {
    await expect(invoke()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await invoke();
    const auth = fetchMock.mock.calls.map(call => new Headers(call[1]?.headers).get("cf-aig-byok-alias"));
    expect(auth[0]).toBe(auth[1]);
  } finally { fetchMock.mockRestore(); }
});

test("skips a cooling alias before dispatch and uses another configured alias once", async () => {
  resetAliasHealthForTests();
  const settings = compatibleSettings(env)!;
  for (let attempt = 0; attempt < 3; attempt++) {
    await withGatewayAlias({ CF_AI_GATEWAY_URL: env.CF_AI_GATEWAY_URL }, settings.url, "test-a", async () => false, value => value);
  }
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }] }));
  try {
    health.mockResolvedValueOnce({ failures: 3, cooldownUntil: Date.now() + 86400000 });
    expect((await (await prepareCompatibleText(input, env))()).text).toBe("ok");
    expect(request).toHaveBeenCalledTimes(1);
    expect(new Headers(request.mock.calls[0][1]?.headers).get("cf-aig-byok-alias")).toBe("test-b");
  } finally { request.mockRestore(); resetAliasHealthForTests(); }
});

test("selects two configured providers without switching environment or sharing keys", async () => {
  const settings = { ...env, AI_OPENAI_MODEL: "gpt-test", AI_OPENAI_BYOK_ALIASES: "gpt-key",
    AI_DEEPSEEK_MODEL: "deepseek-test", AI_DEEPSEEK_BYOK_ALIASES: "deepseek-key" };
  const reply = { choices: [{ message: { content: "ok" } }] };
  const mock = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(reply)).mockResolvedValueOnce(Response.json(reply));
  try {
    for (const [modelId, projectAlias] of [[MODEL_IDS.openai, "openai"], [MODEL_IDS.deepseek, "deepseek"]] as const) {
      await (await prepareCompatibleText({ ...input, modelId, projectAlias }, settings))();
    }
    expect(mock.mock.calls.map(([url, init]) => [
      url, new Headers(init?.headers).get("cf-aig-byok-alias"), JSON.parse(String(init?.body)).model,
    ])).toEqual([
      ["https://gateway.ai.cloudflare.com/v1/account/gateway/openai/chat/completions", "gpt-key", "gpt-test"],
      ["https://gateway.ai.cloudflare.com/v1/account/gateway/deepseek/chat/completions", "deepseek-key", "deepseek-test"],
    ]);
  } finally { mock.mockRestore(); }
});

test("routes Zyra answer text to the configured Muse gateway and excludes embeddings and images", async () => {
  const meta = { ...env, AI_META_MODEL: "muse-test", AI_META_GATEWAY_ROUTE: "custom-meta", AI_META_BYOK_ALIASES: "meta-1" };
  const answer = { ...input, modelId: MODEL_IDS.meta, feature: "zyra-pedagogy", projectAlias: "meta" };
  expect(typeof await prepareCompatibleText(answer, meta)).toBe("function");
  await expect(prepareCompatibleText({...answer, feature:"embedding"},meta)).rejects.toThrow();
  await expect(prepareCompatibleText({...answer, parts:[{type:"image",mimeType:"image/png",data:"YQ=="}]},meta)).rejects.toThrow();
});

test("dispatches the selected Muse variant using the provider's shared route", async () => {
  const settings = { ...env, AI_META_MODEL: "muse-a", AI_META_MODEL_2: "muse-b", AI_META_GATEWAY_ROUTE:"custom-meta", AI_META_BYOK_ALIASES:"shared" };
  const mock = spyOn(globalThis,"fetch").mockResolvedValue(Response.json({ choices: [{message:{content:"ok"}}] }));
  try {
    await (await prepareCompatibleText({...input, modelId:MODEL_IDS.meta2, projectAlias:"meta"},settings))();
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toEndWith("/custom-meta/chat/completions");
    expect(JSON.parse(String(init?.body)).model).toBe("muse-b");
  } finally { mock.mockRestore(); }
});

test("accepts the dedicated Cloud Run staging edge only in staging", () => {
  const edge = { ...env, BETTER_AUTH_URL: "https://zyx-academy-staging-edge.fixture.workers.dev" };
  expect(compatibleSettings({ ...edge, ZYX_ENVIRONMENT: "staging" })).toBeTruthy();
  expect(compatibleSettings({ ...edge, ZYX_ENVIRONMENT: "production" })).toBeNull();
});

test("uses default AI_PROVIDERS convention aliases and custom-muse route without extra env vars", async () => {
  const minimalStaging = {
    BETTER_AUTH_URL: "https://staging.zyxacademy.com",
    ZYRA_CONTROL_PLANE_URL: "https://example.invalid",
    ZYRA_CONTROL_PLANE_TOKEN: "test",
    CF_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/account/gateway",
    CF_AI_GATEWAY_TOKEN: "gateway-token",
  };
  const openai = compatibleSettings(minimalStaging, MODEL_IDS.openai);
  const deepseek = compatibleSettings(minimalStaging, MODEL_IDS.deepseek);
  const muse = compatibleSettings(minimalStaging, MODEL_IDS.meta);
  expect(openai?.credentials).toEqual(["openai_1"]);
  expect(openai?.url).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/openai/chat/completions");
  expect(deepseek).toBeNull();
  expect(muse?.credentials).toEqual(["muse_1"]);
  expect(muse?.url).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/custom-muse/chat/completions");

  // AI_PROVIDERS filters out disabled providers cleanly.
  const onlyOpenAi = { ...minimalStaging, AI_PROVIDERS: "gemini, openai" };
  expect(compatibleSettings(onlyOpenAi, MODEL_IDS.openai)?.credentials).toEqual(["openai_1"]);
  expect(compatibleSettings(onlyOpenAi, MODEL_IDS.deepseek)).toBeNull();
  expect(compatibleSettings(onlyOpenAi, MODEL_IDS.meta)).toBeNull();
});

test("classifies Cloudflare AI Gateway 400 (2044) as authentication failure", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({
    success: false,
    internalCode: 2044,
    error: [{ code: 2044, message: "Customer-provided provider credentials are required for this request" }],
  }, { status: 400 }));
  try {
    await expect(
      (await prepareCompatibleText({ ...input, modelId: MODEL_IDS.openai, projectAlias: "openai" }, {
        ...env,
        AI_OPENAI_BYOK_ALIASES: "openai_missing",
      }))(),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTHENTICATION", retryClassification: "authentication", httpStatus: 400 });
  } finally { fetchMock.mockRestore(); }
});

test("the saved visual trio preserves admin priority and sends image input to the selected upstream", async () => {
  const { compatibleModelChain } = await import("@/lib/ai/model-settings");
  const models = ["gateway:openai:gpt-6.1-terra", "gateway:openai:gpt-6-luna", "gateway:muse:muse-spark-1.3-contributor"] as const;
  expect(compatibleModelChain(models, { visual: true, fallbackModels: [MODEL_IDS.stableFlash] })).toEqual([...models, MODEL_IDS.stableFlash]);
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async () => Response.json({ choices: [{ message: { content: "blue" } }] }), { preconnect: () => {} }));
  try {
    for (const modelId of models) {
      await (await prepareCompatibleText({ ...input, modelId, projectAlias: modelId.includes(":muse:") ? "meta" : "openai",
        parts: [{ type: "text", text: "Color?" }, { type: "image", mimeType: "image/png", data: "YQ==" }] }, env))();
      const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
      expect(body.model).toBe(modelId.split(":")[2]);
      expect(body.messages.at(-1).content).toEqual([{ type: "text", text: "Color?" }, { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } }]);
    }
  } finally { fetchMock.mockRestore(); }
});

test("all catalog features accept a mixed gateway trio, including analytics and Ops AI", async () => {
  const { MODEL_FEATURE_CATALOG, modelSettingSchema } = await import("@/lib/ai/model-settings");
  const models = ["gateway:openai:gpt-6.1-terra", "gateway:muse:muse-spark-1.3-contributor", "gemini-3.5-flash-lite"];
  for (const { id: feature } of MODEL_FEATURE_CATALOG) expect(modelSettingSchema.safeParse({ feature, models }).success).toBe(true);
});

test("analytics honors model-specific sampling and preserves array responses", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async () => Response.json({ choices: [{ message: { content: '{"items":[{"score":6}]}' } }] }), { preconnect: () => {} }));
  try {
    for (const [modelId, projectAlias] of [["gateway:openai:gpt-6.1-terra", "openai"], ["gateway:muse:muse-spark-1.3-contributor", "meta"]]) {
      const call = await prepareCompatibleText({ ...input, feature: "admin-quiz-insights", modelId, projectAlias, config: {
        temperature: 0.2, responseMimeType: "application/json", responseSchema: { type: "ARRAY" },
      } }, env);
      expect(JSON.parse((await call()).text)).toEqual([{ score: 6 }]);
      const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
      expect(body.model).toBe(modelId.split(":")[2]);
      expect(body.temperature).toBe(projectAlias === "meta" ? 0.2 : undefined);
    }
  } finally { fetchMock.mockRestore(); }
});

test("extended GPT 5.4 and 5.5 models disable reasoning, use max_completion_tokens, support images, and stream Ops AI safely", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = JSON.parse(String(init?.body));
    if (body.stream) {
      const sse = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "OK" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 1 } })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ choices: [{ message: { content: "OK" } }] });
  }, { preconnect: () => {} }));
  try {
    for (const upstream of ["gpt-5.5", "gpt-5.5-mini", "gpt-5.4", "gpt-5.4-mini"] as const) {
      const modelId = `gateway:openai:${upstream}` as const;
      await (await prepareCompatibleText({
        ...input,
        modelId,
        projectAlias: "openai",
        parts: [{ type: "text", text: "Inspect" }, { type: "image", mimeType: "image/png", data: "YQ==" }],
        config: { maxOutputTokens: 512, temperature: 0.4 },
      }, env))();
      const body = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
      expect(body.model).toBe(upstream);
      expect(body.reasoning_effort).toBe("none");
      expect(body.max_completion_tokens).toBe(512);
      expect(body.max_tokens).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.messages.at(-1).content).toEqual([{ type: "text", text: "Inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } }]);
    }

    const { streamCompatibleOpsModel } = await import("@/lib/admin-ops-ai/compatible-stream");
    const prev = {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      ZYRA_CONTROL_PLANE_URL: process.env.ZYRA_CONTROL_PLANE_URL,
      ZYRA_CONTROL_PLANE_TOKEN: process.env.ZYRA_CONTROL_PLANE_TOKEN,
      CF_AI_GATEWAY_URL: process.env.CF_AI_GATEWAY_URL,
      CF_AI_GATEWAY_TOKEN: process.env.CF_AI_GATEWAY_TOKEN,
      AI_OPENAI_BYOK_ALIASES: process.env.AI_OPENAI_BYOK_ALIASES,
    };
    Object.assign(process.env, {
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
      ZYRA_CONTROL_PLANE_URL: env.ZYRA_CONTROL_PLANE_URL,
      ZYRA_CONTROL_PLANE_TOKEN: env.ZYRA_CONTROL_PLANE_TOKEN,
      CF_AI_GATEWAY_URL: env.CF_AI_GATEWAY_URL,
      CF_AI_GATEWAY_TOKEN: env.CF_AI_GATEWAY_TOKEN,
      AI_OPENAI_BYOK_ALIASES: "openai_1",
    });
    try {
      const chunks = [];
      for await (const chunk of streamCompatibleOpsModel("gateway:openai:gpt-5.5", {
        prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        maxOutputTokens: 256,
        temperature: 0.7,
      }, 5000)) {
        chunks.push(chunk);
      }
      expect(chunks.some(chunk => chunk.type === "text-delta" && chunk.textDelta === "OK")).toBe(true);
      const streamBody = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
      expect(streamBody.model).toBe("gpt-5.5");
      expect(streamBody.reasoning_effort).toBe("none");
      expect(streamBody.max_completion_tokens).toBe(256);
      expect(streamBody.max_tokens).toBeUndefined();
      expect(streamBody.temperature).toBeUndefined();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  } finally { fetchMock.mockRestore(); }
});
