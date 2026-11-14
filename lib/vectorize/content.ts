/** The canonical indexing and hydration boundary uses identical text bytes. */
export function canonicalVectorContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.trim() : "";
  } catch { return ""; }
}
