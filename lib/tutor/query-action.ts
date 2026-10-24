import { z } from "zod";
import { PromptExecutor, type SystemPrompt } from "@/lib/prompt-executor";
import { USE_CASES } from "@/lib/ai-router";
import type { Locale } from "@/lib/i18n/locale";

export type QueryActionType =
  | "retrieve"
  | "reuse_previous_evidence"
  | "answer_from_conversation"
  | "clarify";

export type ResponseModifier =
  | "simpler"
  | "analogy"
  | "more_detail"
  | "worked_example"
  | "indonesian"
  | "english"
  | "graph"
  | "flowchart";

export type ResponseLanguage = Locale;

export function resolveResponseLanguage(input: {
  requestedLanguage?: unknown;
  responseModifiers?: readonly ResponseModifier[];
}): ResponseLanguage {
  const requested = input.requestedLanguage === "en" ? "en" : "id";
  if (input.responseModifiers?.includes("english")) return "en";
  if (input.responseModifiers?.includes("indonesian")) return "id";
  return requested;
}

export function responseLanguageFromHistory(history: readonly ConversationTurn[]): ResponseLanguage | null {
  for (const turn of [...history].reverse()) {
    if (turn.role !== "student") continue;
    const modifiers = extractStyleModifiers(turn.content).modifiers;
    if (modifiers.includes("english")) return "en";
    if (modifiers.includes("indonesian")) return "id";
  }
  return null;
}

export function responseLanguageInstruction(language: ResponseLanguage): string {
  return language === "en"
    ? "Write all learner-facing prose and generated canvas labels, captions, alt text, and fallback summaries in clear international English. Keep source titles, source text, citations, formulas, symbols, and assessment controls unchanged."
    : "Tulis semua prosa untuk pelajar serta label canvas, teks alternatif, dan ringkasan fallback dalam Bahasa Indonesia yang jelas. Pertahankan judul dan isi sumber, sitasi, rumus, simbol, dan batasan asesmen apa adanya.";
}

export type TopicContinuity = "same" | "changed" | "uncertain";

export interface QueryActionClassification {
  action: QueryActionType;
  contentFocus: string;
  responseModifiers: ResponseModifier[];
  topicContinuity: TopicContinuity;
  reasonCodes: string[];
}

export interface ConversationTurn {
  role: "student" | "zyra" | "ai" | string;
  content: string;
}

export interface ClassifyQueryInput {
  question: string;
  historyMessages?: ConversationTurn[];
}

const QueryActionSchema = z.object({
  action: z.enum(["retrieve", "reuse_previous_evidence", "answer_from_conversation", "clarify"]),
  contentFocus: z.string(),
  responseModifiers: z.array(
    z.enum([
      "simpler",
      "analogy",
      "more_detail",
      "worked_example",
      "indonesian",
      "english",
      "graph",
      "flowchart",
    ])
  ),
  topicContinuity: z.enum(["same", "changed", "uncertain"]),
  reasonCodes: z.array(z.string()),
});

interface ActionClassifierVars {
  question: string;
  historyText: string;
}

const actionClassifierPrompt: SystemPrompt<ActionClassifierVars> = {
  version: "tutor_rag/query_action_classifier/v1.0.0",
  systemInstruction: `You are an AI query action classifier for university course tutoring.
Analyze the user's new question in the context of recent conversation history.
Classify the question into one of 4 actions:
1. "retrieve": The user is asking about a new academic topic or concept that needs vector source search.
2. "reuse_previous_evidence": The user is asking to re-explain, simplify, give an analogy, or provide examples on the ALREADY DISCUSSED academic topic from history. No new vector search is required.
3. "answer_from_conversation": The user is making a social greeting, conversational remark, or meta-clarification about the current chat (e.g. "thanks", "who are you") needing no material search.
4. "clarify": The question is completely ambiguous, empty, or cannot safely determine what topic is being referred to even with history.

CRITICAL INSTRUCTIONS:
- 'contentFocus' MUST contain ONLY the academic topic/concept search terms in Indonesian. Strip all style/request phrases like "secara sederhana", "dengan analogi", "buatkan contoh", "gambarkan grafik".
- 'responseModifiers' list extracted style requirements: "simpler", "analogy", "more_detail", "worked_example", "indonesian", "english", "graph", "flowchart".
- 'topicContinuity': "same" if continuing previous topic, "changed" if new topic, "uncertain" if ambiguous.
- Output ONLY valid JSON matching the schema.`,
  userPrompt: (vars) => `CONVERSATION HISTORY:
${vars.historyText || "None"}

NEW QUESTION: ${vars.question}

Generate JSON matching:
{
  "action": "retrieve" | "reuse_previous_evidence" | "answer_from_conversation" | "clarify",
  "contentFocus": "academic search terms only",
  "responseModifiers": ["simpler", "analogy"],
  "topicContinuity": "same" | "changed" | "uncertain",
  "reasonCodes": ["CODE_1"]
}`,
};

const STYLE_PATTERNS: Array<{ regex: RegExp; modifier: ResponseModifier }> = [
  { regex: /\b(sederhana|simpler|sederhanakan|persederhana)\b/i, modifier: "simpler" },
  { regex: /\b(analogi|perumpamaan|ibarat|analogy)\b/i, modifier: "analogy" },
  { regex: /\b(lebih detail|penjelasan detail|detailkan|rincian|jelaskan lebih lanjut|teori lengkap(?:nya)?)\b/i, modifier: "more_detail" },
  { regex: /\b(contoh|contoh soal|latihan|worked example)\b/i, modifier: "worked_example" },
  { regex: /\b(bahasa indonesia|pake indo|pakai indo)\b/i, modifier: "indonesian" },
  { regex: /\b(english|bahasa inggris)\b/i, modifier: "english" },
  { regex: /\b(grafik|plot|kurva|graph|visualisasi|unsur visual|representasi visual)\b/i, modifier: "graph" },
  { regex: /\b(flowchart|diagram|bagan|skema)\b/i, modifier: "flowchart" },
];

const GREETING_META_REGEX = /^(terima kasih|makasih|thanks|thank you|halo|hai|hi|siapa kamu|siapa anda|oke|ok|siap|paham|baik|mantap)\b/i;

const PRONOUN_AMBIGUOUS_REGEX = /^(maksudnya\??|kenapa\??|mengapa\??|bisa bantu\??|maksudnya gimana\??|itu apa\??|dia apa\??)$/i;

const INJECTION_PATTERNS = /\b(ignore|previous|instructions|system prompt|jailbreak|disregard|dan abaikan|abaikan instruksi)\b/gi;

export function sanitizeTopicFocus(text: string): string {
  return text.replace(INJECTION_PATTERNS, "").replace(/\s+/g, " ").trim();
}

/**
 * Extracts style modifiers and strips style phrases to leave pure academic content focus.
 */
export function extractStyleModifiers(text: string): { cleanedText: string; modifiers: ResponseModifier[] } {
  let cleaned = text;
  const modifiers: ResponseModifier[] = [];

  for (const item of STYLE_PATTERNS) {
    if (item.regex.test(cleaned)) {
      if (!modifiers.includes(item.modifier)) {
        modifiers.push(item.modifier);
      }
      cleaned = cleaned.replace(item.regex, "").trim();
    }
  }

  cleaned = cleaned
    .replace(/\b(jelaskan|berikan|beri|tolong|coba|dong|ya|dan|dengan|pakai|secara|buatkan|lagi|bisa|bantu|saya|mengerti|lalu|dukung|jika)\b/gi, "")
    .replace(/[\p{P}\p{S}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = sanitizeTopicFocus(cleaned);

  return { cleanedText: cleaned, modifiers };
}


/**
 * Classifies incoming user query into typed QueryActionClassification.
 * Prefers deterministic detection for empty, greetings, explicit style-only follow-ups, and first turns.
 * Uses PromptExecutor AI classifier for ambiguous cases.
 */
export async function classifyQueryAction(
  input: ClassifyQueryInput,
  options?: { userId?: string; deterministicOnly?: boolean }
): Promise<QueryActionClassification> {
  const rawQuestion = (input.question || "").trim();
  const history = input.historyMessages || [];

  // 1. Empty or whitespace query
  if (!rawQuestion) {
    return {
      action: "clarify",
      contentFocus: "",
      responseModifiers: [],
      topicContinuity: "uncertain",
      reasonCodes: ["EMPTY_QUERY"],
    };
  }

  const { cleanedText, modifiers } = extractStyleModifiers(rawQuestion);

  // 2. Pure greetings or meta conversational remarks
  if (GREETING_META_REGEX.test(rawQuestion)) {
    return {
      action: "answer_from_conversation",
      contentFocus: rawQuestion,
      responseModifiers: modifiers,
      topicContinuity: history.length > 0 ? "same" : "changed",
      reasonCodes: ["CONVERSATIONAL_GREETING"],
    };
  }

  // 3. First turn (no history)
  if (history.length === 0) {
    if (PRONOUN_AMBIGUOUS_REGEX.test(rawQuestion) || (cleanedText.length < 3 && rawQuestion.length < 10)) {
      return {
        action: "clarify",
        contentFocus: rawQuestion,
        responseModifiers: modifiers,
        topicContinuity: "uncertain",
        reasonCodes: ["AMBIGUOUS_WITHOUT_HISTORY"],
      };
    }

    return {
      action: "retrieve",
      contentFocus: cleanedText || rawQuestion,
      responseModifiers: modifiers,
      topicContinuity: "changed",
      reasonCodes: ["FIRST_TURN_DIRECT_RETRIEVE"],
    };
  }

  // 4. Conversation history exists: check for deterministic style follow-up on same topic
  const studentMessages = history.filter((m) => m.role === "student");
  const lastStudentMsg = studentMessages[studentMessages.length - 1]?.content || "";
  const lastTopicCleaned = extractStyleModifiers(lastStudentMsg).cleanedText;

  if (modifiers.length > 0 && (cleanedText.length < 4 || PRONOUN_AMBIGUOUS_REGEX.test(rawQuestion))) {
    return {
      action: "reuse_previous_evidence",
      contentFocus: sanitizeTopicFocus(lastTopicCleaned || lastStudentMsg || rawQuestion),
      responseModifiers: modifiers,
      topicContinuity: "same",
      reasonCodes: ["DETERMINISTIC_STYLE_FOLLOWUP"],
    };
  }

  // 5. Ambiguous or multi-turn query: run AI query classifier
  const historyText = history
    .map((m) => `${m.role === "student" ? "STUDENT" : "ZYRA"}: ${m.content}`)
    .join("\n");

  if (options?.deterministicOnly) {
    return {
      action: "retrieve",
      contentFocus: sanitizeTopicFocus(cleanedText || rawQuestion),
      responseModifiers: modifiers,
      topicContinuity: history.length > 0 ? "uncertain" : "changed",
      reasonCodes: ["DETERMINISTIC_PEDAGOGY_ROUTE"],
    };
  }

  try {
    const result = await PromptExecutor.run({
      userId: options?.userId || "system_action_router",
      prompt: actionClassifierPrompt,
      variables: { question: rawQuestion, historyText },
      schema: QueryActionSchema,
      useCase: USE_CASES.GROUNDED_RAG,
    });

    if (result.success && result.data) {
      return {
        action: result.data.action,
        contentFocus: result.data.contentFocus.trim() || cleanedText || rawQuestion,
        responseModifiers: result.data.responseModifiers,
        topicContinuity: result.data.topicContinuity,
        reasonCodes: ["AI_CLASSIFICATION_SUCCESS", ...result.data.reasonCodes],
      };
    }
  } catch (err) {
    console.error("[QueryAction] AI classification error, falling back:", err);
  }

  if (PRONOUN_AMBIGUOUS_REGEX.test(rawQuestion)) {
    return {
      action: "clarify",
      contentFocus: rawQuestion,
      responseModifiers: modifiers,
      topicContinuity: "uncertain",
      reasonCodes: ["AMBIGUOUS_FALLBACK"],
    };
  }

  return {
    action: "retrieve",
    contentFocus: cleanedText || rawQuestion,
    responseModifiers: modifiers,
    topicContinuity: "changed",
    reasonCodes: ["FALLBACK_DIRECT_RETRIEVE"],
  };
}
