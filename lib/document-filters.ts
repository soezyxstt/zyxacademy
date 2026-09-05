import { getSubcategoryLabel } from "@/lib/course-materials";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

export type DocumentFilterState = {
  categories: Set<string>;
  subcategories: Set<string>;
  chapters: Set<string>;
  years: Set<string>;
};

function materialChapterIds(material: CourseMaterial): string[] {
  if (Array.isArray(material.chapterIds)) return material.chapterIds;
  return material.chapterId ? [material.chapterId] : [];
}

export function materialMatchesDocumentFilters(material: CourseMaterial, filters: DocumentFilterState, searchQuery: string): boolean {
  if (filters.categories.size > 0 && !filters.categories.has(material.docCategory ?? "materi")) return false;
  if (filters.subcategories.size > 0 && (!material.subcategory || !filters.subcategories.has(material.subcategory))) return false;
  if (filters.years.size > 0 && !filters.years.has(String(material.year ?? ""))) return false;
  if (filters.chapters.size > 0 && !materialChapterIds(material).some((id) => filters.chapters.has(id))) return false;
  const query = searchQuery.trim().toLocaleLowerCase("id");
  if (!query) return true;
  const subcategory = getSubcategoryLabel(material.subcategory)?.toLocaleLowerCase("id") ?? "";
  return material.title.toLocaleLowerCase("id").includes(query) || subcategory.includes(query) || String(material.year ?? "").includes(query);
}
