export type ScientificTextSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean }
  | { type: "code"; value: string; display: boolean; sourceLength: number };

function escaped(input: string, index: number): boolean {
  let count = 0;
  while (index > 0 && input[--index] === "\\") count++;
  return count % 2 === 1;
}

/** Protect code before interpreting only matching, unescaped math delimiters. */
export function splitScientificText(input: string): ScientificTextSegment[] {
  const segments: ScientificTextSegment[] = [];
  let plainStart = 0;
  let cursor = 0;
  while (cursor < input.length) {
    if (escaped(input, cursor)) { cursor++; continue; }
    const code = input[cursor] === "`" ? input.slice(cursor).match(/^`+/)?.[0] : undefined;
    const open = code ?? (["$$", "\\[", "\\("].find((delimiter) => input.startsWith(delimiter, cursor)) ?? (input[cursor] === "$" ? "$" : undefined));
    if (!open) { cursor++; continue; }
    const close = code ? code : open === "\\[" ? "\\]" : open === "\\(" ? "\\)" : open;
    let end = cursor + open.length;
    while (end < input.length) {
      if (!code && open === "$" && input[end] === "\n") break;
      if (input.startsWith(close, end) && (code || !escaped(input, end)) &&
          (close !== "$" || (input[end - 1] !== "$" && input[end + 1] !== "$")) &&
          (!code || (input[end - 1] !== "`" && input[end + code.length] !== "`"))) break;
      end++;
    }
    if (end >= input.length || !input.startsWith(close, end)) {
      if (code && code.length >= 3 && (cursor === 0 || input[cursor - 1] === "\n")) {
        if (cursor > plainStart) segments.push({ type: "text", value: input.slice(plainStart, cursor) });
        segments.push({ type: "code", value: input.slice(cursor + code.length).replace(/^[^\n]*\n/, ""), display: true, sourceLength: input.length - cursor });
        return segments;
      }
      cursor += open.length;
      continue;
    }
    if (cursor > plainStart) segments.push({ type: "text", value: input.slice(plainStart, cursor) });
    const value = input.slice(cursor + open.length, end);
    if (code) {
      const display = code.length >= 3 && (cursor === 0 || input[cursor - 1] === "\n");
      segments.push({ type: "code", value: display ? value.replace(/^[^\n]*\n/, "").replace(/\n$/, "") : value, display, sourceLength: end + close.length - cursor });
    } else if (value.trim()) {
      segments.push({ type: "math", value: value.trim(), display: open === "$$" || open === "\\[" });
    } else segments.push({ type: "text", value: input.slice(cursor, end + close.length) });
    cursor = end + close.length;
    plainStart = cursor;
  }
  if (plainStart < input.length) segments.push({ type: "text", value: input.slice(plainStart) });
  return segments;
}
