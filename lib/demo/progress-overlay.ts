import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoOverlay } from "@/lib/demo/session-overlay";

/** Combine distinct session actions with a synthetic, immutable course baseline. */
export function demoProgress(snapshot: PublicDemoSnapshot, overlay: DemoOverlay) {
  const articles = overlay.events.filter((event) => event.kind === "article").length;
  const reviews = overlay.events.filter((event) => event.kind === "review").length;
  const history = new Map(snapshot.history.map((day) => [day.date, { ...day }]));
  for (const event of overlay.events) {
    const day = history.get(event.date) ?? { date: event.date, materialsCompleted: 0, flashcardsReviewed: 0, quizzesCompleted: 0 };
    if (event.kind === "article") day.materialsCompleted++;
    if (event.kind === "review") day.flashcardsReviewed++;
    if (event.kind === "quiz") day.quizzesCompleted++;
    history.set(event.date, day);
  }
  return {
    completedMaterials: Math.min(snapshot.course.totalMaterials, snapshot.course.completedMaterials + articles),
    dueCount: Math.max(0, snapshot.flashcards.dueCount - reviews),
    history: [...history.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
