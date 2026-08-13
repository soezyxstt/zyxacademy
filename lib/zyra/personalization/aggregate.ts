import { daysFrom } from "@/lib/date-utils";
import {
  ZYRA_MIN_INFERENCE_EVIDENCE,
  ZYRA_PERSONALIZATION_VERSION,
  type InferredCheckpointType,
  type InferredExplanationLength,
  type InferredPace,
  type InferredRepresentation,
  type InferredSupportIntensity,
  type ZyraAdaptationDecision,
  type ZyraEvidenceRow,
  type ZyraLearnerPreferences,
} from "./contracts";

type WeightedValue<T extends string> = { value: T; weight: number };

function dominant<T extends string>(values: WeightedValue<T>[]): T | null {
  if (values.length === 0) return null;
  const totals = new Map<T, number>();
  for (const item of values) totals.set(item.value, (totals.get(item.value) ?? 0) + item.weight);
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const [value, weight] = ordered[0];
  const total = ordered.reduce((sum, [, amount]) => sum + amount, 0);
  if (weight < ZYRA_MIN_INFERENCE_EVIDENCE || weight / total < 0.6) return null;
  return value;
}

function latestEvidence(events: readonly ZyraEvidenceRow[]): Date | null {
  return events.reduce<Date | null>((latest, event) => {
    if (!latest || event.createdAt > latest) return event.createdAt;
    return latest;
  }, null);
}

function inferPace(events: readonly ZyraEvidenceRow[]): { value: InferredPace; reason: string } {
  const successful = events.filter((event) => event.outcome === "success" && event.responseLatencyBucket !== "unknown");
  const value = dominant(successful.map((event) => ({
    value: event.responseLatencyBucket === "slow"
      ? "slow"
      : event.responseLatencyBucket === "standard"
        ? "standard"
        : "fast",
    weight: event.weight,
  })));
  return {
    value: value as InferredPace | null ?? "unknown",
    reason: value ? "PACE_LATENCY_CONSENSUS" : "PACE_UNKNOWN_INSUFFICIENT",
  };
}

function inferRepresentation(events: readonly ZyraEvidenceRow[]): { value: InferredRepresentation; reason: string } {
  const successful = events.filter(
    (event) => event.outcome === "success" && event.representation !== "unknown",
  );
  const value = dominant(successful.map((event) => ({ value: event.representation, weight: event.weight })));
  return {
    value: value ?? "unknown",
    reason: value ? "REPRESENTATION_SUCCESS_CONSENSUS" : "REPRESENTATION_UNKNOWN_INSUFFICIENT",
  };
}

function inferSupport(events: readonly ZyraEvidenceRow[]): { value: InferredSupportIntensity; reason: string } {
  const scored = events.filter((event) => event.outcome === "success" || event.outcome === "failure");
  const hintRequests = events.filter((event) => event.eventKind === "hint_requested" || event.hintLevel !== "none" && event.hintLevel !== "unknown");
  if (scored.length < ZYRA_MIN_INFERENCE_EVIDENCE) {
    return { value: "unknown", reason: "SUPPORT_UNKNOWN_INSUFFICIENT" };
  }

  const failures = scored.filter((event) => event.outcome === "failure").length;
  const successRate = (scored.length - failures) / scored.length;
  if (failures / scored.length >= 0.6 || hintRequests.length >= 3) {
    return { value: "high", reason: "SUPPORT_REPEATED_STRUGGLE" };
  }
  if (successRate >= 0.8 && hintRequests.length <= 1) {
    return { value: "light", reason: "SUPPORT_SUCCESSFUL_INDEPENDENCE" };
  }
  return { value: "standard", reason: "SUPPORT_MIXED_EVIDENCE" };
}

function inferCheckpoint(events: readonly ZyraEvidenceRow[]): { value: InferredCheckpointType; reason: string } {
  const teachBacks = events.filter((event) => event.eventKind === "teach_back");
  if (teachBacks.length >= ZYRA_MIN_INFERENCE_EVIDENCE) {
    return { value: "teach_back", reason: "CHECKPOINT_TEACH_BACK_HISTORY" };
  }
  const freeText = events.filter(
    (event) => event.eventKind === "checkpoint_answered" && event.representation === "text",
  );
  if (freeText.length >= ZYRA_MIN_INFERENCE_EVIDENCE) {
    return { value: "free_text", reason: "CHECKPOINT_FREE_TEXT_HISTORY" };
  }
  return { value: "unknown", reason: "CHECKPOINT_UNKNOWN_INSUFFICIENT" };
}

function applyPreference<T extends string>(
  inferred: T,
  explicit: T | undefined,
  reasonCodes: string[],
  reason: string,
): T {
  if (!explicit) return inferred;
  reasonCodes.push(reason);
  return explicit;
}

export function aggregateZyraEvidence(input: {
  events: readonly ZyraEvidenceRow[];
  explicitPreferences?: ZyraLearnerPreferences;
  now?: Date;
}): ZyraAdaptationDecision {
  const now = input.now ?? new Date();
  const events = input.events
    .filter((event) => !event.expiresAt || event.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const explicit = input.explicitPreferences ?? {};
  const reasonCodes: string[] = [];
  const sufficient = events.length >= ZYRA_MIN_INFERENCE_EVIDENCE;
  if (!sufficient) reasonCodes.push("EVIDENCE_INSUFFICIENT");

  const pace = inferPace(events);
  const representation = inferRepresentation(events);
  const support = inferSupport(events);
  const checkpoint = inferCheckpoint(events);
  const inferredLength: InferredExplanationLength = support.value === "high"
    ? "detailed"
    : support.value === "light"
      ? "concise"
      : support.value === "standard"
        ? "standard"
        : "unknown";

  reasonCodes.push(pace.reason, representation.reason, support.reason, checkpoint.reason);
  if (inferredLength === "unknown") reasonCodes.push("EXPLANATION_UNKNOWN_INSUFFICIENT");
  else reasonCodes.push("EXPLANATION_DERIVED_FROM_SUPPORT");

  const lastEvidenceAt = latestEvidence(events);
  const expiresAt = lastEvidenceAt ? daysFrom(30, lastEvidenceAt) : null;
  const confidence = sufficient ? Math.min(1, Number((events.length / 10).toFixed(2))) : 0;

  const inferred = {
    pace: pace.value,
    representation: representation.value,
    supportIntensity: support.value,
    explanationLength: inferredLength,
    checkpointType: checkpoint.value,
  };

  const decision: ZyraAdaptationDecision = {
    profileVersion: ZYRA_PERSONALIZATION_VERSION,
    inferred,
    pace: applyPreference(pace.value, explicit.pace, reasonCodes, "EXPLICIT_PREFERENCE_PACE"),
    representation: applyPreference(
      representation.value,
      explicit.representation,
      reasonCodes,
      "EXPLICIT_PREFERENCE_REPRESENTATION",
    ),
    supportIntensity: support.value,
    explanationLength: applyPreference(
      inferredLength,
      explicit.explanationLength,
      reasonCodes,
      "EXPLICIT_PREFERENCE_EXPLANATION_LENGTH",
    ),
    checkpointType: applyPreference(
      checkpoint.value,
      explicit.checkpointType,
      reasonCodes,
      "EXPLICIT_PREFERENCE_CHECKPOINT",
    ),
    confidence,
    evidenceCount: events.length,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 32),
    lastEvidenceAt,
    expiresAt,
    explicitPreferences: { ...explicit },
  };

  return decision;
}
