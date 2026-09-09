import { z } from "zod";
import type {
  FormativeCheckOption,
  FormativeTextNormalization,
} from "./pedagogy-contract";

export const formativeLearnerResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    optionId: z.string().trim().min(1),
  }).strict(),
  z.object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(2000),
  }).strict(),
  z.object({
    kind: z.literal("numeric"),
    value: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({
    kind: z.literal("conceptual"),
    text: z.string().trim().min(1).max(6000),
  }).strict(),
]);

export type FormativeLearnerResponse = z.infer<typeof formativeLearnerResponseSchema>;
export type FormativeEvaluationVerdict = "correct" | "partial" | "incorrect" | "ungradable";

export interface FormativeEvaluationResult {
  verdict: FormativeEvaluationVerdict;
  feedback: string;
}

export interface TextExactEvaluationConfig {
  acceptableAnswers: readonly string[];
  normalization: FormativeTextNormalization;
}

export interface NumericEvaluationConfig {
  target: number;
  absoluteTolerance: number;
  unit?: string;
}

const NUMERIC_INPUT_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

export function normalizeFormativeText(value: string, normalization: FormativeTextNormalization): string {
  const folded = value.trim().toLocaleLowerCase("id-ID");
  return normalization === "trim_casefold_collapse_whitespace"
    ? folded.replace(/\s+/g, " ")
    : folded;
}

export function evaluateChoiceResponse(
  response: FormativeLearnerResponse,
  options: readonly FormativeCheckOption[],
): FormativeEvaluationResult {
  if (response.kind !== "choice") return { verdict: "ungradable", feedback: "Respons belum sesuai dengan jenis cek ini." };

  const selected = options.find((option) => option.id === response.optionId);
  const correctOptions = options.filter((option) => option.isCorrect);
  if (!selected || correctOptions.length !== 1) {
    return { verdict: "ungradable", feedback: "Respons belum dapat dinilai." };
  }

  return selected.isCorrect
    ? { verdict: "correct", feedback: "Pilihanmu benar." }
    : { verdict: "incorrect", feedback: "Pilihanmu belum tepat. Periksa kembali konsep yang sedang diuji." };
}

export function evaluateTextExactResponse(
  response: FormativeLearnerResponse,
  config: TextExactEvaluationConfig,
): FormativeEvaluationResult {
  if (response.kind !== "text") return { verdict: "ungradable", feedback: "Respons belum sesuai dengan jenis cek ini." };
  const normalizedResponse = normalizeFormativeText(response.text, config.normalization);
  if (!normalizedResponse) return { verdict: "ungradable", feedback: "Respons belum dapat dinilai." };

  const matched = config.acceptableAnswers.some(
    (answer) => normalizeFormativeText(answer, config.normalization) === normalizedResponse,
  );
  return matched
    ? { verdict: "correct", feedback: "Jawabanmu benar." }
    : { verdict: "incorrect", feedback: "Jawabanmu belum tepat. Periksa kembali istilah atau langkah utamanya." };
}

export function evaluateNumericResponse(
  response: FormativeLearnerResponse,
  config: NumericEvaluationConfig,
): FormativeEvaluationResult {
  if (response.kind !== "numeric") return { verdict: "ungradable", feedback: "Respons belum sesuai dengan jenis cek ini." };
  const value = response.value.trim();
  if (!NUMERIC_INPUT_PATTERN.test(value)) {
    return { verdict: "ungradable", feedback: "Masukkan satu nilai angka yang valid." };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || !Number.isFinite(config.target) || !Number.isFinite(config.absoluteTolerance) || config.absoluteTolerance < 0) {
    return { verdict: "ungradable", feedback: "Respons belum dapat dinilai." };
  }

  const withinTolerance = Math.abs(numericValue - config.target) <= config.absoluteTolerance;
  return withinTolerance
    ? { verdict: "correct", feedback: config.unit ? `Nilai benar dalam satuan ${config.unit}.` : "Nilai jawabanmu benar." }
    : { verdict: "incorrect", feedback: "Nilai jawabanmu belum tepat. Periksa kembali perhitungan dan satuannya." };
}
