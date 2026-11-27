import { count, eq, getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** Relationship names come from the schema, never request data. */
export async function relatedRows(target: PgTable, id: string, source: Pick<typeof db, "select"> = db) {
  const counts: Record<string, number> = {};
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable) || (target === schema.courses && table === schema.mataKuliah) ||
      (target === schema.chapters && table === schema.bab)) continue;
    for (const fk of getTableConfig(table).foreignKeys) {
      const ref = fk.reference();
      if (ref.foreignTable !== target) continue;
      const [result] = await source.select({ count: count() }).from(table).where(eq(ref.columns[0], id));
      if (result.count) counts[`${getTableName(table)}.${ref.columns[0].name}`] = result.count;
    }
  }
  return counts;
}
