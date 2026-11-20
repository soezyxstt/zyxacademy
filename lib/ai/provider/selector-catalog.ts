import { randomUUID } from "node:crypto";
import { compatibleSettings, prepareCompatibleText, standardModels } from "./compatible-text";
import { MODEL_IDS, MODEL_REGISTRY, TEXT_PROFILES, textProfileIds, type ModelId } from "./model-registry";
import { officialRelease, eligibleSelectorModel } from "./recent-models";

type Choice = { id: ModelId; model: string };
type TextId = typeof textProfileIds[number];

async function googleChoices(): Promise<Choice[]> {
  const key = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3, process.env.GEMINI_API_KEY_4].find(Boolean);
  if (!key) return [];
  const { googleGatewayClient } = await import("./google-gateway-client");
  const client = googleGatewayClient(key, process.env, 8000);
  const result = await client.models.generateContent({
    model: MODEL_IDS.default, contents: "Reply OK.", config: { maxOutputTokens: 32 },
  });
  if (!result.text?.trim()) return [];
  const candidates = Object.values(MODEL_REGISTRY).flatMap(entry => {
    const release = officialRelease(entry.id, "google");
    return entry.ordinaryRoutingAllowed && release && eligibleSelectorModel(entry.id)
      ? [{ id: entry.id, model: entry.id }] : [];
  });
  const available = await Promise.all(candidates.map(async choice => {
    try {
      const model = await client.models.get({ model: choice.id });
      return model.name?.replace(/^models\//, "") === choice.id ? [choice] : [];
    } catch { return []; }
  }));
  return available.flat();
}

async function textChoices(ids: TextId[]): Promise<Choice[]> {
  const choices: Choice[] = [];
  for (const id of ids) {
    const settings = compatibleSettings(process.env, id);
    if (!settings || choices.some(choice => choice.model === settings.model)) continue;
    const profile = TEXT_PROFILES[id];
    const release = officialRelease(settings.model, profile.group);
    if (release && eligibleSelectorModel(settings.model)) choices.push({ id, model: settings.model });
  }
  if (!choices.length) return [];
  // Probe the provider's base slot once. Alternate and premium slots do not generate.
  const base = ids[0];
  const prefix = TEXT_PROFILES[base].prefix;
  const probeEnv = { ...process.env, [prefix + "_MODEL"]: standardModels[base] ?? process.env[prefix + "_MODEL"] };
  if (!compatibleSettings(probeEnv, base)) return [];
  await prepareCompatibleText({
    feature: "playground", projectAlias: TEXT_PROFILES[base].group,
    requestId: randomUUID(), userCohort: "admin", routeClass: "selector-smoke", modelId: base,
    parts: [{ type: "text", text: "Reply OK." }],
  }, probeEnv)();
  return choices;
}

const checks = new Map<string, { expires: number; result: Promise<Choice[]> }>();

function cachedCheck(group: string, run: () => Promise<Choice[]>) {
  const previous = checks.get(group);
  if (previous && previous.expires > Date.now()) return previous.result;
  const check = { expires: Infinity, result: run().catch((): Choice[] => []) };
  checks.set(group, check);
  void check.result.then(choices => {
    check.expires = Date.now() + (choices.length ? 24 * 60 : 5) * 60_000;
  });
  return check.result;
}

export async function selectorCatalog() {
  const groups = new Map<string, TextId[]>();
  for (const id of textProfileIds) {
    const group = TEXT_PROFILES[id].group;
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  const results = await Promise.all([
    cachedCheck("google", googleChoices),
    ...Array.from(groups, ([group, ids]) => cachedCheck(group, () => textChoices(ids))),
  ]);
  return new Set(results.flat().filter(choice => eligibleSelectorModel(choice.model)).map(choice => choice.id));
}
