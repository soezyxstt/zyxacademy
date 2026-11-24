import { memo, type ReactNode } from "react";
import { renderKatexToString } from "@/lib/math/katex-render";
import { safeDiscussionLink } from "@/lib/discussions/markdown-policy";

function MathValue({ value, display = false }: { value: string; display?: boolean }) {
  if (value.length > 1000) return <code>{value}</code>;
  let html: string | null = null;
  try {
    html = renderKatexToString(value, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxExpand: 100, maxSize: 20 });
  } catch {
    html = null;
  }
  if (html === null) return <code>{value}</code>;
  if (display) {
    return (
      <div
        className="my-1 block max-w-full overflow-x-auto py-0.5 [&_.katex-display]:my-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <span className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: html }} />;
}

type MentionRenderer = (handle: string) => ReactNode;

const INLINE_PATTERN =
  /!\[([^\]\n]{0,500})\]\([^\n)]{0,2048}\)|\[([^\]\n]{1,500})\]\(([^\s()]{1,2048})\)|\*\*((?:\$[^$\n]+\$|\\\((?:\\(?!\))|[^\\\n])+\\\)|\\(?!\()|[^*$\\\n])+)\*\*|\*((?:\$[^$\n]+\$|\\\((?:\\(?!\))|[^\\\n])+\\\)|\\(?!\()|[^*$\\\n])+)\*|`([^`\n]+)`|\$([^$\n]+)\$|\\\(((?:\\(?!\))|[^\\\n])+)\\\)|(?<![\p{L}\p{N}_@])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu;

const HEADING_LINE = /^#{1,3}\s+(\S.*)$/;

function inline(text: string, mathBudget: { remaining: number; renderMention?: MentionRenderer }, depth = 0): ReactNode[] {
  if (depth >= 4) return [text];
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index;
    if (index > offset) nodes.push(text.slice(offset, index));
    if (match[1] !== undefined) nodes.push(match[1]);
    else if (match[2] !== undefined) {
      const href = safeDiscussionLink(match[3]);
      nodes.push(href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{match[2]}</a> : match[2]);
    } else if (match[4] !== undefined) nodes.push(<strong key={index}>{inline(match[4], mathBudget, depth + 1)}</strong>);
    else if (match[5] !== undefined) nodes.push(<em key={index}>{inline(match[5], mathBudget, depth + 1)}</em>);
    else if (match[6] !== undefined) nodes.push(<code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{match[6]}</code>);
    else if (match[7] !== undefined) nodes.push(mathBudget.remaining-- > 0 ? <MathValue key={index} value={match[7]} /> : match[0]);
    else if (match[8] !== undefined) nodes.push(mathBudget.remaining-- > 0 ? <MathValue key={index} value={match[8]} /> : match[0]);
    else if (match[9]) nodes.push(<span key={index}>{mathBudget.renderMention?.(match[9]) ?? match[0]}</span>);
    offset = index + match[0].length;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes;
}

function renderParagraphSegment(paragraph: string, keyPrefix: string, mathBudget: { remaining: number; renderMention?: MentionRenderer }): ReactNode[] {
  const lines = paragraph.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*[-*] /.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*] /, ""));
        i++;
      }
      elements.push(
        <ul key={`${keyPrefix}-ul-${i}`} className="list-disc space-y-1 pl-5">
          {listItems.map((item, idx) => <li key={idx}>{inline(item, mathBudget)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\. /.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={`${keyPrefix}-ol-${i}`} className="list-decimal space-y-1 pl-5">
          {listItems.map((item, idx) => <li key={idx}>{inline(item, mathBudget)}</li>)}
        </ol>
      );
      continue;
    }

    const headingMatch = line.match(HEADING_LINE);
    if (headingMatch) {
      elements.push(
        <p key={`${keyPrefix}-h-${i}`} className="font-heading font-semibold text-foreground">
          {inline(headingMatch[1], mathBudget)}
        </p>
      );
      i++;
      continue;
    }

    const proseLines: string[] = [];
    while (
      i < lines.length &&
      !/^\s*[-*] /.test(lines[i]) &&
      !/^\s*\d+\. /.test(lines[i]) &&
      !HEADING_LINE.test(lines[i])
    ) {
      proseLines.push(lines[i]);
      i++;
    }
    const proseText = proseLines.join("\n").trim();
    if (proseText) {
      elements.push(
        <p key={`${keyPrefix}-p-${i}`} className="whitespace-pre-wrap">
          {inline(proseText, mathBudget)}
        </p>
      );
    }
  }

  return elements;
}

export const DiscussionMarkdown = memo(function DiscussionMarkdown({ content, renderMention }: { content: string; renderMention?: MentionRenderer }) {
  if (content.length > 20_000) return <p className="whitespace-pre-wrap break-words text-body-sm leading-relaxed">{content}</p>;
  const blocks = content.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g);
  const mathBudget = { remaining: 30, renderMention };
  return <div className="min-w-0 space-y-2 break-words text-body-sm leading-relaxed">
    {blocks.map((block, index) => {
      if (!block) return null;
      if (block.startsWith("```") && block.endsWith("```")) {
        const code = block.slice(3, -3).replace(/^[^\n]*\n/, "");
        return <pre key={index} className="overflow-x-auto rounded-md bg-muted p-2.5 text-body-xs"><code>{code}</code></pre>;
      }
      if ((block.startsWith("$$") && block.endsWith("$$")) || (block.startsWith("\\[") && block.endsWith("\\]"))) {
        const expr = block.slice(2, -2).trim();
        if (!expr) return null;
        return mathBudget.remaining-- > 0
          ? <MathValue key={index} value={expr} display />
          : <p key={index} className="whitespace-pre-wrap">{block}</p>;
      }
      return block
        .split(/\n{2,}/)
        .filter((part) => part.trim().length > 0)
        .flatMap((paragraph, part) => renderParagraphSegment(paragraph, `${index}-${part}`, mathBudget));
    })}
  </div>;
});
