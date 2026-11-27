export function publicMeetingPath(slug: unknown) {
  if (typeof slug !== "string" || !slug || slug === "." || slug === ".." ||
    /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(slug)) return null;
  return "/meet/" + encodeURIComponent(slug);
}

export function publicMeetingUrl(raw: unknown) {
  if (typeof raw !== "string" || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.origin !== "https://meet.google.com" || url.username || url.password) return null;
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase() === "authuser") url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}
