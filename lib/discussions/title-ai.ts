import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discussionMessages, discussionThreads } from "@/db/schema";
import { configuredModelChain } from "@/lib/ai/model-settings-store";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import { getModelEntry, modelSupportsAiGateway, ROUTE_POLICY } from "@/lib/ai/provider/model-registry";
import { geminiKeyPool } from "@/lib/gemini-keys";

const MAX_TITLE_LENGTH = 120;
const SYSTEM_INSTRUCTION =
  "Kamu membuat judul singkat untuk pertanyaan forum akademik Zyx. " +
  "Balas hanya satu baris judul singkat dalam bahasa yang sama dengan pertanyaan (maksimal 10 kata, maksimal 100 karakter), " +
  "tanpa tanda kutip, tanpa format Markdown, tanpa awalan seperti 'Judul:', dan tanpa titik di akhir.";

export function cleanGeneratedTitle(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let cleaned = raw
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

  if (!cleaned) return null;
  if (cleaned.length > MAX_TITLE_LENGTH) {
    const sliced = cleaned.slice(0, MAX_TITLE_LENGTH).trim();
    const lastSpace = sliced.lastIndexOf(" ");
    cleaned = lastSpace > 40 ? sliced.slice(0, lastSpace).trim() : sliced;
  }
  return cleaned || null;
}

function buildMockTitle(body: string): string | null {
  const plain = body
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.split(/[.!?](?:\s|$)/)[0] ?? plain;
  return cleanGeneratedTitle(sentence.slice(0, 72));
}

export async function generateDiscussionThreadTitle(
  threadId: string,
  expectedInitialTitle: string,
): Promise<{ updated: boolean; title?: string; reason?: string }> {
  if (!threadId || !expectedInitialTitle) {
    return { updated: false, reason: "invalid_input" };
  }

  const [thread] = await db
    .select({
      id: discussionThreads.id,
      title: discussionThreads.title,
      status: discussionThreads.status,
    })
    .from(discussionThreads)
    .where(eq(discussionThreads.id, threadId))
    .limit(1);

  if (!thread || thread.status !== "open" || thread.title !== expectedInitialTitle) {
    return { updated: false, reason: "source_changed" };
  }

  const [question] = await db
    .select({
      id: discussionMessages.id,
      body: discussionMessages.body,
      deletedAt: discussionMessages.deletedAt,
      messageType: discussionMessages.messageType,
      seq: discussionMessages.seq,
    })
    .from(discussionMessages)
    .where(
      and(
        eq(discussionMessages.threadId, threadId),
        eq(discussionMessages.seq, 1),
        eq(discussionMessages.messageType, "question"),
      ),
    )
    .limit(1);

  if (!question || question.deletedAt || !question.body.trim()) {
    return { updated: false, reason: "no_question_body" };
  }

  let candidateTitle: string | null = null;

  if (process.env.MOCK_GEMINI === "true") {
    candidateTitle = buildMockTitle(question.body);
  } else {
    const models = await configuredModelChain(
      { feature: "zyra", useCase: "chapter-summary" },
      ROUTE_POLICY.default,
    );
    const prompt = `Buatlah satu judul singkat dan jelas untuk pertanyaan diskusi berikut:\n\n${question.body.trim().slice(0, 2000)}`;

    for (const model of models) {
      let entry;
      try {
        entry = getModelEntry(model);
      } catch {
        continue;
      }
      if (entry.family === "embedding") continue;

      const key = geminiKeyPool.getBestKey(model);
      if (!key) continue;

      try {
        const adapter =
          entry.family === "interactions"
            ? createGeminiInteractionsAdapter({ interactions: key.client.interactions })
            : createGeminiGenerateAdapter({
                models: (modelSupportsAiGateway(model) && key.clientGateway ? key.clientGateway : key.client).models,
              });
        const response = await adapter.generate({
          modelId: model,
          parts: [{ type: "text", text: prompt }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 128,
          },
        });
        geminiKeyPool.markSuccess(key.id, model);
        const cleaned = cleanGeneratedTitle(response.text);
        if (cleaned) {
          candidateTitle = cleaned;
          break;
        }
      } catch (error) {
        geminiKeyPool.markFailure(key.id, model, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  if (!candidateTitle || candidateTitle === expectedInitialTitle) {
    return { updated: false, reason: "no_change" };
  }

  const updated = await db
    .update(discussionThreads)
    .set({ title: candidateTitle })
    .where(
      and(
        eq(discussionThreads.id, threadId),
        eq(discussionThreads.title, expectedInitialTitle),
        eq(discussionThreads.status, "open"),
      ),
    )
    .returning({ id: discussionThreads.id });

  if (!updated.length) {
    return { updated: false, reason: "concurrent_change" };
  }

  return { updated: true, title: candidateTitle };
}
