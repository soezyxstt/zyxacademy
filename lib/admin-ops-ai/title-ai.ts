const MAX_OPS_AI_TITLE_LENGTH = 64;
const MAX_OPS_AI_TITLE_WORDS = 8;

const PLACEHOLDER_TITLES = new Set([
  "",
  "percakapan baru",
  "sesi percakapan",
  "zyx ops ai",
]);

const SYSTEM_INSTRUCTION =
  "Kamu membuat judul singkat untuk sesi percakapan operasional admin Zyx Ops AI. " +
  "Balas hanya satu baris judul singkat dan jelas dalam bahasa yang sama dengan pesan pengguna (maksimal 8 kata, maksimal 64 karakter), " +
  "tanpa tanda kutip, tanpa format Markdown, tanpa em dash atau en dash, tanpa simbol LaTeX mentah seperti $, tanpa awalan seperti 'Judul:', dan tanpa titik di akhir.";

function cleanBaseTitle(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\0/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/^(?:judul|title)\s*:\s*/i, "")
    .replace(/[*_`~#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/\.+$/g, "")
    .trim();
  return cleaned || null;
}

export function cleanOpsAiSessionTitle(raw: string): string {
  const base = cleanBaseTitle(raw);
  if (!base) return "";
  let cleaned = base
    .replace(/\$+/g, "")
    .replace(/[\u2013\u2014]+/g, " ")
    .replace(/!+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length > MAX_OPS_AI_TITLE_WORDS) {
    cleaned = words.slice(0, MAX_OPS_AI_TITLE_WORDS).join(" ");
  }

  if (cleaned.length > MAX_OPS_AI_TITLE_LENGTH) {
    const sliced = cleaned.slice(0, MAX_OPS_AI_TITLE_LENGTH).trim();
    const lastSpace = sliced.lastIndexOf(" ");
    cleaned = lastSpace > 24 ? sliced.slice(0, lastSpace).trim() : sliced;
  }

  return cleaned.replace(/\.+$/g, "").trim();
}

export function isInitialOpsAiTitle(
  title: string | undefined | null,
  firstUserMessage?: string,
): boolean {
  const normalized = (title ?? "").trim();
  if (PLACEHOLDER_TITLES.has(normalized.toLowerCase())) {
    return true;
  }
  if (firstUserMessage) {
    const rawMessage = firstUserMessage.trim().replace(/\s+/g, " ");
    const truncated48 = rawMessage.slice(0, 48).trim();
    if (
      normalized === rawMessage ||
      normalized === truncated48 ||
      normalized === `${truncated48}...` ||
      normalized === `${rawMessage.slice(0, 45).trim()}...`
    ) {
      return true;
    }
  }
  return false;
}

function buildMockOpsAiTitle(userMessage: string): string {
  const plain = userMessage
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`~>$]/g, "")
    .replace(/[\u2013\u2014]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.split(/[.!?](?:\s|$)/)[0] ?? plain;
  return cleanOpsAiSessionTitle(sentence);
}

export async function generateOpsAiSessionTitle(input: {
  userMessage: string;
  assistantMessage?: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const userMessage = input.userMessage.trim();
  if (!userMessage || input.signal?.aborted) {
    return null;
  }

  if (process.env.MOCK_GEMINI === "true") {
    const mockTitle = buildMockOpsAiTitle(userMessage);
    return mockTitle || null;
  }

  const [
    { configuredModelChain },
    { createGeminiGenerateAdapter },
    { createGeminiInteractionsAdapter },
    { getModelEntry, ROUTE_POLICY },
    { geminiKeyPool },
  ] = await Promise.all([
    import("@/lib/ai/model-settings-store"),
    import("@/lib/ai/provider/gemini-generate-adapter"),
    import("@/lib/ai/provider/gemini-interactions-adapter"),
    import("@/lib/ai/provider/model-registry"),
    import("@/lib/gemini-keys"),
  ]);

  const models = await configuredModelChain(
    { feature: "zyra", useCase: "chapter-summary" },
    ROUTE_POLICY.default,
  );

  const assistantSnippet = (input.assistantMessage ?? "").trim().slice(0, 600);
  const prompt = assistantSnippet
    ? `Buatlah satu judul singkat dan jelas untuk sesi operasional admin berikut.\n\nPesan pengguna:\n${userMessage.slice(0, 1000)}\n\nRingkasan respons asisten:\n${assistantSnippet}`
    : `Buatlah satu judul singkat dan jelas untuk sesi operasional admin berikut:\n\n${userMessage.slice(0, 1200)}`;

  for (const model of models) {
    if (input.signal?.aborted) {
      return null;
    }

    let entry;
    try {
      entry = getModelEntry(model);
    } catch {
      continue;
    }
    if (entry.family === "embedding" || entry.family === "chat-completions") {
      continue;
    }

    const key = geminiKeyPool.getBestKey(model);
    if (!key) continue;

    try {
      const adapter =
        entry.family === "interactions"
          ? createGeminiInteractionsAdapter({ interactions: key.client.interactions })
          : createGeminiGenerateAdapter({ models: key.client.models });
      const response = await adapter.generate({
        modelId: model,
        parts: [{ type: "text", text: prompt }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.2,
          maxOutputTokens: 64,
        },
      });
      geminiKeyPool.markSuccess(key.id, model);
      const cleaned = cleanOpsAiSessionTitle(response.text);
      if (cleaned) {
        return cleaned;
      }
    } catch (error) {
      geminiKeyPool.markFailure(
        key.id,
        model,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  return null;
}
