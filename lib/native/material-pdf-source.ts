import { extractStorageKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";

export type MaterialPdfSource = { storageKey: string } | { hostedUrl: string };

export function nativeMaterialPdfSource(file: string | null, aliases: readonly string[], kind: "manual-pdf" | "legacy-diktat", origin: string): MaterialPdfSource | null {
  const value = file?.trim();
  if (!value || /[\\\u0000-\u001f]/.test(value) || value.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
      const host = url.hostname.toLowerCase();
      if (["utfs.io", "uploadthing.com"].includes(host) || host.endsWith(".utfs.io") || host.endsWith(".ufs.sh")) {
        return { hostedUrl: url.href };
      }
      const storagePublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      if (url.origin !== origin && (!storagePublicBase || !url.href.startsWith(storagePublicBase + "/"))) return null;
    } catch { return null; }
  }
  const key = extractStorageKey(value);
  if (!key || !isSafeKey(key) || /[\u0000-\u001f]/.test(key) || !key.toLowerCase().endsWith(".pdf")) return null;
  const folder = kind === "manual-pdf" ? "materials" : "diktats";
  return aliases.some(course => key.startsWith(`courses/${slugifySegment(course)}/${folder}/`))
    ? { storageKey: key } : null;
}
