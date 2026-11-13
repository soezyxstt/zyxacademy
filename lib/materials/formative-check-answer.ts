import type { FormativeCheckPayload } from "@/lib/materials/pedagogy-contract";

export function formativeAnswerForReveal(formativeCheck: FormativeCheckPayload): string {
  if (formativeCheck.checkKind !== "multiple_choice") return formativeCheck.answer;
  const index = formativeCheck.options?.findIndex((option) => option.isCorrect) ?? -1;
  const option = index >= 0 ? formativeCheck.options?.[index] : undefined;
  if (!option) return formativeCheck.answer;
  const label = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
  return `${label}.\n\n${option.text}`;
}
