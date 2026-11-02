export function hasDatabaseErrorCode(error: unknown, codes: readonly string[]): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const { code, cause } = error as { code?: string; cause?: unknown };
    if (code && codes.includes(code)) return true;
    error = cause;
  }
  return false;
}
