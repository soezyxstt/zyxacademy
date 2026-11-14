export function formAttachmentUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const rawParts = value.split(/[?#]/, 1)[0].split("/").map(decodeURIComponent);
    if (rawParts.some((part) => part === "." || part === ".." || /[\\/]/.test(part))) return null;
    const url = new URL(value, "https://storage.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const prefix = "/api/storage/file/";
    if (!/^https?:\/\//i.test(value) && !value.startsWith(prefix)) return null;
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname.slice(1);
    const parts = path.split("/").map(decodeURIComponent);
    if (parts[0] !== "forms" || parts.length < 3 || parts.some((part) => !part || part === "." || part === ".." || /[\\/]/.test(part))) return null;
    return value;
  } catch {
    return null;
  }
}
