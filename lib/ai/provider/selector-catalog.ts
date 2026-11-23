import { selectedUpstream } from "./selected-models";
import { createHash } from "node:crypto";
import { z } from "zod";
import { kvGet, kvPut } from "@/lib/kv-cache";
import { googleGatewayClient } from "./google-gateway-client";
import { textGatewaySettings, setDiscoveredByokAliases } from "./compatible-text";
import { conventionByokAliases, enabledGatewayProviders, isGatewayCredentialsRequiredBody, isGatewayCredentialsRequiredError } from "./gateway";
import { discoveredModelId, getModelEntry, getTextProfile, MODEL_IDS, normalizeModelId, type GatewayModelProvider, type ModelId } from "./model-registry";
import { modelDate, modelDateSchema, sortModelsByDate, type ModelDate } from "./model-observations";

const FRESH_MS = 12 * 60 * 60_000;
const RETAIN_MS = 14 * 24 * 60 * 60_000;
const RETRY_MS = 5 * 60_000;
const snapshotSchema = z.object({
  checkedAt: z.number().nonnegative(), retryAt: z.number().optional(),
  ids: z.array(z.string().refine(id => { try { normalizeModelId(id); return true; } catch { return false; } })).max(1000),
  aliases: z.array(z.string().min(1).max(128)).max(32),
  dates: z.record(z.string(), modelDateSchema).default({}),
});
type Snapshot = z.infer<typeof snapshotSchema>;
const snapshots = new Map<string, Snapshot>();
const pending = new Map<string, Promise<Snapshot>>();
const aliasLookupMissUntil = new Map<string, number>();
export function resetSelectorMemoryForTests() { snapshots.clear(); pending.clear(); aliasLookupMissUntil.clear(); }
export function selectorModelDates(): Partial<Record<ModelId, ModelDate>> {
  return Object.assign({}, ...[...enabledGatewayProviders(process.env)].map(provider => snapshots.get(selectorCacheKey(provider))?.dates ?? {}));
}



async function googleModels(): Promise<Pick<Snapshot, "ids" | "aliases" | "dates">> {
  const ids = new Set<ModelId>();
  const dates: Record<string, ModelDate> = {};
  let listed = false, failure: unknown;
  for (const [index, alias] of [...conventionByokAliases("gemini"), "default"].entries()) {
    const key = process.env[index ? "GEMINI_API_KEY_" + (index + 1) : "GEMINI_API_KEY"] ?? "";
    try {
      const client = alias === "default"
        ? googleGatewayClient("", process.env, 8000, {}, { byokAlias: alias })
        : googleGatewayClient(key, process.env, 8000, {}, { preferByokAlias: alias });
      const pager = await client.models.list({ config: { pageSize: 1000 } });
      let count = 0;
      for await (const model of pager) {
        if (++count > 1000) throw new Error("Model catalog too large");
        const name = model.name?.replace(/^models\//, "") ?? "";
        if ((name === MODEL_IDS.flash38) !== (alias === "default")) continue;
        if (!model.supportedActions?.includes("generateContent") || !selectedUpstream("gemini", name)) continue;
        const id = discoveredModelId("gemini", name);
        if (getModelEntry(id).ordinaryRoutingAllowed) { ids.add(id); const date = modelDate(id); if (date) dates[id] = date; }
      }
      listed = true;
    } catch (error) { if (!isGatewayCredentialsRequiredError(error)) failure = error; }
  }
  if (!listed) throw failure ?? new Error("No Gemini model listing succeeded");
  return { ids: [...ids], aliases: [], dates };
}

export async function discoverTextModels(provider: Exclude<GatewayModelProvider, "gemini">): Promise<Pick<Snapshot, "ids" | "aliases" | "dates">> {
  const base = provider === "openai" ? MODEL_IDS.openai : provider === "muse" ? MODEL_IDS.meta : MODEL_IDS.deepseek;
  const profile = getTextProfile(base)!;
  const explicit = (process.env[profile.prefix + "_BYOK_ALIASES"] ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const candidates = explicit.length ? explicit : conventionByokAliases(provider);
  const ids = new Set<ModelId>(), aliases: string[] = [];
  const dates: Record<string, ModelDate> = {};
  let failure: unknown;
  for (const alias of candidates) {
    // Metadata discovery needs gateway credentials, not an application quota lease.
    const settings = textGatewaySettings({ ...process.env, [profile.prefix + "_BYOK_ALIASES"]: alias }, base);
    if (!settings) return { ids: [], aliases: [], dates: {} };
    try {
      const response = await fetch(settings.url.replace(/\/chat\/completions$/, "/models"), {
        redirect: "error", signal: AbortSignal.timeout(8000), headers: {
          "cf-aig-authorization": "Bearer " + settings.token, "cf-aig-byok-alias": alias,
          "cf-aig-no-wholesale": "true", "cf-aig-max-attempts": "1", "cf-aig-collect-log-payload": "false", "cf-aig-skip-cache": "true",
        },
      });
      const body = await response.json();
      if (response.status === 400 && isGatewayCredentialsRequiredBody(body)) continue;
      if (!response.ok) throw new Error("Gateway model discovery failed");
      const models = z.object({ data: z.array(z.object({ id: z.string().max(160), created: z.number().optional() })).max(1000) }).parse(body);
      aliases.push(alias);
      for (const entry of models.data) if (selectedUpstream(provider, entry.id)) {
        const id = discoveredModelId(provider, entry.id); ids.add(id);
        const date = modelDate(id, entry.created); if (date) dates[id] = date;
      }
    } catch (error) { failure = error; }
  }
  if (!aliases.length) throw failure ?? new Error("No provider model listing succeeded");
  return { ids: [...ids], aliases, dates };
}

export function selectorCacheKey(provider: GatewayModelProvider, env: Readonly<Record<string, string | undefined>> = process.env) {
  const configuration = Object.entries(env).filter(([key]) =>
    ["ZYX_ENVIRONMENT", "BETTER_AUTH_URL", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN", "AI_PROVIDERS"].includes(key) ||
    /^GEMINI_API_KEY(?:_[2-4])?$/.test(key) || /^AI_(?:OPENAI|META|DEEPSEEK)_(?:MODEL(?:_[2-5])?|BYOK_ALIASES|GATEWAY_ROUTE)$/.test(key),
  ).sort(([a], [b]) => a.localeCompare(b));
  return "ai:selector:v8:" + createHash("sha256").update(JSON.stringify([provider, configuration])).digest("hex");
}

const NEGATIVE_ALIAS_CACHE_MS = 60_000;

async function cachedModels(provider: GatewayModelProvider, refresh: boolean): Promise<Snapshot> {
  const key = selectorCacheKey(provider);
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    const shared = snapshotSchema.safeParse(await kvGet(key));
    const local = snapshots.get(key);
    const previous = shared.success && (!local || shared.data.checkedAt > local.checkedAt) ? shared.data : local;
    const now = Date.now();
    const retained = previous && now - previous.checkedAt < RETAIN_MS ? previous : undefined;
    if (!refresh && retained && (now - retained.checkedAt < FRESH_MS || now < (retained.retryAt ?? 0))) { snapshots.set(key, retained); return retained; }
    try {
      const result = provider === "gemini" ? await googleModels() : await discoverTextModels(provider);
      const snapshot = snapshotSchema.parse({ ...result, checkedAt: Date.now() });
      snapshots.set(key, snapshot);
      aliasLookupMissUntil.delete(key);
      await kvPut(key, snapshot, RETAIN_MS / 1000);
      return snapshot;
    } catch {
      if (retained) {
        const stale = { ...retained, retryAt: now + RETRY_MS };
        snapshots.set(key, stale);
        await kvPut(key, stale, Math.max(60, (RETAIN_MS - (now - stale.checkedAt)) / 1000));
        if (!refresh) return stale;
      }
      throw new Error("Daftar model belum dapat diperbarui. Coba muat ulang.");
    }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

export async function loadCachedDiscoveredByokAliases(
  provider: Exclude<GatewayModelProvider, "gemini">,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<readonly string[] | null> {
  if (!env.CF_KV_NAMESPACE_ID || !env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return null;
  try {
    const key = selectorCacheKey(provider, env);
    const now = Date.now();
    const local = snapshots.get(key);
    if (local && local.aliases.length > 0 && now - local.checkedAt < RETAIN_MS) {
      const group = provider === "muse" ? "meta" : provider;
      setDiscoveredByokAliases(group, local.aliases);
      return local.aliases;
    }
    const missUntil = aliasLookupMissUntil.get(key);
    if (missUntil && missUntil > now) return null;
    const parsed = snapshotSchema.safeParse(await kvGet(key));
    if (!parsed.success || parsed.data.aliases.length === 0 || now - parsed.data.checkedAt >= RETAIN_MS) {
      aliasLookupMissUntil.set(key, now + NEGATIVE_ALIAS_CACHE_MS);
      return null;
    }
    aliasLookupMissUntil.delete(key);
    snapshots.set(key, parsed.data);
    const group = provider === "muse" ? "meta" : provider;
    setDiscoveredByokAliases(group, parsed.data.aliases);
    return parsed.data.aliases;
  } catch {
    return null;
  }
}

export async function selectorCatalog(refresh = false, requireAllProviders = false): Promise<Set<ModelId>> {
  const providers = [...enabledGatewayProviders(process.env)].filter(provider => provider !== "deepseek");
  const results = await Promise.all(providers.map(async provider => {
    try {
      const snapshot = await cachedModels(provider, refresh);
      const group = provider === "muse" ? "meta" : provider;
      if (provider !== "gemini") setDiscoveredByokAliases(group, snapshot.aliases);
      return sortModelsByDate(snapshot.ids as ModelId[], snapshot.dates);
    } catch (error) { if (refresh || requireAllProviders) throw error; return []; }
  }));
  return new Set(results.flat());
}
