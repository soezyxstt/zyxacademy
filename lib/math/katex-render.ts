import katex, { type KatexOptions } from "katex";

export const KATEX_CACHE_MAX_ENTRIES = 500;
export const KATEX_CACHE_MAX_INPUT_LENGTH = 2000;
export const KATEX_CACHE_MAX_OUTPUT_LENGTH = 10000;

export const katexRenderCache = new Map<string, string>();

/**
 * Creates a unique, deterministic cache key distinguishing displayMode and option sets.
 * This guarantees only truly identical configurations share cached strings.
 */
function buildCacheKey(tex: string, options: KatexOptions): string | null {
  const entries = Object.entries(options).sort(([a], [b]) => a.localeCompare(b));
  // Callback policies and mutable macros must execute rather than reuse cached HTML.
  if (entries.some(([, value]) => value !== null && (typeof value === "object" || typeof value === "function"))) return null;
  return JSON.stringify([tex, entries]);
}

/**
 * Unified bounded KaTeX renderer.
 * Bounded by:
 * - Entry count (FIFO eviction when exceeding KATEX_CACHE_MAX_ENTRIES)
 * - Input length (skips caching formulas exceeding KATEX_CACHE_MAX_INPUT_LENGTH)
 * - Output length (skips caching rendered HTML exceeding KATEX_CACHE_MAX_OUTPUT_LENGTH)
 */
export function renderKatexToString(tex: string, options: KatexOptions): string {
  if (tex.length > KATEX_CACHE_MAX_INPUT_LENGTH) {
    return katex.renderToString(tex, options);
  }

  const cacheKey = buildCacheKey(tex, options);
  if (cacheKey === null) return katex.renderToString(tex, options);
  const cached = katexRenderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const rendered = katex.renderToString(tex, options);

  if (rendered.length <= KATEX_CACHE_MAX_OUTPUT_LENGTH) {
    if (katexRenderCache.size >= KATEX_CACHE_MAX_ENTRIES) {
      const firstKey = katexRenderCache.keys().next().value;
      if (firstKey !== undefined) {
        katexRenderCache.delete(firstKey);
      }
    }
    katexRenderCache.set(cacheKey, rendered);
  }

  return rendered;
}

export function clearKatexRenderCache(): void {
  katexRenderCache.clear();
}
