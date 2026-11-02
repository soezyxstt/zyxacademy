export function affectedRows(result: unknown): number {
  if (result && typeof result === "object") {
    const value = result as { rowCount?: unknown; rowsAffected?: unknown; affectedRows?: unknown };
    const count = value.rowCount ?? value.rowsAffected ?? value.affectedRows;
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) return count;
  }
  throw new Error("DATABASE_AFFECTED_ROW_COUNT_UNAVAILABLE");
}
