import { sanitizeVisualSpec, type PublicVisualSpec } from "@/lib/articles/structured-read-model";

/** Shared Markdown embeds use the same non-executable contract as Article visuals. */
export const EMBEDDED_VISUAL_LANGUAGE = "zyx-visual";
export const MAX_EMBEDDED_VISUAL_LENGTH = 128 * 1024;

export function parseEmbeddedVisual(source: string): PublicVisualSpec | null {
  if (!source.trim() || source.length > MAX_EMBEDDED_VISUAL_LENGTH) return null;
  try {
    return sanitizeVisualSpec(JSON.parse(source));
  } catch {
    return null;
  }
}
