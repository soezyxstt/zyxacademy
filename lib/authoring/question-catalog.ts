export const IDEA_KNOWLEDGE_KINDS = [
  "definition",
  "principle",
  "formula",
  "procedure",
  "example",
  "constraint",
  "misconception",
  "other",
] as const;

export const IDEA_INSTRUCTIONAL_ROLES = [
  "core",
  "prerequisite",
  "enrichment",
  "assessment_support",
  "reference",
] as const;

export const IDEA_DIFFICULTY_LEVELS = ["introductory", "intermediate", "advanced", "unspecified"] as const;

export type IdeaKnowledgeKind = (typeof IDEA_KNOWLEDGE_KINDS)[number];
export type IdeaInstructionalRole = (typeof IDEA_INSTRUCTIONAL_ROLES)[number];
export type IdeaDifficultyLevel = (typeof IDEA_DIFFICULTY_LEVELS)[number];

export type CatalogIdeaRecord = {
  id: string;
  code: string;
  statement: string;
  explanation: string;
  latex: string | null;
  knowledgeKind: IdeaKnowledgeKind;
  instructionalRole: IdeaInstructionalRole;
  difficultyLevel: IdeaDifficultyLevel;
  version: number;
  semanticHash: string;
};

export function normalizeIdeaKnowledgeKind(value: unknown): IdeaKnowledgeKind {
  return typeof value === "string" && (IDEA_KNOWLEDGE_KINDS as readonly string[]).includes(value)
    ? (value as IdeaKnowledgeKind)
    : "other";
}

export function normalizeIdeaInstructionalRole(value: unknown): IdeaInstructionalRole {
  return typeof value === "string" && (IDEA_INSTRUCTIONAL_ROLES as readonly string[]).includes(value)
    ? (value as IdeaInstructionalRole)
    : "core";
}

export function normalizeIdeaDifficultyLevel(value: unknown): IdeaDifficultyLevel {
  return typeof value === "string" && (IDEA_DIFFICULTY_LEVELS as readonly string[]).includes(value)
    ? (value as IdeaDifficultyLevel)
    : "unspecified";
}

export type IdeaCatalogFilters = {
  query?: string;
  knowledgeKinds?: readonly string[];
  instructionalRoles?: readonly string[];
  difficultyLevels?: readonly string[];
};

function matchesText(record: CatalogIdeaRecord, query: string): boolean {
  const haystack = `${record.code}\n${record.statement}\n${record.explanation}\n${record.latex ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function matchesIdeaFilters(record: CatalogIdeaRecord, filters: IdeaCatalogFilters): boolean {
  if (filters.query && !matchesText(record, filters.query)) return false;
  if (filters.knowledgeKinds && filters.knowledgeKinds.length > 0 && !filters.knowledgeKinds.includes(record.knowledgeKind)) return false;
  if (filters.instructionalRoles && filters.instructionalRoles.length > 0 && !filters.instructionalRoles.includes(record.instructionalRole)) return false;
  if (filters.difficultyLevels && filters.difficultyLevels.length > 0 && !filters.difficultyLevels.includes(record.difficultyLevel)) return false;
  return true;
}

export function filterIdeaRecords(records: readonly CatalogIdeaRecord[], filters: IdeaCatalogFilters): CatalogIdeaRecord[] {
  return records.filter((record) => matchesIdeaFilters(record, filters));
}

export type IdeaFacets = {
  knowledgeKind: Record<string, number>;
  instructionalRole: Record<string, number>;
  difficultyLevel: Record<string, number>;
};

export function computeIdeaFacets(records: readonly CatalogIdeaRecord[]): IdeaFacets {
  const facets: IdeaFacets = { knowledgeKind: {}, instructionalRole: {}, difficultyLevel: {} };
  for (const record of records) {
    facets.knowledgeKind[record.knowledgeKind] = (facets.knowledgeKind[record.knowledgeKind] ?? 0) + 1;
    facets.instructionalRole[record.instructionalRole] = (facets.instructionalRole[record.instructionalRole] ?? 0) + 1;
    facets.difficultyLevel[record.difficultyLevel] = (facets.difficultyLevel[record.difficultyLevel] ?? 0) + 1;
  }
  return facets;
}

export type IdeaCatalogPage = {
  items: CatalogIdeaRecord[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

export function paginateIdeaRecords(records: readonly CatalogIdeaRecord[], limit: number, offset: number): IdeaCatalogPage {
  const total = records.length;
  const items = records.slice(offset, offset + limit);
  const nextOffset = offset + limit < total ? offset + limit : null;
  return { items, total, limit, offset, nextOffset };
}
