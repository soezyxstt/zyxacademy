import { and, gte, lte, type SQLWrapper } from "drizzle-orm";

/** Compare inclusive bounds using native PostgreSQL timestamps. */
export function timestampRange(column: SQLWrapper, from?: string, to?: string) {
  return and(from ? gte(column, new Date(from)) : undefined, to ? lte(column, new Date(to)) : undefined);
}
