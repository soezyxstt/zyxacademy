import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { composerMathRanges } from "@/components/course/zyra-composer-math";

describe("Zyra composer math ranges", () => {
  test("preserves the exact source and offsets for all explicit delimiters", () => {
    const value = String.raw`A $x^2$ B $$y$$ C \(z\) D \[w\]`;
    const ranges = composerMathRanges(value);
    expect(ranges.map(({ from, to }) => value.slice(from, to))).toEqual(["$x^2$", "$$y$$", String.raw`\(z\)`, String.raw`\[w\]`]);
    expect(ranges.map(({ source }) => source)).toEqual(["x^2", "y", "z", "w"]);
    expect(ranges.map(({ display }) => display)).toEqual([false, true, false, true]);
  });

  test("leaves prose, currency, code, escaped and incomplete delimiters as text", () => {
    const value = String.raw`Price $5 and $10; \$escaped; \sqrt{x}; ` + "`$x$`" + String.raw` incomplete \(x`;
    expect(composerMathRanges(value)).toEqual([]);
  });

  test("edits a formula using raw document positions without dropping delimiters", () => {
    const initial = EditorState.create({ doc: "Before $x$ after" });
    const range = composerMathRanges(initial.doc.toString())[0]!;
    const changed = initial.update({ changes: { from: range.from + 1, to: range.to - 1, insert: "y^2" }, selection: { anchor: range.from + 4 } }).state;
    expect(changed.doc.toString()).toBe("Before $y^2$ after");
    expect(changed.selection.main.head).toBe(range.from + 4);
    expect(composerMathRanges(changed.doc.toString())[0]?.source).toBe("y^2");
  });

  test("finds math after code and leaves empty or incomplete formulas editable", () => {
    const value = "`$ignored$` $$ $x$ and \\[ok\\]";
    expect(composerMathRanges(value).map(({ source }) => source)).toEqual(["x", "ok"]);
  });
});
