export interface Attribution {
  type: "mastery" | "quiz_performance" | "flashcard_failure" | "material_progress" | "conversation_history";
  label: string;
  detail: string;
  confidence: number;
  sourceId?: string;
}

export interface ExplainableResponse {
  response: string;
  attributions: Attribution[];
}

export interface AttributionSource {
  type: Attribution["type"];
  label: string;
  getAttributions(params: AttributionParams): Promise<Attribution[]>;
}

export interface AttributionParams {
  studentId: string;
  courseId: string;
  conceptName?: string;
  limit?: number;
}

export interface ExplainabilityService {
  buildAttributions(params: AttributionParams): Promise<Attribution[]>;
}

export class MasteryAttributionSource implements AttributionSource {
  type = "mastery" as const;
  label = "Concept Mastery";

  async getAttributions(params: AttributionParams): Promise<Attribution[]> {
    const { conceptName } = params;
    if (!conceptName) return [];

    return [
      {
        type: "mastery",
        label: `Mastery in ${conceptName}`,
        detail: "",
        confidence: 0.8,
      },
    ];
  }
}

export class QuizPerformanceAttributionSource implements AttributionSource {
  type = "quiz_performance" as const;
  label = "Quiz Performance";

  async getAttributions(_params: AttributionParams): Promise<Attribution[]> {
    return [];
  }
}

export class FlashcardFailureAttributionSource implements AttributionSource {
  type = "flashcard_failure" as const;
  label = "Flashcard Failures";

  async getAttributions(_params: AttributionParams): Promise<Attribution[]> {
    return [];
  }
}

export const attributionSources: AttributionSource[] = [
  new MasteryAttributionSource(),
  new QuizPerformanceAttributionSource(),
  new FlashcardFailureAttributionSource(),
];

export async function buildExplainableResponse(
  response: string,
  params: AttributionParams
): Promise<ExplainableResponse> {
  const allAttributions: Attribution[] = [];

  for (const source of attributionSources) {
    try {
      const attributions = await source.getAttributions(params);
      allAttributions.push(...attributions);
    } catch {
      continue;
    }
  }

  return {
    response,
    attributions: allAttributions,
  };
}