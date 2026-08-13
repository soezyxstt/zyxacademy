const MIGRATION_BOOKKEEPING_TABLES = new Set(["__drizzle_migrations", "migration_runs", "migration_checkpoints"]);

export function unexpectedChangedTables(_planNumber: string, changed: readonly string[]): string[] {
  return changed.filter((name) => !MIGRATION_BOOKKEEPING_TABLES.has(name));
}

export function unexpectedAddedTables(planNumber: string, added: readonly string[]): string[] {
  if (planNumber === "001") {
    const allowedPlan001Additions = new Set(["migration_runs", "migration_checkpoints"]);
    return added.filter((name) => !allowedPlan001Additions.has(name));
  }
  return [];
}
