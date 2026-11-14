export type DemoMasteryRow = {
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  conceptName: string;
};

export type DemoMastery = {
  groups: Array<{ chapter: { id: string; title: string; orderIndex: number }; concepts: Array<{ conceptName: string; conceptSlug: null; masteryScore: number; confidence: number; trend: "improving" | "stable"; blockedBy: string[] }> }>;
  graphNodes: Array<{ conceptName: string; mastery: number }>;
  graphEdges: Array<{ from: string; to: string }>;
};

/** Scores belong to the fictional demo learner and remain stable across requests. */
export function buildDemoMastery(rows: DemoMasteryRow[]): Record<string, DemoMastery> {
  const result: Record<string, DemoMastery> = {};
  for (const row of rows) {
    const name = row.conceptName.trim();
    if (!name) continue;
    const model = result[row.courseId] ??= { groups: [], graphNodes: [], graphEdges: [] };
    // shortcut: cap the graph at 80 topics, paginate if full-course graphs become necessary.
    if (model.groups.reduce((count, item) => count + item.concepts.length, 0) >= 80) continue;
    let group = model.groups.find(item => item.chapter.id === row.chapterId);
    if (!group) {
      group = { chapter: { id: row.chapterId, title: row.chapterTitle, orderIndex: row.chapterOrder }, concepts: [] };
      model.groups.push(group);
    }
    if (group.concepts.length >= 12 || group.concepts.some(item => item.conceptName.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
    let hash = 0;
    for (const char of `${row.courseId}:${name}`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    const masteryScore = 35 + hash % 53;
    group.concepts.push({ conceptName: name, conceptSlug: null, masteryScore, confidence: 55 + hash % 35, trend: hash % 3 === 0 ? "stable" : "improving", blockedBy: [] });
    if (!model.graphNodes.some(node => node.conceptName === name)) model.graphNodes.push({ conceptName: name, mastery: masteryScore });
  }
  return result;
}
