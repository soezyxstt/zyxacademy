export type ComposerMath = { from: number; to: number; source: string; display: boolean };

function escaped(text: string, position: number): boolean {
  let count = 0;
  while (position > 0 && text[--position] === "\\") count++;
  return count % 2 === 1;
}

export function composerMathRanges(text: string): ComposerMath[] {
  const result: ComposerMath[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`" && !escaped(text, i)) {
      const ticks = /^`+/.exec(text.slice(i))![0];
      const end = text.indexOf(ticks, i + ticks.length);
      i = end < 0 ? text.length : end + ticks.length;
      continue;
    }
    if (escaped(text, i)) { i++; continue; }
    const open = ["$$", "\\(", "\\[", "$"].find((s) => text.startsWith(s, i));
    if (!open) { i++; continue; }
    if (open === "$" && /^\$\d+(?:[.,]\d+)*(?![\d.,])/.test(text.slice(i)) && !/^\$\d+(?:[.,]\d+)*\$/.test(text.slice(i))) { i++; continue; }
    const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
    let end = i + open.length;
    while (end < text.length) {
      if ((open === "$" && text[end] === "\n") || text[end] === "`") break;
      if (text.startsWith(close, end) && !escaped(text, end) &&
          (close !== "$" || (text[end - 1] !== "$" && text[end + 1] !== "$"))) break;
      end++;
    }
    const source = text.slice(i + open.length, end);
    const valid = end < text.length && text.startsWith(close, end) && source.trim() &&
      (open !== "$" || (!/^\s|\s$/.test(source) && !/\d/.test(text[end + 1] ?? "")));
    if (!valid) { i += open.length; continue; }
    result.push({ from: i, to: end + close.length, source, display: open === "$$" || open === "\\[" });
    i = end + close.length;
  }
  return result;
}
