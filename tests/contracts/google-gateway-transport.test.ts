import { beforeEach, expect, spyOn, test } from "bun:test";
import { resetAliasHealthForTests } from "@/lib/ai/provider/alias-health";
beforeEach(resetAliasHealthForTests);
import { googleGatewayClient, resetGeminiByokCacheForTests } from "../../lib/ai/provider/google-gateway-client";
import { createGeminiInteractionsAdapter } from "../../lib/ai/provider/gemini-interactions-adapter";

test("the real SDK preserves a structured math and Python reply through Interactions", async () => {
  const answer = "2 pangkat 3 adalah 8.\n\n```python\nprint(2 ** 3)\n```";
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
    status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ answer }) }] }],
  }));
  try {
    const result = await createGeminiInteractionsAdapter(googleGatewayClient("fixture", env)).generate({
      modelId: "gemini-3.5-flash", parts: [{ type: "text", text: "Hitung 2 pangkat 3 dengan Python." }],
      config: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] } },
    });
    expect(JSON.parse(result.text).answer).toBe(answer);
    const [url, init] = fetchSpy.mock.calls[0];
    const payload = await new Request(url, init).json();
    expect(payload.response_format).toEqual({ type: "text", mime_type: "application/json", schema: {
      type: "object", properties: { answer: { type: "string" } }, required: ["answer"],
    } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  } finally { fetchSpy.mockRestore(); }
});
const env = {CF_AI_GATEWAY_URL:"https://gateway.ai.cloudflare.com/v1/account/gateway", CF_AI_GATEWAY_TOKEN:"test"};
for (const status of [400, 422, 429, 503]) test(`preserves HTTP ${status} without SDK retries`, async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
    error: { code: status, message: "fixture failure" },
  }, { status }));
  try {
    const client = googleGatewayClient("fixture", env);
    await expect(client.models.generateContent({ model: "gemini-test", contents: "test" })).rejects.toMatchObject({ status });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  } finally { fetchSpy.mockRestore(); }
});
test("rejects missing, foreign and credential-bearing endpoints before networking", () => {
  for (const url of ["", "https://generativelanguage.googleapis.com", "https://evil@gateway.ai.cloudflare.com/v1/a/b"]) {
    expect(() => googleGatewayClient("fixture", {...env, CF_AI_GATEWAY_URL:url})).toThrow();
  }
  expect(() => googleGatewayClient("fixture", {...env, CF_AI_GATEWAY_TOKEN:""})).toThrow();
});
test("the installed SDK routes generation, embeddings and interactions under the gateway provider path", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({}));
  try {
    const client = googleGatewayClient("fixture",env);
    await client.models.generateContent({model:"gemini-test", contents:"test"});
    await client.models.embedContent({model:"gemini-test", contents:"test"});
    await client.interactions.create({model:"gemini-test", input:"test"}, {maxRetries:0});
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const [index, [input, init]] of fetchSpy.mock.calls.entries()) {
      const request = new Request(input, init);
      expect(request.url).toStartWith(env.CF_AI_GATEWAY_URL + "/google-ai-studio/");
      expect(request.headers.get("cf-aig-authorization")).toBe("Bearer test");
      expect(request.headers.get("cf-aig-skip-cache")).toBe("true");
      expect(request.headers.get("cf-aig-collect-log-payload")).toBe("false");
      if (index < 2) {
        expect(new URL(request.url).searchParams.get("key")).toBe("fixture");
      }
    }
  } finally { fetchSpy.mockRestore(); }
});

test("preserves a scoped public scaffold cache key and TTL", async () => {
  const key = "zyra:exact:v1:" + "a".repeat(64);
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({}));
  try {
    const client = googleGatewayClient("fixture", env, 15000, { "cf-aig-cache-key": key, "cf-aig-cache-ttl": "300" });
    await client.models.generateContent({ model: "gemini-test", contents: "test" });
    const [input, init] = fetchSpy.mock.calls[0];
    const headers = new Request(input, init).headers;
    expect(headers.has("cf-aig-skip-cache")).toBe(false);
    expect(headers.get("cf-aig-cache-key")).toBe(key);
    expect(headers.get("cf-aig-cache-ttl")).toBe("300");
  } finally { fetchSpy.mockRestore(); }
});

test("uses cf-aig-byok-alias without x-goog-api-key or ?key= when BYOK mode is active", async () => {
  const fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({}));
  try {
    const client = googleGatewayClient("", env, 15000, {}, { byokAlias: "gemini_1" });
    await client.models.generateContent({ model: "gemini-test", contents: "test" });
    await client.interactions.create({ model: "gemini-test", input: "test" }, { maxRetries: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetchSpy.mock.calls) {
      const request = new Request(input, init);
      expect(request.headers.get("cf-aig-byok-alias")).toBe("gemini_1");
      expect(request.headers.has("x-goog-api-key")).toBe(false);
      expect(new URL(request.url).searchParams.has("key")).toBe(false);
    }
  } finally { fetchSpy.mockRestore(); }
});

for (const code of [2040, 2044]) test(`Interactions falls back from missing BYOK credentials (${code}) without retaining that alias`, async () => {
  resetGeminiByokCacheForTests();
  const fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ message: code === 2040 ? "Provider google-ai-studio has no BYOK credential named gemini_1" : "Customer-provided provider credentials are required", internalCode: code }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({}));
  try {
    const client = googleGatewayClient("fixture-fallback", env, 15000, {}, { preferByokAlias: "gemini_1" });
    await client.interactions.create({ model: "gemini-test", input: "test" });
    await client.interactions.create({ model: "gemini-test", input: "test again" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const headers = fetchSpy.mock.calls.map(([url, init]) => new Request(url, init).headers);
    expect(headers[0].get("cf-aig-byok-alias")).toBe("gemini_1");
    expect(headers[0].has("x-goog-api-key")).toBe(false);
    for (const header of headers.slice(1)) {
      expect(header.has("cf-aig-byok-alias")).toBe(false);
      expect(header.get("x-goog-api-key")).toBe("fixture-fallback");
    }
  } finally { fetchSpy.mockRestore(); resetGeminiByokCacheForTests(); }
});

for (const code of [2040, 2044]) test(`falls back from preferByokAlias to ?key= on missing credentials (${code})`, async () => {
  resetGeminiByokCacheForTests();
  const missingByok = Response.json({
    success: false,
    internalCode: code,
    error: [{ code, message: code === 2040 ? "Provider google-ai-studio has no BYOK credential named gemini_1" : "Customer-provided provider credentials are required for this request" }],
  }, { status: 400 });
  const fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(missingByok)
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({}));
  try {
    const client = googleGatewayClient("fallback-key", env, 15000, {}, { preferByokAlias: "gemini_1" });
    await client.models.generateContent({ model: "gemini-test", contents: "first" });
    // Second call skips the cached missing BYOK alias and goes straight to ?key=
    await client.models.generateContent({ model: "gemini-test", contents: "second" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const firstReq = new Request(fetchSpy.mock.calls[0][0], fetchSpy.mock.calls[0][1]);
    expect(firstReq.headers.get("cf-aig-byok-alias")).toBe("gemini_1");
    expect(new URL(firstReq.url).searchParams.has("key")).toBe(false);

    const retryReq = new Request(fetchSpy.mock.calls[1][0], fetchSpy.mock.calls[1][1]);
    expect(retryReq.headers.has("cf-aig-byok-alias")).toBe(false);
    expect(new URL(retryReq.url).searchParams.get("key")).toBe("fallback-key");

    const thirdReq = new Request(fetchSpy.mock.calls[2][0], fetchSpy.mock.calls[2][1]);
    expect(thirdReq.headers.has("cf-aig-byok-alias")).toBe(false);
    expect(new URL(thirdReq.url).searchParams.get("key")).toBe("fallback-key");
  } finally {
    fetchSpy.mockRestore();
    resetGeminiByokCacheForTests();
  }
});
