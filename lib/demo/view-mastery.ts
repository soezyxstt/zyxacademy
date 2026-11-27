import type { DemoMastery } from "./mastery";
import type { PublicDemoSnapshot } from "./snapshot";

export function demoMasteryGroups(mastery: DemoMastery | undefined, snapshot: PublicDemoSnapshot, chapterTitle: string): DemoMastery["groups"] {
  return mastery?.groups ?? [{
    chapter: { id: "fictional-first-chapter", title: chapterTitle, orderIndex: 1 },
    concepts: snapshot.weakConcepts.map(concept => ({
      conceptName: concept.title,
      conceptSlug: null,
      masteryScore: concept.masteryPercent,
      confidence: 70,
      trend: "improving",
      blockedBy: [],
    })),
  }];
}

export function chooseMasteryFocus<Chapter, Topic extends { masteryScore: number | null; confidence: number | null }>(
  groups: ReadonlyArray<{ chapter: Chapter; concepts: Topic[] }>,
) {
  const measured = groups.flatMap(({ chapter, concepts }) => concepts.flatMap(topic => topic.masteryScore === null ? [] : [{
    chapter, topic, score: topic.masteryScore, reliable: (topic.confidence ?? 0) >= 50,
  }]));
  const reliable = measured.filter(topic => topic.reliable);
  const candidates = reliable.length ? reliable : measured;
  const review = candidates.filter(topic => topic.score < 70).sort((left, right) => left.score - right.score)[0];
  return {
    review,
    focus: review ?? candidates.sort((left, right) => right.score - left.score)[0],
  };
}
