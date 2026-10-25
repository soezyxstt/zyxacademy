"use client";
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

export function PythonEditor({ value, onChange, label = "Kode Python" }: { value: string; onChange(value: string): void; label?: string }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: [
      lineNumbers(), history(), python(), drawSelection(), highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox" }),
      EditorView.theme({
        "&": { color: "var(--foreground)", backgroundColor: "var(--background)", fontSize: "14px" },
        ".cm-content": { fontFamily: "monospace", minHeight: "200px", padding: "12px 0" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)" },
        ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)" },
        "&.cm-focused": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
      }),
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
  return <div ref={host} className="min-w-0 overflow-hidden rounded-lg border border-border" />;
}
