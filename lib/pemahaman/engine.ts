import { createHash } from "node:crypto";

export const PEMAHAMAN_ALGORITHM_VERSION = "per-idea.v1";
export const PEMAHAMAN_RUBRIC_VERSION = "idea-evidence.v1";

export type EvidenceDerivationStatus =
  | "verified"
  | "deterministic"
  | "reviewed"
  | "direct"
  | "derived"
  | "ambiguous"
  | "rejected"
  | "invalidated";

export type IdeaEvidence = {
  id: string;
  ideaId: string;
  sourceId: string;
  evidenceSource: string;
  scoreContribution: number;
  weight?: number;
  confidence: number;
  derivationStatus: EvidenceDerivationStatus;
  ambiguous?: boolean;
  affectsMastery: boolean;
  occurredAt: Date;
  rubricVersion?: string;
};

export type IdeaMasteryState = {
  ideaId: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  evidenceIds: string[];
  inputWatermark: string;
  algorithmVersion: string;
  sourceDiversity: number;
  agreement: number;
  lastEvidenceAt: Date | null;
};

const SOURCE_POLICY: Record<string, number> = {
  answer: 1,
  deterministic_rubric: 1,
  flashcard_review: 0.85,
  material_completion: 0.65,
  tutor_assessment: 0.8,
  manual: 0.7,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundStable(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function normalizedScore(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function normalizedConfidence(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100) / 100;
}

function normalizedWeight(value: number | undefined): number {
  return clamp(Number.isFinite(value ?? 1) ? value ?? 1 : 1, 0.01, 1);
}

function isVerifiedEvidence(evidence: IdeaEvidence): boolean {
  return (
    evidence.affectsMastery &&
    !evidence.ambiguous &&
    (evidence.derivationStatus === "verified" ||
      evidence.derivationStatus === "deterministic" ||
      evidence.derivationStatus === "reviewed" ||
      evidence.derivationStatus === "direct" ||
      evidence.derivationStatus === "derived")
  );
}

function stableEvidence(evidence: IdeaEvidence[]): IdeaEvidence[] {
  return [...evidence]
    .filter(isVerifiedEvidence)
    .sort((a, b) => {
      const timeDelta = a.occurredAt.getTime() - b.occurredAt.getTime();
      return timeDelta === 0 ? a.id.localeCompare(b.id) : timeDelta;
    });
}

function recencyWeight(occurredAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - occurredAt.getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function sourceWeight(source: string): number {
  return SOURCE_POLICY[source] ?? 0.75;
}

function calculateWatermark(evidence: IdeaEvidence[]): string {
  const last = evidence[evidence.length - 1];
  return last ? `${last.occurredAt.toISOString()}:${last.id}` : "";
}

export function computeIdeaMastery(
  ideaId: string,
  evidence: IdeaEvidence[],
  now: Date = new Date(),
): IdeaMasteryState {
  const usable = stableEvidence(evidence.filter((item) => item.ideaId === ideaId));
  if (usable.length === 0) {
    return {
      ideaId,
      score: 0,
      confidence: 0,
      evidenceCount: 0,
      evidenceIds: [],
      inputWatermark: "",
      algorithmVersion: PEMAHAMAN_ALGORITHM_VERSION,
      sourceDiversity: 0,
      agreement: 0,
      lastEvidenceAt: null,
    };
  }

  const weighted = usable.map((item) => {
    const recency = recencyWeight(item.occurredAt, now);
    const confidence = normalizedConfidence(item.confidence);
    const effectiveWeight =
      normalizedWeight(item.weight) * sourceWeight(item.evidenceSource) * recency * (0.5 + confidence / 2);
    return {
      item,
      recency,
      effectiveWeight,
      score: normalizedScore(item.scoreContribution),
      confidence,
    };
  });

  const totalWeight = weighted.reduce((sum, item) => sum + item.effectiveWeight, 0);
  const scoreMean =
    totalWeight === 0
      ? 0
      : weighted.reduce((sum, item) => sum + item.score * item.effectiveWeight, 0) / totalWeight;
  const variance =
    totalWeight === 0
      ? 0
      : weighted.reduce((sum, item) => sum + Math.pow(item.score - scoreMean, 2) * item.effectiveWeight, 0) /
        totalWeight;
  const agreement = clamp(1 - variance / 0.25, 0, 1);
  const sourceDiversity = clamp(new Set(usable.map((item) => item.evidenceSource)).size / 3, 0, 1);
  const effectiveCount = weighted.reduce((sum, item) => sum + normalizedWeight(item.item.weight), 0);
  const countFactor = 1 - Math.exp(-effectiveCount / 4);
  const averageRecency =
    weighted.reduce((sum, item) => sum + item.recency, 0) / Math.max(1, weighted.length);
  const confidenceScore =
    countFactor * (0.35 + sourceDiversity * 0.25 + averageRecency * 0.2 + agreement * 0.2);

  return {
    ideaId,
    score: roundStable(scoreMean * 100),
    confidence: roundStable(confidenceScore * 100),
    evidenceCount: usable.length,
    evidenceIds: usable.map((item) => item.id),
    inputWatermark: calculateWatermark(usable),
    algorithmVersion: PEMAHAMAN_ALGORITHM_VERSION,
    sourceDiversity: Number(sourceDiversity.toFixed(4)),
    agreement: Number(agreement.toFixed(4)),
    lastEvidenceAt: usable[usable.length - 1]?.occurredAt ?? null,
  };
}

export function replayIdeaMastery(
  ideaId: string,
  evidence: IdeaEvidence[],
  now: Date = new Date(),
): IdeaMasteryState {
  return computeIdeaMastery(ideaId, evidence, now);
}

export function hashIdeaMasteryState(state: IdeaMasteryState): string {
  const canonical = JSON.stringify({
    ideaId: state.ideaId,
    score: state.score,
    confidence: state.confidence,
    evidenceCount: state.evidenceCount,
    evidenceIds: state.evidenceIds,
    inputWatermark: state.inputWatermark,
    algorithmVersion: state.algorithmVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function isMasteryEvidence(evidence: IdeaEvidence): boolean {
  return isVerifiedEvidence(evidence);
}
