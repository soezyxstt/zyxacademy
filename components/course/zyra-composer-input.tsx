"use client";

import * as React from "react";
import { Annotation, Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder as editorPlaceholder, type DecorationSet, WidgetType } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, insertNewline, redo } from "@codemirror/commands";
import katex from "@/lib/math/katex";
import { safeDiscussionLink } from "@/lib/discussions/markdown-policy";
import { composerMathRanges } from "./zyra-composer-math";
import "katex/dist/katex.min.css";

export type ZyraComposerInputHandle = {
  focus: (options?: FocusOptions) => void;
  insertText: (text: string) => void;
  setSelectionRange: (start: number, end: number) => void;
  readonly selectionStart: number;
  readonly selectionEnd: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitOnEnter?: boolean;
  maxLength?: number;
  renderFormatting?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

const externalChange = Annotation.define<boolean>();

class MathWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly openLength: number, readonly html: string) { super(); }
  eq(other: MathWidget) { return this.source === other.source && this.from === other.from && this.openLength === other.openLength; }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "zyra-composer-math";
    span.innerHTML = this.html;
    span.setAttribute("aria-label", this.source);
    span.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from + this.openLength } });
      view.focus();
    });
    return span;
  }
}

const mathInteraction = StateEffect.define<{ focused?: boolean; composing?: boolean }>();
function mathDecorations(state: EditorState, focused: boolean, composing: boolean): DecorationSet {
  if (composing) return Decoration.none;
  const selections = state.selection.ranges;
  return Decoration.set(composerMathRanges(state.doc.toString())
    .filter(({ from, to }) => !focused || !selections.some((range) => (range.from < to && range.to > from) || (range.empty && range.from > from && range.from < to)))
    .flatMap(({ from, to, source }) => {
      try {
        const html = katex.renderToString(`\\displaystyle ${source}`, { throwOnError: true, displayMode: false });
        const openLength = state.doc.sliceString(from, from + 1) === "$" && state.doc.sliceString(from, from + 2) !== "$$" ? 1 : 2;
        return [Decoration.replace({ widget: new MathWidget(source, from, openLength, html) }).range(from, to)];
      } catch {
        // Keep incomplete or invalid LaTeX editable instead of replacing it with an error widget.
        return [];
      }
    }));
}
export const mathRendering = StateField.define<{ decorations: DecorationSet; focused: boolean; composing: boolean }>({
  create: (state) => ({ decorations: mathDecorations(state, false, false), focused: false, composing: false }),
  update(value, transaction) {
    let { focused, composing } = value;
    for (const effect of transaction.effects) if (effect.is(mathInteraction)) {
      focused = effect.value.focused ?? focused;
      composing = effect.value.composing ?? composing;
    }
    return { focused, composing, decorations: mathDecorations(transaction.state, focused, composing) };
  },
  provide: field => [
    EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).decorations),
  ],
});

export function composerFormattingRanges(text: string) {
  const pattern = /```[\s\S]*?```|`[^`\n]+`|\*\*((?:\$[^$\n]+\$|[^*$\n])+?)\*\*|\*((?:\$[^$\n]+\$|[^*$\n])+?)\*|\[([^\]\n]{1,500})\]\(([^\s()]{1,2048})\)/g;
  return Array.from(text.matchAll(pattern), match => {
    const from = match.index, to = from + match[0].length;
    if (match[0].startsWith("```")) return null;
    const kind = match[0].startsWith("`") ? "code" : match[1] !== undefined ? "bold" : match[2] !== undefined ? "italic" : safeDiscussionLink(match[4]) ? "link" : "text";
    const start = kind === "bold" ? 2 : 1;
    const end = kind === "link" || kind === "text" ? match[0].indexOf("](") : match[0].length - start;
    return { from, to, contentFrom: from + start, contentTo: from + end, kind };
  }).filter((range): range is NonNullable<typeof range> => range !== null);
}

export const formattingRendering = StateField.define<DecorationSet>({
  create: state => formattingDecorations(state),
  update: (_value, transaction) => formattingDecorations(transaction.state),
  provide: field => EditorView.decorations.from(field),
});
function formattingDecorations(state: EditorState) {
  const decorations: ReturnType<Decoration["range"]>[] = [];
  const { focused, composing } = state.field(mathRendering);
  if (composing) return Decoration.none;
  const math = composerMathRanges(state.doc.toString());
  for (const range of composerFormattingRanges(state.doc.toString())) {
    if (math.some(item => item.from <= range.from && item.to >= range.to)) continue;
    if (focused && state.selection.ranges.some(selection => selection.from < range.to && selection.to > range.from || selection.empty && selection.from > range.from && selection.from < range.to)) continue;
    decorations.push(Decoration.replace({}).range(range.from, range.contentFrom));
    decorations.push(Decoration.mark({ class: `zyra-composer-${range.kind}` }).range(range.contentFrom, range.contentTo));
    decorations.push(Decoration.replace({}).range(range.contentTo, range.to));
  }
  return Decoration.set(decorations, true);
}

/** Selection offsets refer to the original string, including math delimiters. */
export const ZyraComposerInput = React.forwardRef<ZyraComposerInputHandle, Props>(function ZyraComposerInput(props, ref) {
  const ariaLabel = props["aria-label"] ?? props.placeholder ?? "Pesan";
  const host = React.useRef<HTMLDivElement>(null);
  const editor = React.useRef<EditorView | null>(null);
  const latest = React.useRef(props);
  latest.current = props;
  const editable = React.useMemo(() => new Compartment(), []);
  const hint = React.useMemo(() => new Compartment(), []);
  const label = React.useMemo(() => new Compartment(), []);
  const undo = React.useMemo(() => new Compartment(), []);

  React.useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus(),
    insertText: (text) => {
      const view = editor.current;
      if (!view || latest.current.disabled) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input" });
      view.focus();
    },
    setSelectionRange: (start, end) => {
      const view = editor.current;
      if (!view) return;
      const length = view.state.doc.length;
      view.dispatch({ selection: { anchor: Math.max(0, Math.min(start, length)), head: Math.max(0, Math.min(end, length)) } });
    },
    get selectionStart() { return editor.current?.state.selection.main.from ?? 0; },
    get selectionEnd() { return editor.current?.state.selection.main.to ?? 0; },
  }), []);

  React.useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({ parent: host.current, state: EditorState.create({
      doc: latest.current.value,
      extensions: [
        undo.of(history()), mathRendering,
        ...(latest.current.renderFormatting ? [formattingRendering] : []),
        EditorState.transactionFilter.of(transaction => {
          if (transaction.annotation(externalChange)) return transaction;
          const limit = latest.current.maxLength;
          return limit && transaction.newDoc.length > limit && transaction.newDoc.length > transaction.startState.doc.length ? [] : transaction;
        }),
        EditorView.domEventHandlers({
          focus: (_event, view) => { view.dispatch({ effects: mathInteraction.of({ focused: true }) }); },
          blur: (_event, view) => { view.dispatch({ effects: mathInteraction.of({ focused: false }) }); },
          compositionstart: (_event, view) => { view.dispatch({ effects: mathInteraction.of({ composing: true }) }); },
          compositionend: (_event, view) => { view.dispatch({ effects: mathInteraction.of({ composing: false }) }); },
        }),
        editable.of([EditorView.editable.of(!latest.current.disabled), EditorState.readOnly.of(!!latest.current.disabled)]),
        hint.of(editorPlaceholder(latest.current.placeholder ?? "")),
        label.of(EditorView.contentAttributes.of({ "aria-label": latest.current["aria-label"] ?? latest.current.placeholder ?? "Pesan", role: "textbox", "aria-multiline": "true", "aria-disabled": String(!!latest.current.disabled) })),
        keymap.of([{ key: "Shift-Enter", run: insertNewline }, { key: "Mod-Shift-z", run: redo, preventDefault: true }, { key: "Enter", run: (v) => { if (v.composing || v.state.field(mathRendering).composing || latest.current.disabled || latest.current.submitOnEnter === false) return false; latest.current.onSubmit(); return true; } }, ...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalChange))) latest.current.onChange(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { fontSize: "inherit", minHeight: "36px", maxHeight: "160px" },
          ".cm-scroller": { overflow: "auto", maxHeight: "160px", fontFamily: "inherit" },
          ".cm-content": { minHeight: "36px", padding: "4px", caretColor: "currentColor" },
          ".cm-line": { lineHeight: "1.65" },
          "&.cm-focused": { outline: "none" },
          ".cm-placeholder": { color: "var(--muted-foreground)" },
          ".zyra-composer-bold": { fontWeight: "bold" },
          ".zyra-composer-italic": { fontStyle: "italic" },
          ".zyra-composer-code": { fontFamily: "monospace", backgroundColor: "var(--muted)" },
          ".zyra-composer-link": { color: "var(--primary)", textDecoration: "underline" },
          ".zyra-composer-math": { display: "inline-block", verticalAlign: "baseline", cursor: "text" },
        }),
      ],
    }) });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, [editable, hint, label, undo]);

  React.useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== props.value) {
      // A sent message or another conversation must not remain in draft undo history.
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: props.value }, annotations: externalChange.of(true), effects: undo.reconfigure([]) });
      view.dispatch({ effects: undo.reconfigure(history()) });
    }
  }, [props.value, undo]);
  React.useEffect(() => { editor.current?.dispatch({ effects: editable.reconfigure([EditorView.editable.of(!props.disabled), EditorState.readOnly.of(!!props.disabled)]) }); }, [props.disabled, editable]);
  React.useEffect(() => { editor.current?.dispatch({ effects: hint.reconfigure(editorPlaceholder(props.placeholder ?? "")) }); }, [props.placeholder, hint]);
  React.useEffect(() => { editor.current?.dispatch({ effects: label.reconfigure(EditorView.contentAttributes.of({ "aria-label": ariaLabel, role: "textbox", "aria-multiline": "true", "aria-disabled": String(!!props.disabled) })) }); }, [ariaLabel, props.disabled, label]);

  return <div ref={host} data-editor-disabled={!!props.disabled} className={props.className} />;
});
