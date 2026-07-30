import { createHash } from "node:crypto";

export type SourceTrustLabel = "trusted_ko" | "untrusted_retrieved" | "user_content";

export interface SourceEnvelope {
  id: string;
  kind: string;
  versionHash: string;
  title: string;
  content: string;
  trustLabel: SourceTrustLabel;
}

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/gi,
  /abaikan\s+(?:semua\s+)?instruksi/gi,
  /system\s+prompt/gi,
  /you\s+are\s+now\s+(?:in\s+developer\s+mode|an?\s+unrestricted\s+ai)/gi,
  /reveal\s+(?:all\s+)?(?:system\s+)?instructions/gi,
  /tampilkan\s+(?:semua\s+)?(?:kuis\s+)?(?:kunci\s+)?jawaban/gi,
  /cite\s+fake\s+(?:id|source)/gi,
  /override\s+(?:system\s+)?policy/gi,
];

/**
 * Sanitizes untrusted text (sources, history, queries) to prevent prompt injection breakouts.
 * Replaces known adversarial prompt injection phrases with safe neutralized placeholders.
 */
export function sanitizePromptInput(text: string): string {
  if (!text) return "";
  let clean = text;

  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, "[inert_untrusted_text_removed]");
  }

  // Escape XML-like tags that attempt to close source boundaries
  clean = clean.replace(/<\/\s*untrusted_source\s*>/gi, "&lt;/untrusted_source&gt;");
  clean = clean.replace(/<\s*untrusted_source[^>]*>/gi, "&lt;untrusted_source&gt;");

  return clean.trim();
}

/**
 * Computes a short SHA256 version hash for a source's text content.
 */
export function computeSourceHash(content: string): string {
  return createHash("sha256").update(content || "").digest("hex").slice(0, 12);
}

/**
 * Wraps a single source into a strongly delimited envelope with explicit trust metadata.
 */
export function formatSourceEnvelope(source: SourceEnvelope): string {
  const sanitized = sanitizePromptInput(source.content);
  return `<untrusted_source id="${source.id}" kind="${source.kind}" trust="${source.trustLabel}" hash="${source.versionHash}">
[Title: ${source.title}]
${sanitized}
</untrusted_source>`;
}

/**
 * Serializes multiple source envelopes into a clean, delimited context block.
 */
export function buildSanitizedContextBlock(sources: SourceEnvelope[]): string {
  if (sources.length === 0) {
    return "NO_SOURCES_AVAILABLE";
  }
  return sources.map(formatSourceEnvelope).join("\n\n");
}
