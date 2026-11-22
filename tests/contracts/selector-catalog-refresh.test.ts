import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as kv from "@/lib/kv-cache";
import * as google from "@/lib/ai/provider/google-gateway-client";
import { selectorCatalog, selectorModelDates, resetSelectorMemoryForTests } from "@/lib/ai/provider/selector-catalog";
import { getDiscoveredByokAliases, clearDiscoveredByokAliasesForTests } from "@/lib/ai/provider/compatible-text";

const names = ["AI_PROVIDERS", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN", "BETTER_AUTH_URL", "ZYRA_CONTROL_PLANE_URL", "ZYRA_CONTROL_PLANE_TOKEN"];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
let saved = new Map<string, unknown>();
let model = "gpt-5.6-luna";
let failing = false;
let clock = 1_800_000_000_000;
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
  saved = new Map(); model = "gpt-5.6-luna"; failing = false; clock = 1_800_000_000_000;
  resetSelectorMemoryForTests(); clearDiscoveredByokAliasesForTests();
  Object.assign(process.env, { AI_PROVIDERS: "openai", CF_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/account/gateway",
    CF_AI_GATEWAY_TOKEN: "private-fixture-token", BETTER_AUTH_URL: "https://staging.zyxacademy.com" });
  delete process.env.ZYRA_CONTROL_PLANE_URL; delete process.env.ZYRA_CONTROL_PLANE_TOKEN;
  spyOn(Date, "now").mockImplementation(() => clock);
  spyOn(kv, "kvGet").mockImplementation(async <T = unknown>(key: string) => (saved.get(key) as T | undefined) ?? null);
  spyOn(kv, "kvPut").mockImplementation(async (key, value) => { saved.set(key, structuredClone(value)); });
  fetchMock = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (failing) throw new Error("network unavailable");
    const alias = new Headers(init?.headers).get("cf-aig-byok-alias")!;
    return alias.endsWith("_1") ? Response.json({ data: model ? [{ id: model }, { id: "gpt-image-new" }] : [] })
      : Response.json({ internalCode: 2040, message: "Provider has no BYOK credential named this alias" }, { status: 400 });
  }, { preconnect: () => {} }));
});
afterEach(() => {
  mock.restore();
  for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
});

test("discovers a new gateway model without registry additions or generation calls", async () => {
  const catalog = await selectorCatalog();
  expect(catalog.has("gateway:openai:gpt-5.6-luna")).toBe(true);
  expect(catalog.has("gateway:openai:gpt-image-new")).toBe(false);
  expect(getDiscoveredByokAliases("openai")).toEqual(["openai_1"]);
  expect(fetchMock.mock.calls.every(([url, init]) => String(url).endsWith("/models") && !init?.body)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect([...saved.keys()].every(key => !key.includes("private-fixture-token"))).toBe(true);
});

test("uses the shared cache for twelve hours, including after process memory is cleared", async () => {
  await selectorCatalog(); resetSelectorMemoryForTests();
  clock += 12 * 60 * 60_000 - 1;
  expect((await selectorCatalog()).has("gateway:openai:gpt-5.6-luna")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  clock++; model = "gpt-6-luna";
  expect((await selectorCatalog()).has("gateway:openai:gpt-6-luna")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

test("manual refresh replaces the catalog before its TTL expires", async () => {
  await selectorCatalog(); model = "gpt-6-luna";
  expect((await selectorCatalog(true)).has("gateway:openai:gpt-6-luna")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

test("persists provider creation dates and sorts them after a process restart", async () => {
  fetchMock.mockImplementation(Object.assign(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => new Headers(init?.headers).get("cf-aig-byok-alias") === "openai_1"
    ? Response.json({ data: [{ id: "gpt-5.6-luna", created: 1700000000 }, { id: "gpt-6-luna", created: 1750000000 }] })
    : Response.json({ internalCode: 2040, message: "Provider has no BYOK credential named this alias" }, { status: 400 }), { preconnect: () => {} }));
  expect([...await selectorCatalog()]).toEqual(["gateway:openai:gpt-6-luna", "gateway:openai:gpt-5.6-luna"]);
  resetSelectorMemoryForTests(); await selectorCatalog();
  expect(selectorModelDates()["gateway:openai:gpt-5.6-luna"]?.timestamp).toBe(1700000000000);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("retains the last successful catalog on a failed refresh and retries later", async () => {
  await selectorCatalog(); failing = true;
  await expect(selectorCatalog(true)).rejects.toThrow("Daftar model");
  const calls = fetchMock.mock.calls.length;
  clock += 12 * 60 * 60_000;
  expect((await selectorCatalog()).has("gateway:openai:gpt-5.6-luna")).toBe(true);
  expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  const afterFailure = fetchMock.mock.calls.length;
  await selectorCatalog(); expect(fetchMock.mock.calls.length).toBe(afterFailure);
  failing = false; clock += 5 * 60_000; model = "gpt-6-luna";
  expect((await selectorCatalog()).has("gateway:openai:gpt-6-luna")).toBe(true);
});

test("a valid empty response removes old models and concurrent refreshes coalesce", async () => {
  await selectorCatalog(); model = "";
  const [a, b] = await Promise.all([selectorCatalog(true), selectorCatalog(true)]);
  expect(a.size).toBe(0); expect(b.size).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

test("all missing text aliases retain stale models and retry after five minutes", async () => {
  await selectorCatalog(); clock += 12 * 60 * 60_000;
  fetchMock.mockResolvedValue(Response.json({ internalCode: 2040, message: "Provider has no BYOK credential named this alias" }, { status: 400 }));
  expect((await selectorCatalog()).has("gateway:openai:gpt-5.6-luna")).toBe(true);
  const calls = fetchMock.mock.calls.length;
  await selectorCatalog(); expect(fetchMock.mock.calls.length).toBe(calls);
  clock += 5 * 60_000; await selectorCatalog();
  expect(fetchMock.mock.calls.length).toBe(calls + 4);
});

test("all missing Gemini aliases retain the last successful list", async () => {
  process.env.AI_PROVIDERS = "gemini";
  const client = spyOn(google, "googleGatewayClient").mockReturnValue({ models: { list: async () => (async function* () {
    yield { name: "models/gemma-new-fixture", supportedActions: ["generateContent"] };
  })() } } as unknown as ReturnType<typeof google.googleGatewayClient>);
  await selectorCatalog(); clock += 12 * 60 * 60_000;
  client.mockImplementation(() => { throw new Error("Provider has no BYOK credential named gemini_1"); });
  expect([...await selectorCatalog()]).toEqual(["gateway:gemini:gemma-new-fixture"]);
  const calls = client.mock.calls.length;
  await selectorCatalog(); expect(client.mock.calls.length).toBe(calls);
});

test("does not reuse a catalog across credential configurations", async () => {
  await selectorCatalog(); process.env.CF_AI_GATEWAY_TOKEN = "different-fixture-token"; model = "gpt-6-luna";
  expect((await selectorCatalog()).has("gateway:openai:gpt-6-luna")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(8);
});

test("uses Gemini list metadata for new models and preserves native capability restrictions", async () => {
  process.env.AI_PROVIDERS = "gemini";
  const list = spyOn(google, "googleGatewayClient").mockReturnValue({ models: { list: async () => (async function* () {
    yield { name: "models/gemma-new-fixture", supportedActions: ["generateContent"] };
    yield { name: "models/gemini-new-image", supportedActions: ["generateContent"] };
    yield { name: "models/gemini-embedding-fixture", supportedActions: ["embedContent"] };
    yield { name: "models/gemini-3.8-flash", supportedActions: ["generateContent"] };
    yield { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] };
    yield { name: "models/gemini-3-flash-preview", supportedActions: ["generateContent"] };
  })() } } as unknown as ReturnType<typeof google.googleGatewayClient>);
  const result = await selectorCatalog();
  expect(result).toEqual(new Set(["gateway:gemini:gemma-new-fixture", "gemini-3-flash-preview", "gemini-3.8-flash", "gemini-2.5-flash"]));
  expect(list).toHaveBeenCalledTimes(4);
  expect(fetchMock).not.toHaveBeenCalled();
});
