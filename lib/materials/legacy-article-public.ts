import { sanitizeFormativeCheck, sanitizeWorkedExample } from "@/lib/articles/structured-read-model";
import { splitScientificText } from "@/lib/math/text-segments";

/** Flat V2 Articles have no private block evaluation route. Publish visible text only. */
export function legacyArticleBlockPublicMarkdown(value: string, depth = 0): string {
  if (depth > 8) throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID");
  let payload: unknown;
  try { payload = JSON.parse(value); } catch (error) {
    if (error instanceof SyntaxError && !hasLegacyPrivateFormativeEnvelope(value)) return value;
    throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID", { cause: error });
  }
  if (typeof payload === "string") return legacyArticleBlockPublicMarkdown(payload, depth + 1);
  if (!payload || typeof payload !== "object") return value;
  if (Array.isArray(payload) || !("content" in payload) || typeof payload.content !== "string") throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID");
  const envelope = payload as Record<string, unknown> & { content: string };
  const result = [legacyArticleBlockPublicMarkdown(envelope.content, depth + 1)];
  if (envelope.workedExamplePayload !== undefined) {
    const worked = sanitizeWorkedExample(envelope.workedExamplePayload);
    if (!worked) throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID");
    for (const step of worked.steps) result.push(`### ${step.label}\n\n${step.explanation}\n\n${step.reason}`);
    result.push(`### Verifikasi\n\n${worked.verification}`);
  }
  if (envelope.formativeCheckPayload !== undefined) {
    const check = sanitizeFormativeCheck(envelope.formativeCheckPayload);
    if (!check) throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID");
    for (const option of check.options ?? []) result.push(`- ${option.text}`);
    if (check.unit) result.push(`Satuan: ${check.unit}`);
  }
  return assertLegacyArticlePublicProjection(result.join("\n\n"));
}

/** Every consumer validates the final text after fields and blocks are joined. */
function assertLegacyArticlePublicProjection(markdown: string): string {
  if (hasLegacyPrivateFormativeEnvelope(markdown)) throw new Error("PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID");
  return markdown;
}

export function legacyArticlePublicBlocks(blocks: readonly { id: string; orderIndex: number; content: string }[]): string[] {
  const projected = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id)).map(block => legacyArticleBlockPublicMarkdown(block.content));
  assertLegacyArticlePublicProjection(projected.join("\n\n"));
  return projected;
}

export function legacyArticlePublicMarkdown(blocks: readonly { id: string; orderIndex: number; content: string }[]): string {
  return legacyArticlePublicBlocks(blocks).join("\n\n");
}

/** Reject raw authoring/evaluation fields, even without a formative wrapper.
 * Explicit code is authored public content, not an implicit private envelope.
 */
export function hasLegacyPrivateFormativeEnvelope(value: string): boolean {
  let decoded = value;
  // Historical blocks may have been JSON-stringified repeatedly, then joined
  // with ordinary Markdown. Decode key escapes without parsing the whole text.
  for (let depth = 0; depth < 8; depth++) {
    const prose = splitScientificText(decoded).filter(segment => segment.type === "text").map(segment => segment.value).join("\n");
    // Any raw JSON object is ambiguous authoring data here. Object shape, not
    // a list of private field names, distinguishes it from ordinary prose.
    let objectDepth = 0;
    for (const [token] of prose.matchAll(/[{}]|"(?:\\.|[^"\\])*"\s*:/g)) {
      if (token === "{") objectDepth++;
      else if (token === "}") objectDepth = Math.max(0, objectDepth - 1);
      else if (objectDepth > 0) return true;
    }
    const next = decoded.replace(/\\(?:u([\da-f]{4})|(["\\/bfnrt]))/gi, (_escape, hex: string | undefined, escaped: string | undefined) => {
      if (hex) return String.fromCharCode(parseInt(hex, 16));
      return ({ b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escaped!] ?? escaped!;
    });
    if (next === decoded) return false;
    decoded = next;
  }
  // Excessively nested escapes are ambiguous authoring data, not public text.
  return true;
}
