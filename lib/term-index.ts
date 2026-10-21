/**
 * EIF E3: term index for the interactive material layer.
 *
 * Maps normalized concept terms (display names + aliases) to their concept, so
 * the material reader can match a selected term to a concept and open the
 * KO-backed popover. Pure DB read, no AI. Built at material publish time.
 */
import { cache } from "react";
import { db } from "@/db";
import { knowledgeObjects, conceptLocalizations } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeTerm, type TermIndexEntry } from "./term-match";

export type { TermIndexEntry } from "./term-match";
export { normalizeTerm, matchTerm } from "./term-match";

/** Builds a course-wide term index (all active concepts in the course), deduplicated per-request via React cache. */
export const buildCourseTermIndex = cache(async (courseId: string): Promise<TermIndexEntry[]> => {
  if (!courseId || typeof courseId !== "string" || !courseId.trim()) return [];
  const normalizedCourseId = courseId.trim();

  const kos = await db
    .select({ conceptId: knowledgeObjects.conceptId, conceptName: knowledgeObjects.conceptName })
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.courseId, normalizedCourseId), eq(knowledgeObjects.status, "active")));

  if (kos.length === 0) return [];

  const conceptName = new Map<string, string>();
  for (const ko of kos) {
    if (!conceptName.has(ko.conceptId)) conceptName.set(ko.conceptId, ko.conceptName.trim());
  }
  const conceptIds = [...conceptName.keys()];

  const locs = await db
    .select({ conceptId: conceptLocalizations.conceptId, displayName: conceptLocalizations.displayName, aliases: conceptLocalizations.aliases })
    .from(conceptLocalizations)
    .where(inArray(conceptLocalizations.conceptId, conceptIds));

  const byTerm = new Map<string, TermIndexEntry>();
  const add = (rawTerm: string, conceptId: string) => {
    const term = normalizeTerm(rawTerm);
    if (term.length < 2 || byTerm.has(term)) return;
    byTerm.set(term, { term, conceptId, conceptName: conceptName.get(conceptId) ?? rawTerm });
  };
  for (const [conceptId, name] of conceptName) add(name, conceptId);
  for (const loc of locs) {
    add(loc.displayName, loc.conceptId);
    for (const a of ((loc.aliases as string[] | null) ?? [])) add(a, loc.conceptId);
  }
  return [...byTerm.values()].sort((a, b) => b.term.length - a.term.length);
});

/**
 * Builds a normalized, deduped term index for a chapter's concepts. Longest
 * terms come first so a longest-match wins at lookup time.
 * Deduplicated per-request via React cache.
 */
export const buildTermIndex = cache(async (chapterId: string): Promise<TermIndexEntry[]> => {
  if (!chapterId || typeof chapterId !== "string" || !chapterId.trim()) return [];
  const normalizedChapterId = chapterId.trim();

  const kos = await db
    .select({ conceptId: knowledgeObjects.conceptId, conceptName: knowledgeObjects.conceptName })
    .from(knowledgeObjects)
    .where(and(eq(knowledgeObjects.chapterId, normalizedChapterId), eq(knowledgeObjects.status, "active")));

  if (kos.length === 0) return [];

  // conceptId -> canonical display name (first KO conceptName wins)
  const conceptName = new Map<string, string>();
  for (const ko of kos) {
    if (!conceptName.has(ko.conceptId)) conceptName.set(ko.conceptId, ko.conceptName.trim());
  }
  const conceptIds = [...conceptName.keys()];

  const locs = await db
    .select({ conceptId: conceptLocalizations.conceptId, displayName: conceptLocalizations.displayName, aliases: conceptLocalizations.aliases })
    .from(conceptLocalizations)
    .where(inArray(conceptLocalizations.conceptId, conceptIds));

  const byTerm = new Map<string, TermIndexEntry>();
  const add = (rawTerm: string, conceptId: string) => {
    const term = normalizeTerm(rawTerm);
    if (term.length < 2) return;
    if (byTerm.has(term)) return; // first wins
    byTerm.set(term, { term, conceptId, conceptName: conceptName.get(conceptId) ?? rawTerm });
  };

  // Canonical concept names first.
  for (const [conceptId, name] of conceptName) add(name, conceptId);
  // Then localized display names + aliases.
  for (const loc of locs) {
    add(loc.displayName, loc.conceptId);
    const aliases = (loc.aliases as string[] | null) ?? [];
    for (const a of aliases) add(a, loc.conceptId);
  }

  return [...byTerm.values()].sort((a, b) => b.term.length - a.term.length);
});
