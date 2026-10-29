/**
 * Zyra Selection Serializer
 *
 * Sanitizes and extracts clean text from browser selection ranges containing KaTeX/MathJax,
 * resolves underlying LaTeX strings from <annotation encoding="application/x-tex">,
 * prevents double-reading of visual math spans and screen-reader MathML,
 * and extracts pedagogical context (surrounding paragraph, block type, section title).
 */

export interface ZyraSelectionContext {
  cleanText: string;
  hasMath: boolean;
  wordCount: number;
  blockType?: "explanation" | "worked_example" | "retrieval_prompt" | "mathematical_representation" | "verbal_representation" | "analogy" | "misconception" | "summary" | "other";
  blockTitle?: string;
  surroundingText?: string;
  sectionTitle?: string;
  chapterTitle?: string;
  suggestedIntent: "define" | "simplify" | "step_by_step" | "intuition" | "custom";
}

/**
 * Sanitizes an HTML string containing KaTeX markup by extracting
 * <annotation encoding="application/x-tex"> and stripping duplicate HTML/MathML.
 */
export function sanitizeKatexInHtml(html: string): string {
  if (!html) return "";

  // 1. Replace KaTeX blocks with LaTeX formula from annotation
  let sanitized = html.replace(
    /<span[^>]*class="[^"]*katex[^"]*"[^>]*>[\s\S]*?<annotation[^>]*encoding="application\/x-tex"[^>]*>([\s\S]*?)<\/annotation>[\s\S]*?<\/span>\s*<\/span>/gi,
    (_match, tex) => ` $${tex.trim()}$ `
  );

  // 2. Fallback: If mathml annotation exists without outer span match
  sanitized = sanitized.replace(
    /<annotation[^>]*encoding="application\/x-tex"[^>]*>([\s\S]*?)<\/annotation>/gi,
    (_match, tex) => ` $${tex.trim()}$ `
  );

  // 3. Strip any remaining katex-html or katex-mathml tags if orphan
  sanitized = sanitized.replace(/<span[^>]*class="katex-html"[^>]*>[\s\S]*?<\/span>/gi, "");
  sanitized = sanitized.replace(/<span[^>]*class="katex-mathml"[^>]*>[\s\S]*?<\/span>/gi, "");

  // 4. Convert block breaks to newlines and strip remaining HTML tags
  sanitized = sanitized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n|\r|\n/g, " ");

  return normalizeCleanMathText(sanitized);
}

/**
 * Sanitizes a DOM node tree containing KaTeX elements by replacing
 * .katex containers with clean $...$ or $$...$$ LaTeX annotations.
 */
export function sanitizeKatexInNode(root: Node): boolean {
  if (typeof document === "undefined") return false;
  let hasMath = false;

  const element = root instanceof Element ? root : root instanceof DocumentFragment ? root : null;
  if (!element) return false;

  // 1. Process all .katex elements in the cloned tree
  const katexElements = Array.from(element.querySelectorAll?.(".katex") ?? []);
  for (const katexEl of katexElements) {
    hasMath = true;
    const isDisplay = katexEl.classList.contains("katex-display") ||
      katexEl.parentElement?.classList.contains("katex-display") ||
      Boolean(katexEl.closest?.(".katex-display"));

    // Find LaTeX source inside annotation
    const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation');
    const rawTex = annotation?.textContent?.trim();

    if (rawTex) {
      const mathCode = isDisplay ? `$$${rawTex}$$` : `$${rawTex}$`;
      const textNode = document.createTextNode(` ${mathCode} `);
      katexEl.parentNode?.replaceChild(textNode, katexEl);
    } else {
      // Fallback: remove hidden mathml to avoid duplication with visual katex-html
      const mathml = katexEl.querySelector(".katex-mathml");
      if (mathml) mathml.remove();
    }
  }

  // 2. Also check MathJax containers if any
  const mathJaxElements = Array.from(element.querySelectorAll?.("mjx-container, .MathJax") ?? []);
  for (const mjxEl of mathJaxElements) {
    hasMath = true;
    const texAttr = mjxEl.getAttribute("data-latex") || mjxEl.getAttribute("alt");
    if (texAttr) {
      const textNode = document.createTextNode(` $${texAttr.trim()}$ `);
      mjxEl.parentNode?.replaceChild(textNode, mjxEl);
    }
  }

  return hasMath;
}

/**
 * Recursively converts a sanitized DOM node into clean text,
 * inserting appropriate newlines for block elements.
 */
function nodeToCleanText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();

  // Skip script, style, and hidden screen-reader elements
  if (tag === "script" || tag === "style" || el.classList?.contains("sr-only")) {
    return "";
  }

  const isBlock = [
    "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "article", "section", "header"
  ].includes(tag);

  let result = "";
  for (const child of Array.from(node.childNodes)) {
    result += nodeToCleanText(child);
  }

  if (tag === "br") {
    return "\n";
  }

  if (isBlock) {
    return `\n${result}\n`;
  }

  return result;
}

/**
 * Normalizes extracted text: collapses redundant horizontal whitespace,
 * cleans up space around LaTeX delimiters, limits length.
 */
export function normalizeCleanMathText(text: string, maxChars = 1200): string {
  return text
    // Replace non-breaking spaces
    .replace(/\u00a0/g, " ")
    // Replace tabs & multi spaces within lines
    .replace(/[^\S\r\n]+/g, " ")
    // Clean whitespace directly INSIDE math delimiters: $  P(x)  $ -> $P(x)$
    .replace(/\$\s+([^$]+?)\s+\$/g, "$$$1$$")
    // Clean space between punctuation and math if needed, e.g. "$ , " -> "$, "
    .replace(/\$\s+,/g, "$,")
    .replace(/\$\s+\./g, "$.")
    // Normalize newlines (max 2 consecutive)
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

function extractSanitizedElementText(el: Element | null | undefined, maxChars = 240): string | undefined {
  if (!el) return undefined;
  try {
    if (typeof el.cloneNode === "function" && typeof document !== "undefined") {
      const cloned = el.cloneNode(true) as HTMLElement;
      sanitizeKatexInNode(cloned);
      const cleaned = normalizeCleanMathText(nodeToCleanText(cloned), maxChars).replace(/\s*\n\s*/g, " ").trim();
      return cleaned || undefined;
    }
  } catch {
    // Fallback to HTML/text sanitization below
  }
  if (typeof el.innerHTML === "string" && el.innerHTML) {
    const sanitized = sanitizeKatexInHtml(el.innerHTML).replace(/\s*\n\s*/g, " ").trim().slice(0, maxChars);
    return sanitized || undefined;
  }
  const raw = normalizeCleanMathText(el.textContent ?? "", maxChars);
  return raw || undefined;
}

function findPrecedingHeading(startEl: Element | null | undefined): Element | null {
  let curr: Element | null | undefined = startEl;
  while (curr) {
    let prev = curr.previousElementSibling;
    while (prev) {
      const tag = prev.tagName?.toUpperCase();
      if (tag === "H1" || tag === "H2" || tag === "H3") {
        return prev;
      }
      prev = prev.previousElementSibling;
    }
    curr = curr.parentElement;
    if (curr?.tagName?.toUpperCase() === "ARTICLE") break;
  }
  return null;
}

/**
 * Extracts pedagogical metadata from the DOM container enclosing the selection.
 */
export function extractContextFromContainer(container: Node | null): {
  blockType?: ZyraSelectionContext["blockType"];
  blockTitle?: string;
  surroundingText?: string;
  sectionTitle?: string;
} {
  if (!container) return {};

  const startEl =
    typeof (container as Element).closest === "function"
      ? (container as Element)
      : container.parentElement;
  if (!startEl || typeof startEl.closest !== "function") return {};

  // Find enclosing Artikel v4 part or v3 block/card element
  const partEl =
    startEl.getAttribute?.("data-part-kind")
      ? startEl
      : startEl.closest("[data-part-kind]");
  const blockEl =
    startEl.closest("[data-block-type], [data-block-id], .product-worked-example, .product-formative-check, [id^='block-']") ??
    partEl;
  const sectionEl =
    startEl.closest("[data-section-slug], [id^='section-'], article") ??
    (startEl.parentElement?.tagName?.toUpperCase() === "ARTICLE" ? startEl.parentElement : null);

  let blockType: ZyraSelectionContext["blockType"] = "other";
  let blockTitle: string | undefined;
  let surroundingText: string | undefined;

  const partKind = partEl?.getAttribute?.("data-part-kind");
  if (partKind === "worked_example") {
    blockType = "worked_example";
  } else if (partKind === "math_unit") {
    blockType = "mathematical_representation";
  }

  if (blockEl) {
    const rawType = blockEl.getAttribute?.("data-block-type");
    if (blockType === "other" && rawType && [
      "explanation", "worked_example", "retrieval_prompt", "mathematical_representation",
      "verbal_representation", "analogy", "misconception", "summary"
    ].includes(rawType)) {
      blockType = rawType as ZyraSelectionContext["blockType"];
    } else if (blockType === "other" && (blockEl.classList?.contains("product-worked-example") || blockEl.id?.includes("worked-example"))) {
      blockType = "worked_example";
    } else if (blockType === "other" && (blockEl.classList?.contains("product-formative-check") || blockEl.id?.includes("retrieval"))) {
      blockType = "retrieval_prompt";
    }

    blockTitle = blockEl.getAttribute?.("data-block-title") ||
      extractSanitizedElementText(partEl?.querySelector?.("h4, h3, .font-heading") ?? blockEl.querySelector?.("h3, h4, .font-heading")) ||
      undefined;

    // Clone block to sanitize KaTeX in surrounding text
    surroundingText = extractSanitizedElementText(partEl ?? blockEl, 1500);
  }

  let sectionTitle: string | undefined;
  const precedingHeading = findPrecedingHeading(partEl ?? blockEl ?? startEl);
  if (precedingHeading) {
    sectionTitle = extractSanitizedElementText(precedingHeading) || undefined;
  } else if (sectionEl) {
    sectionTitle = extractSanitizedElementText(sectionEl.querySelector?.("h2, h1")) || undefined;
  }

  return {
    blockType,
    blockTitle,
    surroundingText,
    sectionTitle,
  };
}

/**
 * Heuristically determines student intent based on the selected snippet and context.
 */
export function determineSuggestedIntent(
  cleanText: string,
  hasMath: boolean,
  wordCount: number,
  blockType?: string
): ZyraSelectionContext["suggestedIntent"] {
  // Short symbol or 1-3 words: definition intent
  if (wordCount <= 4 && !cleanText.includes("\n") && !/[.!?]$/.test(cleanText.trim())) {
    return "define";
  }

  // Worked example or equation step: step by step breakdown
  if (blockType === "worked_example" || (hasMath && (cleanText.includes("=") || cleanText.includes("\\") || cleanText.includes("\n")))) {
    return "step_by_step";
  }

  // Conceptual statements or theory: intuition / simplified analogy
  if (blockType === "analogy" || blockType === "verbal_representation" || cleanText.length > 80) {
    return "intuition";
  }

  return "simplify";
}

/**
 * Primary serializer: takes browser Selection and returns a sanitized,
 * context-enriched selection payload ready for Zyra and UI preview.
 */
export function extractZyraSelection(selection: Selection | null, chapterTitle?: string): ZyraSelectionContext | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;

  // 1. Clone selection fragment
  let fragment: DocumentFragment;
  try {
    fragment = range.cloneContents();
  } catch {
    return null;
  }

  // 2. Sanitize KaTeX/MathJax inside fragment
  let hasMath = sanitizeKatexInNode(fragment);

  // Check if selection starts/ends inside a KaTeX element in live DOM
  if (!hasMath && typeof Element !== "undefined") {
    const parentEl = commonAncestor instanceof Element ? commonAncestor : commonAncestor?.parentElement;
    if (parentEl?.closest(".katex, [data-latex]")) {
      hasMath = true;
    }
  }

  // 3. Extract clean text
  const rawText = nodeToCleanText(fragment);
  const cleanText = normalizeCleanMathText(rawText);

  if (!cleanText || cleanText.length < 2) {
    return null;
  }

  // 4. Word count calculation
  const words = cleanText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Check if KaTeX delimiter exists in text
  if (cleanText.includes("$")) {
    hasMath = true;
  }

  // 5. Extract surrounding container context
  const context = extractContextFromContainer(commonAncestor);

  // 6. Determine intent
  const suggestedIntent = determineSuggestedIntent(cleanText, hasMath, wordCount, context.blockType);

  return {
    cleanText,
    hasMath,
    wordCount,
    blockType: context.blockType,
    blockTitle: context.blockTitle,
    surroundingText: context.surroundingText,
    sectionTitle: context.sectionTitle,
    chapterTitle,
    suggestedIntent,
  };
}
