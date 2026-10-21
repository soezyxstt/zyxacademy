import { z } from "zod";
import { articlePartSchema, type ArticlePart, materializeArticleParts, flattenArticleParts, collectArticlePartIds } from "./article-parts";
import { inspectPayloadSecurity, type VisualSpec } from "./visual-contract";
import { buildDiktatVisualSnapshot } from "./diktat-static-visual";

const text = z.string().trim().min(1);
const printablePartSchema = z.union([
  articlePartSchema.options[0],
  articlePartSchema.options[1],
  articlePartSchema.options[3],
  z.object({ id: text, kind: z.literal("visual_ref"), visualId: text, staticMarkdown: text,
    staticSnapshot: z.object({ rendererVersion: text, visualHash: text, stateHash: text }).strict().optional(),
  }).strict(),
]);
export const authoredDiktatUnitsSchema = z.array(z.object({
  id: text,
  sourceElementRefs: z.array(text).min(1),
  ideaIds: z.array(text).min(1),
  parts: z.array(printablePartSchema).min(1),
}).strict()).min(1).max(100).superRefine((units, ctx) => {
  const ids = units.flatMap((unit) => [unit.id, ...collectArticlePartIds(unit.parts)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "DIKTAT_UNIT_ID_DUPLICATE" });
  if (!inspectPayloadSecurity(units).safe || /https?:|data:image|<script|<iframe/i.test(JSON.stringify(units))) {
    ctx.addIssue({ code: "custom", message: "DIKTAT_UNIT_UNSAFE" });
  }
});
export type AuthoredDiktatUnits = z.infer<typeof authoredDiktatUnitsSchema>;

export function prepareAuthoredDiktatVisuals(units: AuthoredDiktatUnits, visuals: readonly VisualSpec[]): AuthoredDiktatUnits {
  return authoredDiktatUnitsSchema.parse(units).map((unit) => ({ ...unit, parts: unit.parts.map((part) => {
    if (part.kind !== "visual_ref") return part;
    const visual = visuals.find((visual) => visual.id === part.visualId);
    if (!visual) throw new Error("DIKTAT_VISUAL_SOURCE_MISSING");
    const staticSnapshot = buildDiktatVisualSnapshot(visual);
    if (part.staticSnapshot && JSON.stringify(part.staticSnapshot) !== JSON.stringify(staticSnapshot)) throw new Error("DIKTAT_VISUAL_SNAPSHOT_STALE");
    return { ...part, staticSnapshot };
  }) }));
}

interface SourceArticle {
  id: string;
  version: number;
  generationHash: string;
  sections: readonly { blocks: readonly { parts?: readonly ArticlePart[] }[] }[];
  ideaLinks: readonly { id: string }[];
  visuals?: readonly VisualSpec[];
}
interface AuthoredDiktat {
  sourceArticleId: string;
  sourceArticleVersion: number;
  sourceArticleHash: string;
  units?: AuthoredDiktatUnits;
}

/** Checks lineage and structural coverage; semantic preservation still needs review. */
export function validateAuthoredDiktat(article: SourceArticle, diktat: AuthoredDiktat): string[] {
  const errors: string[] = [];
  if (diktat.sourceArticleId !== article.id || diktat.sourceArticleVersion !== article.version || diktat.sourceArticleHash !== article.generationHash) errors.push("DIKTAT_LINEAGE_MISMATCH");
  const parsed = authoredDiktatUnitsSchema.safeParse(diktat.units);
  if (!parsed.success) return [...errors, "DIKTAT_UNITS_INVALID"];
  const parts = flattenArticleParts(article.sections.flatMap((section) => section.blocks.flatMap((block) => block.parts ?? [])));
  const source = new Map(parts.map((part) => [part.id, part]));
  if (source.size !== parts.length) errors.push("DIKTAT_SOURCE_PART_ID_DUPLICATE");
  for (const part of parts) {
    if (part.kind === "math_unit") part.relations?.forEach((relation) => source.set(relation.id, part));
    if (part.kind === "worked_example") part.steps.forEach((step) => source.set(step.id, part));
  }
  const covered = new Set(parsed.data.flatMap((unit) => unit.sourceElementRefs));
  for (const part of parts) {
    if (part.kind === "worked_example") for (const step of part.steps) {
      if (covered.has(part.id) || covered.has(step.id)) flattenArticleParts(step.parts).forEach((child) => covered.add(child.id));
    }
  }
  const ideas = new Set(parsed.data.flatMap((unit) => unit.ideaIds));
  const sourceIdeas = new Set(article.ideaLinks.map((link) => link.id));
  if ([...covered].some((id) => !source.has(id))) errors.push("DIKTAT_SOURCE_ELEMENT_MISSING");
  if ([...sourceIdeas].some((id) => !ideas.has(id)) || [...ideas].some((id) => !sourceIdeas.has(id))) errors.push("DIKTAT_IDEA_COVERAGE_INVALID");
  if (parts.some((part) => part.kind === "math_unit" && !covered.has(part.id) && !part.relations?.every((relation) => covered.has(relation.id)))) errors.push("DIKTAT_FORMULA_COVERAGE_MISSING");
  for (const unit of parsed.data) {
    const refs = flattenArticleParts(unit.sourceElementRefs.flatMap((id) => source.get(id) ? [source.get(id)!] : []));
    const summaryParts = flattenArticleParts(unit.parts);
    const available = new Set(source.keys());
    for (const part of unit.parts) {
      if (part.kind === "worked_example") for (const step of part.steps) {
        if (step.sourceElementRefs.some((id) => !available.has(id))) errors.push("DIKTAT_STEP_SOURCE_REF_MISSING");
        available.add(step.id);
        collectArticlePartIds(step.parts).forEach((id) => available.add(id));
      }
      available.add(part.id);
    }
    if (refs.some((part) => part?.kind === "math_unit") && !summaryParts.some((part) => part.kind === "math_unit")) errors.push("DIKTAT_FORMULA_SUMMARY_MISSING");
    if (refs.some((part) => part?.kind === "math_unit" && (part.conditionsMarkdown || part.relations?.some((relation) => relation.conditionsMarkdown))) && !summaryParts.some((part) => part.kind === "math_unit" && (part.conditionsMarkdown || part.relations?.some((relation) => relation.conditionsMarkdown)))) errors.push("DIKTAT_CONDITIONS_MISSING");
    for (const part of summaryParts) {
      if (part.kind === "visual_ref" && !refs.some((ref) => ref?.kind === "visual_ref" && ref.visualId === part.visualId)) errors.push("DIKTAT_VISUAL_LINEAGE_MISSING");
      if (part.kind === "visual_ref") {
        const visual = article.visuals?.find((visual) => visual.id === part.visualId);
        if (!visual) errors.push("DIKTAT_VISUAL_SOURCE_MISSING");
        else if ("staticSnapshot" in part && part.staticSnapshot && JSON.stringify(part.staticSnapshot) !== JSON.stringify(buildDiktatVisualSnapshot(visual))) errors.push("DIKTAT_VISUAL_SNAPSHOT_STALE");
      }
    }
  }
  return [...new Set(errors)];
}

export function materializeAuthoredDiktat(units: AuthoredDiktatUnits): string {
  return authoredDiktatUnitsSchema.parse(units).map((unit) => unit.parts.map((part) => part.kind === "visual_ref" ? part.staticMarkdown : materializeArticleParts([part])).join("\n\n")).join("\n\n");
}
