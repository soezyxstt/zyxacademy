import type { ZyraAdaptationDecision } from "./contracts";

function firstLine(decision: ZyraAdaptationDecision): string | null {
  if (decision.supportIntensity === "high") {
    return "Kita pelan-pelan dan bertahap ya.";
  }
  if (decision.representation === "stepwise") {
    return "Kita pecah penjelasannya menjadi beberapa langkah.";
  }
  if (decision.representation === "visual") {
    return "Coba bayangkan hubungan antarbagian ini secara visual.";
  }
  if (decision.explanationLength === "concise") {
    return "Intinya begini:";
  }
  if (decision.explanationLength === "detailed") {
    return "Kita uraikan dengan lebih lengkap.";
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
): string {
  const lead = firstLine(decision);
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
