type Publisher = "google" | "openai" | "meta" | "deepseek";

interface Release {
  publisher: Publisher;
  label: string;
  released: string;
  source: string;
}

const google = "https://aistudio.google.com/docs/changelog";
const openai = "https://developers.openai.com/api/docs/changelog";
const deepseek = "https://api-docs.deepseek.com/updates/";
const releases: Readonly<Record<string, Release>> = {
  "gemini-2.5-flash": { publisher: "google", label: "Gemini 2.5 Flash", released: "2025-06-17", source: google },
  "gemini-2.5-pro": { publisher: "google", label: "Gemini 2.5 Pro", released: "2025-06-17", source: google },
  "gemini-2.5-flash-lite": { publisher: "google", label: "Gemini 2.5 Flash-Lite", released: "2025-07-22", source: google },
  "gemini-3.1-pro-preview": { publisher: "google", label: "Gemini 3.1 Pro Preview", released: "2026-02-19", source: google },
  "gemini-3.1-pro-preview-customtools": { publisher: "google", label: "Gemini 3.1 Pro Preview Custom Tools", released: "2026-02-19", source: google },
  "gemini-3.1-flash-lite-preview": { publisher: "google", label: "Gemini 3.1 Flash-Lite Preview", released: "2026-03-03", source: google },
  "gemini-3.1-flash-lite": { publisher: "google", label: "Gemini 3.1 Flash-Lite", released: "2026-05-07", source: google },
  "gemini-3.7-flash": { publisher: "google", label: "Gemini 3.7 Flash", released: "2026-08-13", source: google },
  "muse-spark-1.1": { publisher: "meta", label: "Muse Spark 1.1", released: "2026-07-09", source: "https://ai.meta.com/global_search/" },
  "muse-spark-1.3-contributor": { publisher: "meta", label: "Muse Spark 1.3 Contributor", released: "2026-09-02", source: "https://dev.meta.ai/docs/muse-spark" },
  "muse-spark-1.2-contributor": { publisher: "meta", label: "Muse Spark 1.2 Contributor", released: "2026-08-05", source: "https://dev.meta.ai/docs/muse-spark" },
  "muse-spark-1.2": { publisher: "meta", label: "Muse Spark 1.2", released: "2026-08-05", source: "https://ai.meta.com/research/" },
  "gpt-5.4": { publisher: "openai", label: "GPT 5.4", released: "2026-03-05", source: openai },
  "gpt-5.4-mini": { publisher: "openai", label: "GPT 5.4 Mini", released: "2026-03-17", source: openai },
  "gpt-5.5": { publisher: "openai", label: "GPT 5.5", released: "2026-04-23", source: openai },
  "gpt-5.5-mini": { publisher: "openai", label: "GPT 5.5 Mini", released: "2026-04-23", source: openai },
  "gpt-6-luna": { publisher: "openai", label: "GPT 6 Luna", released: "2026-09-22", source: openai },
  "gpt-6.1-terra": { publisher: "openai", label: "GPT 6.1 Terra", released: "2026-10-26", source: openai },
  "gemma-4-31b-it": { publisher: "google", label: "Gemma 4 31B IT", released: "2026-04-02", source: "https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/" },
  "gemini-4-hydrogen": { publisher: "google", label: "Gemini 4 Hydrogen", released: "2026-11-12", source: google },
  "gemini-4-carbon": { publisher: "google", label: "Gemini 4 Carbon", released: "2026-11-10", source: google },
  "gemini-4-argon": { publisher: "google", label: "Gemini 4 Argon", released: "2026-10-13", source: google },
  "gemini-4-neon": { publisher: "google", label: "Gemini 4 Neon", released: "2026-11-18", source: google },
  "gemini-3.8-flash": { publisher: "google", label: "Gemini 3.8 Flash", released: "2026-09-02", source: google },
  "gemini-3.6-flash": { publisher: "google", label: "Gemini 3.6 Flash", released: "2026-07-21", source: google },
  "gemini-3.5-flash-lite": { publisher: "google", label: "Gemini 3.5 Flash-Lite", released: "2026-07-21", source: google },
  "gemini-3.5-flash": { publisher: "google", label: "Gemini 3.5 Flash", released: "2026-05-19", source: google },
  "gpt-6.2-sol": { publisher: "openai", label: "GPT 6.2 Sol", released: "2026-11-17", source: openai },
  "gpt-6.2-astra": { publisher: "openai", label: "GPT 6.2 Astra", released: "2026-11-17", source: openai },
  "gpt-6.1-sol": { publisher: "openai", label: "GPT 6.1 Sol", released: "2026-09-29", source: openai },
  "muse-spark-1.3": { publisher: "meta", label: "Muse Spark 1.3", released: "2026-09-02", source: "https://ai.meta.com/events/" },
  "muse-wonder-1.0": { publisher: "meta", label: "Muse Wonder", released: "2026-10-12", source: "https://about.fb.com/news/2026/10/introducing-muse-wonder-models/" },
  "deepseek-flash": { publisher: "deepseek", label: "DeepSeek V4.1 Flash", released: "2026-09-10", source: deepseek },
};

export function officialRelease(id: string, provider?: string): Release | undefined {
  if (!Object.hasOwn(releases, id)) return undefined;
  const release = releases[id];
  if (provider && provider !== "compatible-text" && provider !== release.publisher) return undefined;
  return release;
}

export function modelDisplayName(id: string) {
  return officialRelease(id)?.label ?? id;
}

export function recentlyReleased(date: string | undefined, now = new Date()): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const release = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(release.getTime()) || release.toISOString().slice(0, 10) !== date) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 0));
  cutoff.setUTCDate(Math.min(now.getUTCDate(), cutoff.getUTCDate()));
  return release >= cutoff && release <= now;
}

// Contributor variants use their underlying Spark version's release date.
export function eligibleSelectorModel(id: string, now = new Date()): boolean {
  const release = officialRelease(id);
  if (!release) return false;
  if (id === "gemma-4-31b-it") return release.released <= now.toISOString().slice(0, 10);
  return recentlyReleased(release.released, now);
}
