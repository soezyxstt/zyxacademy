import { enabledGatewayProviders } from "../../lib/ai/provider/gateway";
import { discoverTextModels } from "../../lib/ai/provider/selector-catalog";

const enabled = enabledGatewayProviders();
const providers = ["openai", "muse"] as const;
const counts = await Promise.all(providers.map(async provider => {
  if (!enabled.has(provider)) return [provider, null] as const;
  try {
    const catalog = await discoverTextModels(provider);
    return [provider, catalog.ids.length] as const;
  } catch {
    return [provider, 0] as const;
  }
}));
console.log(JSON.stringify(Object.fromEntries(counts)));
process.exitCode = counts.some(([, count]) => count === 0) ? 1 : 0;
