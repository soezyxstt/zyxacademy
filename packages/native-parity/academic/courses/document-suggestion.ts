import { isValidSubcategory, LEVEL1_CATEGORIES, type CourseMaterialSubcategory, type MaterialLevel1Category } from "../../../../lib/course-materials";

export type DocumentSource = "pdf" | "canonical-article" | "canonical-diktat" | "legacy-article";
export type MetadataValues = {
  title: string;
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
  year: number | null;
};
export type MetadataSuggestion = MetadataValues & { chapterIds: string[] };

export function isMetadataValues(value: unknown): value is MetadataValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.title === "string" && Boolean(row.title.trim()) && row.title.length <= 500 &&
    typeof row.category === "string" && LEVEL1_CATEGORIES.some(option => option.value === row.category) &&
    (row.subcategory === null || (typeof row.subcategory === "string" && Boolean(row.subcategory) && isValidSubcategory(row.category, row.subcategory))) &&
    (row.year === null || (typeof row.year === "number" && Number.isInteger(row.year) && row.year >= 1900 && row.year <= 2100));
}

export function isMetadataSuggestion(value: unknown): value is MetadataSuggestion {
  if (!isMetadataValues(value) || !("chapterIds" in value) || !Array.isArray(value.chapterIds)) return false;
  return value.chapterIds.every(id => typeof id === "string" && id.trim().length > 0 && id.length <= 256);
}

/** Only the leaf name is provider input. Discard signed query parameters, fragments and storage paths. */
export function materialFilename(reference: string, fallback: string) {
  try {
    const name = new URL(reference, "https://file.invalid").pathname.split("/").pop();
    if (!name) return fallback;
    return decodeURIComponent(name).split(/[/\\]/).pop()?.trim().slice(0, 500) || fallback;
  } catch {
    return fallback;
  }
}
