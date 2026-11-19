type IdeaLabel = {
  id: string;
  statement: string;
  conceptDisplayName: string | null;
  fallbackName: string | null;
  conceptSlug: string | null;
};

export function indexMasteryTopics<T extends IdeaLabel>(rows: T[]) {
  const labelCounts = new Map<string, number>();
  for (const row of rows) {
    const label = row.conceptDisplayName || row.fallbackName;
    if (label) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return new Map(rows.map(row => {
    const label = row.conceptDisplayName || row.fallbackName;
    // Each score belongs to a published Idea. Shared concept labels need the specific statement.
    const conceptName = label && labelCounts.get(label) === 1 ? label : row.statement;
    return [row.id, { ...row, conceptName, conceptSlug: label ? row.conceptSlug : null }] as const;
  }));
}
