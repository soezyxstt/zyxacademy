import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "./interactive-document";

export function interactiveMarkdown(source: string) {
  const parts: Array<string | InteractiveDocumentSpec> = [];
  let end = 0;
  // Match complete fenced blocks, including ordinary code that may contain sample JSON.
  const fences = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n(?:[\s\S]*?)^ {0,3}\1[ 	]*\r?$/gm;
  for (const match of source.matchAll(fences)) {
    if (match[1] !== "```" || match[2].trim() !== "zyx-visual" || match[0].length > 128 * 1024) continue;
    const firstLine = match[0].indexOf("\n");
    const lastLine = match[0].lastIndexOf("\n");
    try {
      const spec = interactiveDocumentSchema.safeParse(JSON.parse(match[0].slice(firstLine + 1, lastLine)));
      if (!spec.success) continue;
      if (match.index > end) parts.push(source.slice(end, match.index));
      parts.push(spec.data);
      end = match.index + match[0].length;
    } catch {
      // Keep malformed and unrelated authored code verbatim.
    }
  }
  if (end < source.length) parts.push(source.slice(end));
  return parts;
}

export function interactiveMarkdownFallback(source: string) {
  return interactiveMarkdown(source).map(part => typeof part === "string" ? part : part.staticFallback.content).join("");
}
