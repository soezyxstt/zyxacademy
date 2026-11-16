import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { composerFormattingRanges, formattingRendering, mathRendering } from "@/components/course/zyra-composer-input";
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


test("formatting spans preserve markdown source offsets and do not create live links", () => {
  const source = "**tebal** dan *miring* serta `kode` [tautan](javascript:alert) [aman](https://example.com)";
  const ranges = composerFormattingRanges(source);
  expect(ranges.map(range => range.kind)).toEqual(["bold", "italic", "code", "text", "link"]);
  expect(ranges.map(range => source.slice(range.contentFrom, range.contentTo))).toEqual(["tebal", "miring", "kode", "tautan", "aman"]);
  expect(composerFormattingRanges("```\n**code**\n```")).toEqual([]);
});


test("live formatting and math decorations retain source through selection and edits", () => {
  const source = "**$x^2$** and `code`";
  const state = EditorState.create({ doc: source, extensions: [mathRendering, formattingRendering] });
  expect(state.field(mathRendering).decorations.size).toBe(1);
  expect(state.field(formattingRendering).size).toBe(6);
  const edited = state.update({ changes: { from: 3, to: 6, insert: "y^3" }, selection: { anchor: 6 } }).state;
  expect(edited.doc.toString()).toBe("**$y^3$** and `code`");
  expect(edited.field(mathRendering).decorations.size).toBe(1);
});
