import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { configuredModelChain } from "@/lib/ai/model-settings-store";
import { createGeminiGenerateAdapter } from "@/lib/ai/provider/gemini-generate-adapter";
import { createGeminiInteractionsAdapter } from "@/lib/ai/provider/gemini-interactions-adapter";
import { getModelEntry, ROUTE_POLICY } from "@/lib/ai/provider/model-registry";
import { cleanGeneratedTitle } from "@/lib/discussions/title-ai";
import { geminiKeyPool } from "@/lib/gemini-keys";

const MAX_ZYRA_TITLE_LENGTH = 80;
const PLACEHOLDER_TITLES = new Set(["", "general chat", "percakapan"]);

const SYSTEM_INSTRUCTION =
  "Kamu membuat judul singkat untuk sesi percakapan belajar dengan Zyra. " +
  "Balas hanya satu baris judul singkat dan jelas dalam bahasa yang sama dengan pertanyaan (maksimal 8 kata, maksimal 80 karakter), " +
  "tanpa tanda kutip, tanpa format Markdown, tanpa simbol LaTeX mentah seperti $, tanpa awalan seperti 'Judul:', dan tanpa titik di akhir.";

export function cleanZyraSessionTitle(raw: string): string | null {
  const base = cleanGeneratedTitle(raw);
  if (!base) return null;
  let cleaned = base.replace(/\$+/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_ZYRA_TITLE_LENGTH) {
    const sliced = cleaned.slice(0, MAX_ZYRA_TITLE_LENGTH).trim();
    const lastSpace = sliced.lastIndexOf(" ");
    cleaned = lastSpace > 32 ? sliced.slice(0, lastSpace).trim() : sliced;
  }
  return cleaned || null;
}

export function isInitialZyraSessionTitle(
  title: string | null | undefined,
  question?: string,
): boolean {
  const normalized = (title ?? "").trim();
  if (PLACEHOLDER_TITLES.has(normalized.toLowerCase())) return true;
  if (question) {
    const rawQuestion = question.trim();
    if (normalized === rawQuestion || normalized === rawQuestion.slice(0, 100)) {
      return true;
    }
  }
  return false;
}

function buildMockZyraTitle(question: string): string | null {
  const plain = question
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`~>$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.split(/[.!?](?:\s|$)/)[0] ?? plain;
  return cleanZyraSessionTitle(sentence.slice(0, 64));
}

export async function generateZyraSessionTitle(input: {
  sessionId: string;
  studentId: string;
  courseId: string;
  question: string;
}): Promise<{ updated: boolean; title?: string; reason?: string }> {
  const sessionId = input.sessionId.trim();
  const question = input.question.trim();
  if (!sessionId || !input.studentId || !input.courseId || !question) {
    return { updated: false, reason: "invalid_input" };
  }

  const [session] = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
    })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.studentId, input.studentId),
        eq(chatSessions.courseId, input.courseId),
      ),
    )
    .limit(1);

  if (!session) {
    return { updated: false, reason: "not_found" };
  }

  if (!isInitialZyraSessionTitle(session.title, question)) {
    return { updated: false, reason: "already_titled" };
  }

  let candidateTitle: string | null = null;

  if (process.env.MOCK_GEMINI === "true") {
    candidateTitle = buildMockZyraTitle(question);
  } else {
    const models = await configuredModelChain(
      { feature: "zyra", useCase: "chapter-summary" },
      ROUTE_POLICY.default,
    );
    const prompt = `Buatlah satu judul singkat dan jelas untuk sesi belajar berikut:\n\n${question.slice(0, 1500)}`;

    for (const model of models) {
      let entry;
      try {
        entry = getModelEntry(model);
      } catch {
        continue;
      }
      if (entry.family === "embedding" || entry.family === "chat-completions") continue;

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
            maxOutputTokens: 96,
          },
        });
        geminiKeyPool.markSuccess(key.id, model);
        const cleaned = cleanZyraSessionTitle(response.text);
        if (cleaned) {
          candidateTitle = cleaned;
          break;
        }
      } catch (error) {
        geminiKeyPool.markFailure(
          key.id,
          model,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  if (!candidateTitle || candidateTitle === session.title) {
    return { updated: false, reason: "no_change" };
  }

  const updated = await db
    .update(chatSessions)
    .set({ title: candidateTitle })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.studentId, input.studentId),
        eq(chatSessions.courseId, input.courseId),
        eq(chatSessions.title, session.title),
      ),
    )
    .returning({ id: chatSessions.id });

  if (!updated.length) {
    return { updated: false, reason: "concurrent_change" };
  }

  return { updated: true, title: candidateTitle };
}
