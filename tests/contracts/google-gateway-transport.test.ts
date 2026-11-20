import { expect, spyOn, test } from "bun:test";
import { googleGatewayClient } from "../../lib/ai/provider/google-gateway-client";
const env = {CF_AI_GATEWAY_URL:"https://gateway.ai.cloudflare.com/v1/account/gateway", CF_AI_GATEWAY_TOKEN:"test"};
test("rejects missing, foreign and credential-bearing endpoints before networking", () => {
  for (const url of ["", "https://generativelanguage.googleapis.com", "https://evil@gateway.ai.cloudflare.com/v1/a/b"]) {
    expect(() => googleGatewayClient("fixture", {...env, CF_AI_GATEWAY_URL:url})).toThrow();
  }
  expect(() => googleGatewayClient("fixture", {...env, CF_AI_GATEWAY_TOKEN:""})).toThrow();
});
test("the installed SDK routes generation, embeddings and interactions under the gateway provider path", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({}));
  try {
    const client = googleGatewayClient("fixture",env);
    await client.models.generateContent({model:"gemini-test", contents:"test"});
    await client.models.embedContent({model:"gemini-test", contents:"test"});
    await client.interactions.create({model:"gemini-test", input:"test"}, {maxRetries:0});
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const [input, init] of fetchSpy.mock.calls) {
      const request = new Request(input, init);
      expect(request.url).toStartWith(env.CF_AI_GATEWAY_URL + "/google-ai-studio/");
      expect(request.headers.get("cf-aig-authorization")).toBe("Bearer test");
      expect(request.headers.get("cf-aig-collect-log-payload")).toBe("false");
    }
  } finally { fetchSpy.mockRestore(); }
});
