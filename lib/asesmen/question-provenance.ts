export const QUESTION_ORIGINS = ["zyx_original", "historical_reference", "itb_example"] as const;

export type QuestionOrigin = (typeof QUESTION_ORIGINS)[number];

export type QuestionProvenance = {
  origin: QuestionOrigin;
  sourceEventName: string | null;
  sourceReferenceId: string | null;
};

type ProvenanceInput = {
  origin?: unknown;
  sourceEventName?: unknown;
  source_event_name?: unknown;
  sourceReferenceId?: unknown;
  source_reference_id?: unknown;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeQuestionProvenance(input: ProvenanceInput | null | undefined): QuestionProvenance {
  const origin = input?.origin === "itb_example"
    ? "itb_example"
    : input?.origin === "historical_reference"
      ? "historical_reference"
      : "zyx_original";
  if (origin === "zyx_original") {
    return { origin, sourceEventName: null, sourceReferenceId: null };
  }

  return {
    origin,
    sourceEventName: nonEmptyString(input?.sourceEventName ?? input?.source_event_name),
    sourceReferenceId: nonEmptyString(input?.sourceReferenceId ?? input?.source_reference_id),
  };
}

export function assertCompleteQuestionProvenance(input: ProvenanceInput): QuestionProvenance {
  const provenance = normalizeQuestionProvenance(input);
  if ((provenance.origin === "itb_example" || provenance.origin === "historical_reference") && (!provenance.sourceEventName || !provenance.sourceReferenceId)) {
    throw new Error(provenance.origin === "itb_example" ? "QUESTION_ITB_PROVENANCE_INCOMPLETE" : "QUESTION_HISTORICAL_PROVENANCE_INCOMPLETE");
  }
  return provenance;
}

export function questionProvenanceSnapshot(input: ProvenanceInput): QuestionProvenance {
  return assertCompleteQuestionProvenance(input);
}
