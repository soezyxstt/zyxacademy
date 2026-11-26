export function publicMeetingPath(slug: unknown) {
  if (typeof slug !== "string" || !slug || slug === "." || slug === ".." ||
    /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(slug)) return null;
  return "/meet/" + encodeURIComponent(slug);
}

export function publicMeetingUrl(raw: unknown) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.origin === "https://meet.google.com" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
