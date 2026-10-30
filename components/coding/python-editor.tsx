"use client";
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { autocompletion } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { cn } from "@/lib/utils";

// GitHub Light and Dark palettes. Colors come from `--code-*` tokens in globals.css so they follow the app theme.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--code-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom, t.self, t.constant(t.variableName), t.standard(t.variableName)], color: "var(--code-constant)" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName), t.meta, t.annotation], color: "var(--code-function)" },
  { tag: [t.className, t.definition(t.className), t.typeName], color: "var(--code-type)" },
  { tag: [t.escape, t.special(t.variableName)], color: "var(--code-constant)" },
  { tag: t.invalid, color: "var(--code-invalid)" },
]);

const theme = EditorView.theme({
  "&": { color: "var(--foreground)", backgroundColor: "var(--background)", fontSize: "14px", height: "100%", maxHeight: "400px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflowY: "auto", overflowX: "hidden", fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6" },
  ".cm-content": { minHeight: "220px", padding: "12px 0", caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--code-gutter)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "var(--code-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--code-selection)" },
  ".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px oklch(0 0 0 / 0.16)", overflow: "hidden" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "13px", maxHeight: "14em", padding: "4px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", borderRadius: "4px", lineHeight: "1.5" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--code-selection)", color: "var(--popover-foreground)" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--code-keyword)" },
  ".cm-completionDetail": { color: "var(--muted-foreground)", fontStyle: "normal", marginLeft: "8px" },
});

export function PythonEditor({ value, onChange, label = "Kode Python", className }: { value: string; onChange(value: string): void; label?: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: [
      lineNumbers(), history(), python(), EditorView.lineWrapping, autocompletion({ icons: false }), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), syntaxHighlighting(highlight), theme,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox" }),
      EditorView.updateListener.of((update) => { if (update.docChanged) change.current(update.state.doc.toString()); }),
    ] }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
    // Editor lifetime is independent of each keystroke; external changes sync below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  useEffect(() => {
    const editor = view.current;
    if (editor && value !== editor.state.doc.toString()) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className={cn("min-w-0 max-h-[400px] overflow-hidden rounded-lg border border-border transition-colors focus-within:border-ring", className)} />;
}
