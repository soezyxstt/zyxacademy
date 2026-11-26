export type NotificationRelativeCopy = (unit: "justNow" | "minutes" | "hours" | "days", count: number) => string;

export function formatNotificationTime(
  value: string,
  locale: "id" | "en",
  relative: NotificationRelativeCopy,
  now = Date.now(),
) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return relative("justNow", 0);
  if (minutes < 60) return relative("minutes", minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative("hours", hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return relative("days", days);
  return date.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short" });
}
