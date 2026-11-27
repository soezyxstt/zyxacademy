import type { MaterialListData, MaterialRow, MaterialTab } from "../../../../../packages/native-parity/student/courses/contract";

export function documentGroups({ chapters, materials }: MaterialListData, tab: MaterialTab) {
  const groups = chapters.map((chapter, index) => ({
    id: chapter.id, title: chapter.title, number: chapter.orderIndex ?? index + 1, rows: [] as MaterialRow[],
  }));
  const aliases = new Map(chapters.flatMap((chapter, index) => [...new Set([chapter.id, ...chapter.aliases])]
    .map(alias => [alias, groups[index]] as const)));
  const ungrouped: MaterialRow[] = [];
  for (const row of materials) {
    if (tab !== "all" && row.group !== tab) continue;
    const assigned = new Set(row.chapterIds.flatMap(alias => aliases.get(alias) ?? []));
    if (!assigned.size) ungrouped.push(row);
    for (const group of assigned) group.rows.push(row);
  }
  return {
    chapters: groups.filter((group) => group.rows.length),
    ungrouped,
  };
}

export function expandedDocumentGroup(value: string | null | undefined, groups: readonly { id: string }[], others: boolean) {
  if (value === null) return null;
  if (value === "__other__" && others || groups.some(group => group.id === value)) return value;
  return groups[0]?.id ?? (others ? "__other__" : null);
}

export function shortDocumentTitle(title: string, courseTitle: string) {
  let trimmed = title.trim();
  if (courseTitle && trimmed.toLowerCase().startsWith(courseTitle.toLowerCase())) {
    trimmed = trimmed.slice(courseTitle.length).replace(/^[\s:,-]+/, "");
  }
  return trimmed.replace(/^Bab\s+\d+[:\s,-]+/i, "").trim() || title;
}
