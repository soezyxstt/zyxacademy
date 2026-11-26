import { normalizeMathInText } from "../../../../lib/math/math-normalizer";
import { splitScientificText } from "../../../../lib/math/text-segments";
import { safeDiscussionLink } from "../../../../packages/student-community/discussion-markdown";

const maxRichLength = 20_000;
const formatSyntax = /(?:^|\n)(?: {4}|\t)\S|(?:^|\n) {0,3}(?:#{1,6}\s|[-+*]\s|\d+[.)]\s|[>|]|(?:---|___|\*\*\*)\s*$)|[\[`<>]|[*_~]{1,3}[^\s*_~]|https:\/\//m;
const destinations = /!?\[[^\]\n]{0,500}\]\((?:\\[^\n]|[^\\()\n]|\([^()\n]{0,2048}\)){0,2048}\)|https?:\/\/[^\s<>]{1,2048}/gu;
const htmlMedia = /<(?=\/?(?:video|source|iframe|audio|img|object|embed|track)\b)/gi;
const standalonePower = /(?<![\w/\\])(?:[a-zA-Z]|\d+)\^(?:[+-]?\d+|\{[-+\w]+\})(?!\w)/g;

function normalizeText(value: string) {
  const normalized = normalizeMathInText(value);
  // The web normalizer covers compound expressions; standalone powers occur
  // frequently in legacy answer choices and are unambiguous here.
  if (normalized.includes("$")) return normalized;
  return normalized.replace(standalonePower, term => `$${term}$`);
}

function normalizeProse(value: string) {
  return value.split("\n").map(line => {
    const spaces = line.match(/^\s*/)?.[0] ?? "";
    if (spaces.length >= 4 || spaces.includes("\t")) return line;
    const content = line.slice(spaces.length);
    let result = "";
    let offset = 0;
    for (const match of content.matchAll(destinations)) {
      result += normalizeText(content.slice(offset, match.index)) + match[0];
      offset = match.index + match[0].length;
    }
    return spaces + (result + normalizeText(content.slice(offset))).replace(htmlMedia, "&lt;");
  }).join("\n");
}

function prepareSegments(source: string) {
  let offset = 0;
  let formula = false;
  const markdown = splitScientificText(source).map(segment => {
    if (segment.type === "text") {
      offset += segment.value.length;
      const text = normalizeProse(segment.value);
      if (text !== segment.value && splitScientificText(text).some(item => item.type === "math")) formula = true;
      return text;
    }
    if (segment.type === "code") {
      const start = offset;
      offset += segment.sourceLength;
      return source.slice(start, offset);
    }
    formula = true;
    const delimiterLength = source.startsWith("$$", offset) || source.startsWith("\\", offset) ? 2 : 1;
    const afterMath = source.indexOf(segment.value, offset + delimiterLength) + segment.value.length;
    const trailingSpace = source.slice(afterMath).match(/^\s*/)?.[0].length ?? 0;
    offset = afterMath + trailingSpace + delimiterLength;
    return segment.display ? `$$${segment.value}$$` : `$${segment.value}$`;
  }).join("");
  return { markdown, formula };
}

export function prepareCourseMarkdown(source: string) {
  if (source.length > maxRichLength) return { markdown: source, rich: false };
  const chunks = source.split(/(^ {0,3}(~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2~*[ \t]*$|(?![\s\S])))/m);
  let markdown = "";
  let formula = false;
  for (let index = 0; index < chunks.length; index += 3) {
    const part = prepareSegments(chunks[index]);
    markdown += part.markdown + (chunks[index + 1] ?? "");
    formula ||= part.formula;
  }
  return { markdown, rich: formula || formatSyntax.test(source) };
}

export function safeCourseMarkdownLink(value: string, origin: string) {
  const safe = safeDiscussionLink(value);
  if (!safe) return null;
  try {
    const base = new URL(origin).origin;
    const url = new URL(safe, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    // Embedded lessons may contain URLs to private media. Only the authorized
    // attachment flow can open these with the active learner's credentials.
    if (/^\/api(?:\/|$)/i.test(decodeURIComponent(url.pathname)) ||
      [...url.searchParams.keys()].some(key => /^(?:x-amz-|x-goog-|signature$|token$|access_token$)/i.test(key))) return null;
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return null;
  }
}

export function safeInlineCourseImage(value: string) {
  if (value.length > 350_000) return undefined;
  const compact = value.replace(/[\t\n\r ]/g, "");
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(compact)) return compact;
  return undefined;
}
