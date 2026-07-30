import {
  DistractorProvenanceRecord,
  BlueprintSlot,
  MisconceptionFamily,
  MappingMethod,
  UncertaintyState,
  UnshuffledDraftOption,
} from "./contracts";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "and", "or", "with",
  "for", "as", "by", "that", "this", "it", "be", "at", "from",
  "yang", "dan", "atau", "di", "ke", "dari", "untuk", "pada", "adalah", "ini",
  "itu", "dengan", "sebuah", "suatu",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/\$\$?[^$]*\$\$?/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const CONFIDENT_THRESHOLD = 0.35;
const AMBIGUOUS_THRESHOLD = 0.20;

export interface MisconceptionKORecord {
  id: string;
  title: string;
  content: string;
}

/**
 * Builds structured machine-readable distractor provenance records for all non-correct options.
 */
export function buildDistractorProvenances(input: {
  options: UnshuffledDraftOption[];
  blueprintSlot?: BlueprintSlot;
  misconceptionKOs?: MisconceptionKORecord[];
  methodVersion?: string;
}): DistractorProvenanceRecord[] {
  const { options, blueprintSlot, misconceptionKOs = [], methodVersion = "2.0" } = input;

  const koTokens = misconceptionKOs.map((ko) => ({
    ko,
    tokens: tokenize(`${ko.title} ${ko.content}`),
  }));

  const records: DistractorProvenanceRecord[] = [];

  options.forEach((opt, index) => {
    // Skip correct options
    if (opt.isCorrect) return;

    const optTokens = tokenize(opt.text);
    let bestMatch: { ko: MisconceptionKORecord; score: number } | null = null;

    for (const cand of koTokens) {
      const score = jaccardSimilarity(optTokens, cand.tokens);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { ko: cand.ko, score };
      }
    }

    let targetedMisconception: MisconceptionFamily = opt.misconceptionFamily || "none";
    let misconceptionKoId: string | null = null;
    let mappingMethod: MappingMethod = "unknown";
    let uncertaintyState: UncertaintyState = "unknown";
    let score = 0;
    const supportingSourceIds: string[] = [];

    if (bestMatch && bestMatch.score >= CONFIDENT_THRESHOLD) {
      // Confident match
      score = Number(bestMatch.score.toFixed(3));
      mappingMethod = "lexical_overlap";
      uncertaintyState = "confident";
      misconceptionKoId = bestMatch.ko.id;
      targetedMisconception = "misconception";
      supportingSourceIds.push(bestMatch.ko.id);
    } else if (bestMatch && bestMatch.score >= AMBIGUOUS_THRESHOLD) {
      // Ambiguous match: Persist ambiguous as unknown!
      score = Number(bestMatch.score.toFixed(3));
      mappingMethod = "unknown";
      uncertaintyState = "ambiguous";
      misconceptionKoId = null;
      targetedMisconception = opt.misconceptionFamily || "other";
      supportingSourceIds.push(bestMatch.ko.id);
    } else if (opt.misconceptionFamily && opt.misconceptionFamily !== "none") {
      // Heuristic pattern from slot or option strategy
      mappingMethod = "heuristic_pattern";
      uncertaintyState = "confident";
      targetedMisconception = opt.misconceptionFamily;
    } else {
      // Unknown fallback
      mappingMethod = "unknown";
      uncertaintyState = "unknown";
      targetedMisconception = "none";
    }

    // Attach slot source requirements if present
    if (blueprintSlot?.sourceRequirements?.sourceMtdId) {
      supportingSourceIds.push(blueprintSlot.sourceRequirements.sourceMtdId);
    }

    records.push({
      optionIndex: index,
      stableOptionId: opt.id,
      targetedMisconception,
      misconceptionKoId,
      supportingSourceIds: Array.from(new Set(supportingSourceIds)),
      mappingMethod,
      score,
      methodVersion,
      uncertaintyState,
    });
  });

  return records;
}
