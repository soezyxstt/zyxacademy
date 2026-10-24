import { normalizeTutorMathMarkdown } from "./math-markdown";

export interface SanitizationSource {
  id: string;
  label?: string;
  title?: string;
}

// UUID v4 pattern
const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// Known ID prefixes in Zyx Academy:
// article-product, diktat-product, summary-product, text-product, product,
// article, ko, idea, source, doc, chap, bab, material, concept, quiz,
// question, soal, pka, assessment, system-stats
const KNOWN_ID_PREFIXES = [
  "article-product",
  "diktat-product",
  "summary-product",
  "text-product",
  "product",
  "article",
  "ko",
  "idea",
  "source",
  "doc",
  "chap",
  "bab",
  "material",
  "concept",
  "quiz-review",
  "quiz",
  "question",
  "soal",
  "pka",
  "assessment",
  "selection",
  "system-stats",
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSourceTitle(source: SanitizationSource): string {
  const candidate = (source.title || source.label || "").trim();
  // Strip leading generic label prefixes if present, e.g. "Materi: ", "Konsep: "
  return candidate.replace(/^(?:Materi|Konsep|Pembahasan(?:\s*Soal)?|Soal(?:\s*Latihan)?):\s*/i, "").trim();
}

/**
 * Cleans model output before it reaches the student:
 * 1. Replaces known source IDs used in prose with their human-readable title.
 * 2. Strips bracketed and parenthesized citation tokens (e.g. [article-product-...], [ko-...], (uuid))
 *    which belong exclusively in the sources metadata / chips, never in student prose.
 * 3. Strips bare UUIDs and known ID slugs that leak into text.
 * 4. Tidies leftover whitespace and punctuation artefacts.
 * 5. Normalizes LaTeX math.
 */
export function sanitizeAnswer(
  text: string,
  knownSources?: readonly SanitizationSource[],
): string {
  if (!text) return "";
  let out = text;

  // 1. If known sources are provided, handle their IDs explicitly
  if (knownSources && knownSources.length > 0) {
    for (const source of knownSources) {
      if (!source.id) continue;
      const title = cleanSourceTitle(source);
      const escapedId = escapeRegex(source.id);

      // Handle bracketed/parenthesized citation of this source:
      // e.g. "...tentang vektor [article-product-xxx]." -> "...tentang vektor."
      // If preceded by contextual reference words e.g. "materi [article-product-xxx]",
      // replace with the human title: e.g. 'materi "Menyatakan vektor dengan besar dan arah"'
      if (title && title !== source.id) {
        out = out.replace(
          new RegExp(`(\\b(?:materi|artikel|bab|dokumen|topik|baca|pada|di|rujuk|referensi)\\s+)[\\[\\(]\\s*(?:(?:source\\s*(?:id)?|id|ref)\\s*:?\\s*)?${escapedId}\\s*[\\]\\)]`, "gi"),
          `$1"${title}"`
        );
      }

      // Any remaining bracketed/parenthesized instances of this source id are citation tags to strip
      out = out.replace(
        new RegExp(`[ \\t]*[\\[\\(]\\s*(?:(?:source\\s*(?:id)?|id|ref)\\s*:?\\s*)?${escapedId}\\s*[\\]\\)]`, "gi"),
        ""
      );

      // If the bare source id appears in prose (e.g. "sesuai article-product-xxx")
      if (title && title !== source.id) {
        out = out.replace(new RegExp(`\\b${escapedId}\\b`, "g"), `"${title}"`);
      } else {
        out = out.replace(new RegExp(`\\b${escapedId}\\b`, "g"), "");
      }
    }
  }

  // 2. Generic stripping of bracketed/parenthesized citation markers with known prefixes or UUIDs
  const prefixGroup = KNOWN_ID_PREFIXES.map(escapeRegex).join("|");
  const prefixedIdPattern = `(?:(?:${prefixGroup})(?:-[a-zA-Z0-9_]+)+|system-stats)`;

  // Strip bracketed or parenthesized prefixed IDs: e.g. [article-product-xxx], (ko-xxx)
  out = out.replace(
    new RegExp(`[ \\t]*[\\[\\(]\\s*(?:(?:source\\s*(?:id)?|id|ref)\\s*:?\\s*)?${prefixedIdPattern}\\s*[\\]\\)]`, "gi"),
    ""
  );

  // Strip bracketed/parenthesized UUIDs: e.g. [source id: 12345678-1234-...]
  out = out.replace(
    new RegExp(`[ \\t]*[\\[\\(]\\s*(?:(?:source\\s*(?:id)?|id|ref)\\s*:?\\s*)?${UUID_RE}\\s*[\\]\\)]`, "gi"),
    ""
  );

  // Strip any generic bracketed citation containing a slug with >= 3 hyphen-separated segments (e.g. [foo-bar-baz-v1])
  out = out.replace(
    new RegExp(`[ \\t]*[\\[\\(]\\s*(?:(?:source\\s*(?:id)?|id|ref)\\s*:?\\s*)?[a-z0-9]+(?:-[a-z0-9]+){2,}\\s*[\\]\\)]`, "gi"),
    ""
  );

  // Strip any remaining bare UUIDs
  out = out.replace(new RegExp(`\\b${UUID_RE}\\b`, "gi"), "");

  // Strip any remaining bare prefixed product slugs (e.g. article-product-xxx, text-product-xxx)
  out = out.replace(
    new RegExp(`\\b(?:article-product|diktat-product|summary-product|text-product)-[a-zA-Z0-9_-]+\\b`, "gi"),
    ""
  );

  // 3. Tidy prose only. Citation/ID redaction above still covers code, while
  // whitespace, empty calls and empty lists are meaningful Python syntax.
  const codeSegments: string[] = [];
  out = out.replace(/```[\s\S]*?```|`[^`\n]*`/g, (segment) => {
    const marker = `@@ZYRA_CODE_${codeSegments.length}@@`;
    codeSegments.push(segment);
    return marker;
  });
  // Empty brackets or parens left behind
  out = out.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");
  // Space before punctuation: "word ." -> "word."
  out = out.replace(/[ \t]+([.,!?;:])/g, "$1");
  // Doubled punctuation e.g. ".." -> "." (preserving math dots)
  out = out.replace(/([.,;:!?])\s*\1+/g, "$1");
  // Doubled spaces
  out = out.replace(/[ \t]{2,}/g, " ");

  out = out.replace(/@@ZYRA_CODE_(\d+)@@/g, (_, index: string) => codeSegments[Number(index)] ?? "");

  return normalizeTutorMathMarkdown(out.trim());
}
