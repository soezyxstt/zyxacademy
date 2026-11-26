import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "./interactive-document";

export function splitVisualMarkdown<T>(source: string, parse: (source: string) => T | null) {
  const parts: Array<string | T> = [];
  let end = 0;
  // Match complete fenced blocks, including ordinary code that may contain sample JSON.
  const fences = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n(?:[\s\S]*?)^ {0,3}\1[ 	]*\r?$/gm;
  for (const match of source.matchAll(fences)) {
    if (match[1] !== "```" || match[2].trim() !== "zyx-visual" || match[0].length > 128 * 1024) continue;
    const firstLine = match[0].indexOf("\n");
    const lastLine = match[0].lastIndexOf("\n");
    try {
      const spec = parse(match[0].slice(firstLine + 1, lastLine));
      if (!spec) continue;
      if (match.index > end) parts.push(source.slice(end, match.index));
      parts.push(spec);
      end = match.index + match[0].length;
    } catch {
      // Keep malformed and unrelated authored code verbatim.
    }
  }
  if (end < source.length) parts.push(source.slice(end));
  return parts;
}

export function interactiveMarkdown(source: string) {
  return splitVisualMarkdown<InteractiveDocumentSpec>(source, raw => {
    const result = interactiveDocumentSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  });
}

export function interactiveMarkdownFallback(source: string) {
  return interactiveMarkdown(source).map(part => typeof part === "string" ? part : part.staticFallback.content).join("");
}
