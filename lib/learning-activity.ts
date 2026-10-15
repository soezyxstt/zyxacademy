import { parseVersionedVectorId } from "@/lib/vectorize/contracts";

export function learningActivityReferenceCandidates(value: string): string[] {
  const candidates = [value];
  let reference = value;
  if (value.startsWith("v2:")) {
    try {
      reference = parseVersionedVectorId(value).entityId;
      candidates.push(reference);
    } catch {
      return candidates;
    }
  }
  while (/^(?:article|material|text-product)-/.test(reference)) {
    reference = reference.replace(/^(?:article|material|text-product)-/, "");
    candidates.push(reference);
  }
  return candidates;
}

export function learningActivityDescription(value: string | null, titles: ReadonlyMap<string, string>): string {
  if (!value) return "";
  for (const reference of learningActivityReferenceCandidates(value)) {
    const title = titles.get(reference);
    if (title) return title;
  }
  if (/^selection-\d+$/.test(value)) return "Bagian materi yang dipilih";
  if (/^v2:/.test(value) || /^(?:article|material|text-product|quiz-review|ko|idea)-\S+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
    return "Materi belajar";
  }
  return value;
}
