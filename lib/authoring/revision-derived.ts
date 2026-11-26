import { createHash } from "node:crypto";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { collectArticleVisualIds, flattenArticleParts, type ArticlePart } from "@/lib/materials/article-parts";

type Article = Extract<ProductEntity, { productType: "article" }>;
type Diktat = Extract<ProductEntity, { productType: "diktat" }>;
type Unit = NonNullable<Diktat["units"]>[number];
export type DerivedContentReview = { entityId: string; sourceArticleId: string; expectedArticleHash: string; unitIds: string[]; notes: string };
export type DerivedReviewRequirement = { entityId: string; sourceArticleId: string; sourceArticleHash: string; previousArticleHash: string | null; unitIds: string[] };
export type AppliedDerivedContentReview = DerivedContentReview & { previousArticleHash: string | null };
const same = (a: unknown, b: unknown) => serializeDeterministically(a) === serializeDeterministically(b);
const hash = (value: unknown) => createHash("sha256").update(serializeDeterministically(value)).digest("hex");

/** A referenced formula also depends on its explanations, conditions and local source context. */
function referencedContext(article: Article, unit: Unit): string | null {
  if (!unit.sourceElementRefs?.length) return null;
  const byId = new Map<string, { part: ArticlePart; block: Article["sections"][number]["blocks"][number]; section: Article["sections"][number] }>();
  for (const section of article.sections) for (const block of section.blocks) {
    for (const part of flattenArticleParts(block.parts ?? [])) {
      const value = { part, block, section };
      for (const id of [part.id, ...(part.kind === "math_unit" ? part.relations?.map(relation => relation.id) ?? [] : []), ...(part.kind === "worked_example" ? part.steps.map(step => step.id) : [])]) {
        if (byId.has(id)) return null;
        byId.set(id, value);
      }
    }
  }
  const selected = unit.sourceElementRefs.map(id => byId.get(id));
  if (selected.some(value => !value)) return null;
  const visualIds = new Set([...collectArticleVisualIds(unit.parts), ...selected.flatMap(value => collectArticleVisualIds(value!.block.parts ?? []))]);
  const visuals = [...visualIds].sort().map(id => article.visuals?.find(visual => visual.id === id));
  if (visuals.some(value => !value)) return null;
  const ideaIds = new Set([...unit.ideaIds, ...selected.flatMap(value => [...value!.block.ideaIds, ...value!.section.ideaIds])]);
  const ideaLinks = [...ideaIds].sort().map(id => article.ideaLinks.find(link => link.id === id));
  if (ideaLinks.some(value => !value)) return null;
  const sourceIds = new Set(selected.flatMap(value => [...value!.block.sourceRefs, ...value!.section.sourceRefs].map(ref => ref.sourceId)));
  const sourceRefs = [...sourceIds].sort().map(id => article.sourceRefs.find(ref => ref.sourceId === id));
  if (sourceRefs.some(value => !value) || new Set(article.ideaLinks.map(value => value.id)).size !== article.ideaLinks.length
    || new Set(article.sourceRefs.map(value => value.sourceId)).size !== article.sourceRefs.length
    || new Set(article.visuals?.map(value => value.id)).size !== (article.visuals?.length ?? 0)) return null;
  return hash({ courseId: article.courseId, chapterId: article.chapterId, ideaLinks, sourceRefs, visuals,
    sources: selected.map(value => {
      const { block, section } = value!;
      // Other sections and the document title cannot alter this unit's source.
      const { blocks: _blocks, orderIndex: _order, ...sectionContext } = section;
      return { block, section: sectionContext };
    }),
  });
}

export function assessDerivedContent(input: {
  previous?: Diktat; current: Diktat; previousArticle?: Article; article: Article;
  wasStale: boolean; priorRequirement?: DerivedReviewRequirement; review?: DerivedContentReview;
}) {
  const { previous, current, previousArticle, article, review } = input;
  const units = current.units ?? [];
  const oldUnits = new Map(previous?.units?.map(unit => [unit.id, unit]) ?? []);
  const trustedPrior = input.priorRequirement?.entityId === current.id
    && input.priorRequirement.sourceArticleId === current.sourceArticleId
    && input.priorRequirement.sourceArticleHash === previous?.sourceArticleHash;
  const previousArticleHash = trustedPrior ? input.priorRequirement!.previousArticleHash ?? null
    : input.wasStale ? null : previous?.sourceArticleHash ?? null;
  const pending = new Set(input.wasStale ? trustedPrior ? input.priorRequirement!.unitIds : [...oldUnits.keys()] : []);
  // Historical summaries without stable unit references retain conservative handling.
  if (!units.length) {
    if (review) throw new Error("REVISION_DERIVED_REVIEW_SOURCE_REQUIRED");
    return { pending: [], previousArticleHash, unresolved: (input.wasStale || !!previousArticle && previousArticle.generationHash !== article.generationHash) && previous?.contentMarkdown === current.contentMarkdown, reviewed: undefined };
  }
  for (const unit of units) {
    const before = oldUnits.get(unit.id);
    const changed = !before || !same(before, unit);
    if (previous && (previous.sourceArticleId !== article.id || previous.sourceArticleHash !== article.generationHash) && !changed) {
      const oldContext = previousArticle ? referencedContext(previousArticle, before!) : null;
      const newContext = referencedContext(article, unit);
      if (!oldContext || !newContext || oldContext !== newContext) pending.add(unit.id);
    }
    // Editing one unit only clears that unit's stale requirement.
    if (changed) pending.delete(unit.id);
  }
  for (const id of pending) if (!units.some(unit => unit.id === id)) pending.delete(id);
  let reviewed: AppliedDerivedContentReview | undefined;
  if (review) {
    if (review.entityId !== current.id || review.sourceArticleId !== article.id || review.expectedArticleHash !== article.generationHash) throw new Error("REVISION_DERIVED_REVIEW_STALE");
    if (!review.notes.trim() || review.notes.trim().length < 20 || review.notes.length > 2000 || !review.unitIds.length || new Set(review.unitIds).size !== review.unitIds.length) throw new Error("REVISION_DERIVED_REVIEW_INVALID");
    for (const id of review.unitIds) {
      const unit = units.find(value => value.id === id), before = oldUnits.get(id);
      if (!unit || !before) throw new Error("REVISION_DERIVED_REVIEW_UNIT_NOT_FOUND");
      if (!same(unit, before)) throw new Error("REVISION_DERIVED_REVIEW_CONTENT_CHANGED");
      if (!referencedContext(article, unit)) throw new Error("REVISION_DERIVED_REVIEW_SOURCE_REQUIRED");
      if (!pending.has(id)) throw new Error("REVISION_DERIVED_REVIEW_NOT_REQUIRED");
      pending.delete(id);
    }
    reviewed = { ...review, unitIds: [...review.unitIds], notes: review.notes.trim(), previousArticleHash };
  }
  return { pending: [...pending].sort(), previousArticleHash, unresolved: pending.size > 0, reviewed };
}
