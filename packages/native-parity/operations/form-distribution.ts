import type { FormQuestion, FormResponse } from "./management-contract";

type DistributionItem = { label: string; count: number; percent: number };
const choiceTypes = new Set(["RADIO", "DROP_DOWN", "SCALE", "RATING"]);

export function formResponseDistribution(question: FormQuestion, index: number, responses: readonly FormResponse[]) {
  const answers = responses.flatMap(response => {
    const value = response.answers[index] ?? response.answers[question.title];
    return value == null || value === "" ? [] : [{ response, value }];
  });

  if (!answers.length) return { kind: "empty", answered: 0 } as const;

  if (question.type === "GRID_RADIO" || question.type === "GRID_CHECKBOX") {
    const rows = (question.gridRows ?? []).map(label => {
      const cells = (question.gridColumns ?? []).map(column => {
        const count = answers.filter(({ value }) => {
          if (typeof value !== "object" || !Object.hasOwn(value, label)) return false;
          const selected = (value as Record<string, unknown>)[label];
          return Array.isArray(selected) ? selected.includes(column) : selected === column;
        }).length;
        return { label: column, count, percent: Math.round(100 * count / answers.length) };
      });
      return { label, cells };
    });
    return { kind: "grid", answered: answers.length, rows } as const;
  }

  const multiple = question.type === "CHECKBOX" || answers.some(({ value }) => Array.isArray(value));
  if (question.type !== "FILE_UPLOAD" && (multiple || choiceTypes.has(question.type))) {
    const counts = new Map<string, number>();
    for (const option of question.options ?? []) {
      if (option.trim()) counts.set(option.trim(), 0);
    }
    for (const { value } of answers) {
      for (const selection of Array.isArray(value) ? value : [value]) {
        const label = String(selection ?? "").trim();
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }

    const selections = Array.from(counts.values()).reduce((total, count) => total + count, 0);
    const denominator = multiple ? answers.length : selections;
    const items: DistributionItem[] = Array.from(counts, ([label, count]) => ({
      label, count, percent: denominator ? 100 * count / denominator : 0,
    }));
    return { kind: "choice", answered: answers.length, multiple, items } as const;
  }

  return { kind: "answers", answered: answers.length, responses: answers.map(({ response }) => response) } as const;
}

export function distributionValue(item: DistributionItem) {
  return `${item.count} (${Math.round(item.percent * 10) / 10}%)`;
}

export function distributionClipboardText(title: string, items: readonly DistributionItem[]) {
  return `${title}:\n${items.map(item => `- ${item.label}: ${distributionValue(item)}`).join("\n")}`;
}
