import { expect, test, spyOn } from "bun:test";
import { compatibleSettings, prepareCompatibleText } from "../../lib/ai/provider/compatible-text";
import { MODEL_IDS } from "../../lib/ai/provider/model-registry";
import { getWorkerModelContract, projectDailyCeiling } from "../../workers/zyra-control-plane/src/quota/model-contract";

const env = {BETTER_AUTH_URL:"https://staging.zyxacademy.com", ZYRA_CONTROL_PLANE_URL:"https://example.invalid", ZYRA_CONTROL_PLANE_TOKEN:"test", AI_COMPATIBLE_MODEL:"test-model", CF_AI_GATEWAY_URL:"https://gateway.ai.cloudflare.com/v1/account/gateway/google-ai-studio", CF_AI_GATEWAY_TOKEN:"gateway-token", AI_COMPATIBLE_GATEWAY_ROUTE:"custom-test", AI_COMPATIBLE_BYOK_ALIASES:"test-a,test-b"};
const input = { requestId:"request-1", userCohort:"masked", routeClass:"default", modelId:MODEL_IDS.compatibleText, feature:"playground", projectAlias:"compatible-text", parts:[{type:"text",text:"Test"}] } as const;
test("gates the pilot and applies one daily budget across credentials", () => {
  expect(compatibleSettings({...env,BETTER_AUTH_URL:"https://zyxacademy.com"})).toBeNull();
  expect(() => prepareCompatibleText({...input,feature:"chapter-summary"},env)).toThrow();
  expect(() => prepareCompatibleText({...input,projectAlias:"gemini-project-1"},env)).toThrow();
  expect(projectDailyCeiling(getWorkerModelContract(input.modelId)!)).toBe(20);
});
test("sends a single authenticated text call and returns usage", async () => {
  const fetchMock = spyOn(globalThis,"fetch").mockResolvedValue(Response.json({choices:[{message:{content:"result"},finish_reason:"stop"}],usage:{prompt_tokens:3}}));
  try {
    const result = await prepareCompatibleText(input,env)();
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

test("isolates an unauthorized credential on later calls without replaying the failed request", async () => {
  const invoke = () => prepareCompatibleText(input,env)();
  const fetchMock = spyOn(globalThis,"fetch")
    .mockResolvedValueOnce(new Response(null,{status:401}))
    .mockResolvedValueOnce(Response.json({choices:[{message:{content:"ok"}}]}));
  try {
    await expect(invoke()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await invoke();
    const auth = fetchMock.mock.calls.map(call => new Headers(call[1]?.headers).get("cf-aig-byok-alias"));
    expect(auth[0]).not.toBe(auth[1]);
  } finally { fetchMock.mockRestore(); }
});

test("selects two configured providers without switching environment or sharing keys", async () => {
  const settings = { ...env, AI_OPENAI_MODEL: "gpt-test", AI_OPENAI_BYOK_ALIASES: "gpt-key",
    AI_DEEPSEEK_MODEL: "deepseek-test", AI_DEEPSEEK_BYOK_ALIASES: "deepseek-key" };
  const reply = { choices: [{ message: { content: "ok" } }] };
  const mock = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(reply)).mockResolvedValueOnce(Response.json(reply));
  try {
    for (const [modelId, projectAlias] of [[MODEL_IDS.openai, "openai"], [MODEL_IDS.deepseek, "deepseek"]] as const) {
      await prepareCompatibleText({ ...input, modelId, projectAlias }, settings)();
    }
    expect(mock.mock.calls.map(([url, init]) => [
      url, new Headers(init?.headers).get("cf-aig-byok-alias"), JSON.parse(String(init?.body)).model,
    ])).toEqual([
      ["https://gateway.ai.cloudflare.com/v1/account/gateway/openai/chat/completions", "gpt-key", "gpt-test"],
      ["https://gateway.ai.cloudflare.com/v1/account/gateway/deepseek/chat/completions", "deepseek-key", "deepseek-test"],
    ]);
  } finally { mock.mockRestore(); }
});

test("routes Zyra answer text to the configured Muse gateway and excludes embeddings and images", () => {
  const meta = { ...env, AI_META_MODEL: "muse-test", AI_META_GATEWAY_ROUTE: "custom-meta", AI_META_BYOK_ALIASES: "meta-1" };
  const answer = { ...input, modelId: MODEL_IDS.meta, feature: "zyra-pedagogy", projectAlias: "meta" };
  expect(typeof prepareCompatibleText(answer, meta)).toBe("function");
  expect(() => prepareCompatibleText({...answer, feature:"embedding"},meta)).toThrow();
  expect(() => prepareCompatibleText({...answer, parts:[{type:"image",mimeType:"image/png",data:"YQ=="}]},meta)).toThrow();
});

test("dispatches the selected Muse variant using the provider's shared route", async () => {
  const settings = { ...env, AI_META_MODEL: "muse-a", AI_META_MODEL_2: "muse-b", AI_META_GATEWAY_ROUTE:"custom-meta", AI_META_BYOK_ALIASES:"shared" };
  const mock = spyOn(globalThis,"fetch").mockResolvedValue(Response.json({ choices: [{message:{content:"ok"}}] }));
  try {
    await prepareCompatibleText({...input, modelId:MODEL_IDS.meta2, projectAlias:"meta"},settings)();
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toEndWith("/custom-meta/chat/completions");
    expect(JSON.parse(String(init?.body)).model).toBe("muse-b");
  } finally { mock.mockRestore(); }
});
