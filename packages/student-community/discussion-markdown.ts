export const DISCUSSION_INLINE_PATTERN =
  /!\[([^\]\n]{0,500})\]\([^\n)]{0,2048}\)|\[([^\]\n]{1,500})\]\(([^\s()]{1,2048})\)|\*\*((?:\$[^$\n]+\$|\\\((?:\\(?!\))|[^\\\n])+\\\)|\\(?!\()|[^*$\\\n])+)\*\*|\*((?:\$[^$\n]+\$|\\\((?:\\(?!\))|[^\\\n])+\\\)|\\(?!\()|[^*$\\\n])+)\*|`([^`\n]+)`|\$([^$\n]+)\$|\\\(((?:\\(?!\))|[^\\\n])+)\\\)|(?<![\p{L}\p{N}_@])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu;

export const DISCUSSION_HEADING_LINE = /^#{1,3}\s+(\S.*)$/;

export function safeDiscussionLink(value: string): string | null {
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
