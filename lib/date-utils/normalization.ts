/** Normalize stored epoch seconds, epoch milliseconds, ISO text, and Date instances. */
export function normalizeDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    if (!isNaN(value.getTime()) && value.getFullYear() > 10000) {
      return new Date(value.getTime() / 1000);
    }
    return value;
  }
  if (typeof value === "number" && value >= 100_000_000 && value < 100_000_000_000) {
    return new Date(value * 1000);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) return date;
  if (date.getFullYear() > 10000) {
    return new Date(date.getTime() / 1000);
  }
  return typeof value === "number" && date.getFullYear() > 3000 ? new Date(date.getTime() / 1000) : date;
}
