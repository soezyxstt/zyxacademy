import type { DemoExperience, DemoFlashcard, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";
type Load = (courseId: string, selection: DemoProductSelection) => Promise<DemoExperience | null>;
type Product = { id: string; title: string; collectionOffset: number };
export type DemoProductCollections = { articles: Product[]; diktats: Product[]; flashcardSets: Product[] };
function sameScope(initial: DemoExperience, next: DemoExperience) {
 return initial.content.course.id === initial.snapshot.courseId && next.snapshot.courseId === initial.snapshot.courseId && next.content.course.id === initial.content.course.id && next.snapshot.revision === initial.snapshot.revision && next.snapshot.contentPolicy === "free-first-chapter";
}
export async function collectDemoProducts(initial: DemoExperience, load: Load): Promise<DemoProductCollections | null> {
 const result: DemoProductCollections = { articles: [], diktats: [], flashcardSets: [] };
 const ids = { articles: new Set<string>(), diktats: new Set<string>(), flashcardSets: new Set<string>() };
 let offset = 0;
 // shortcut: fail closed above 10000 metadata rows per collection, add a student list cursor if the catalogue grows beyond this bound.
 for (let page = 0; page < 20; page++) {
   const next = offset === initial.content.collections.page.offset ? initial : await load(initial.snapshot.courseId, { collectionOffset: offset });
   if (!next || !sameScope(initial, next) || next.content.collections.page.offset !== offset || next.content.collections.page.pageSize !== 500) return null;
   for (const key of ["articles", "diktats", "flashcardSets"] as const) {
     if (next.content.collections[key].length > 500) return null;
     for (const item of next.content.collections[key]) {
       if (ids[key].has(item.id)) return null;
       ids[key].add(item.id); result[key].push({ ...item, collectionOffset: offset });
     }
   }
   if (!next.content.collections.page.hasMore) return next.content.collections.page.nextOffset === null ? result : null;
   if (next.content.collections.page.nextOffset !== offset + 500) return null;
   offset += 500;
 }
 return null;
}
export async function collectDemoFlashcards(initial: DemoExperience, products: DemoProductCollections, load: Load): Promise<DemoFlashcard[] | null> {
 const cards: DemoFlashcard[] = [];
 for (const set of products.flashcardSets) {
   for (let offset = 0; offset < 10000; offset += 100) {
     const next = await load(initial.snapshot.courseId, { collectionOffset: set.collectionOffset, flashcardSetId: set.id, flashcardOffset: offset });
     if (!next || !sameScope(initial, next) || next.content.selected.flashcardSetId !== set.id || next.content.collections.flashcards.pageSize !== 100 || next.content.collections.flashcards.offset !== offset || next.content.flashcards.length > 100) return null;
     cards.push(...next.content.flashcards);
     if (cards.length > 10000) return null;
     const cursor = next.content.collections.flashcards.nextOffset;
     if (cursor === null) break;
     if (cursor !== offset + 100 || next.content.flashcards.length !== 100 || offset === 9900) return null;
   }
 }
 return cards;
}
