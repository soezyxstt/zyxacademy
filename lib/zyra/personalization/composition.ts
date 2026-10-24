import type { ZyraAdaptationDecision } from "./contracts";

function firstLine(decision: ZyraAdaptationDecision, language: "id" | "en"): string | null {
  if (decision.supportIntensity === "high") {
    return language === "en" ? "Let's take this slowly, one step at a time." : "Kita pelan-pelan dan bertahap.";
  }
  if (decision.representation === "stepwise") {
    return language === "en" ? "Let's break the explanation into a few steps." : "Kita pecah penjelasannya menjadi beberapa langkah.";
  }
  if (decision.representation === "visual") {
    return language === "en" ? "Try picturing how these parts relate." : "Coba bayangkan hubungan antarbagian ini secara visual.";
  }
  if (decision.explanationLength === "concise") {
    return language === "en" ? "The key idea is:" : "Intinya begini:";
  }
  if (decision.explanationLength === "detailed") {
    return language === "en" ? "Let's unpack this in more detail." : "Kita uraikan dengan lebih lengkap.";
  }
  return null;
}

/**
 * Applies only deterministic, learner-local presentation changes. The input
 * answer is the profile-free shared scaffold and is never written back to it.
 */
export function composePersonalizedAnswer(
  sharedAnswer: string,
  decision: ZyraAdaptationDecision,
  responseLanguage: "id" | "en" = "id",
): string {
  const lead = firstLine(decision, responseLanguage);
  if (!lead || !sharedAnswer.trim()) return sharedAnswer;
  return `${lead}\n\n${sharedAnswer.trim()}`;
}

export function assertProfileFreeSharedPayload(payload: unknown): void {
  const forbiddenKeys = new Set([
    "adaptation",
    "profile",
    "supportIntensity",
    "inferredPace",
    "inferredRepresentation",
    "explanationLength",
    "checkpointType",
    "explicitPreferences",
  ]);

  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error("ZYRA_SHARED_PAYLOAD_CONTAINS_PROFILE");
      visit(child);
    }
  }

  visit(payload);
}
