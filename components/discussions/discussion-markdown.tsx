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
  return <span className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: html }} />;
}

function inline(text: string, mathBudget: { remaining: number }, depth = 0): ReactNode[] {
  if (depth >= 4) return [text];
  const nodes: ReactNode[] = [];
  const pattern = /!\[([^\]\n]{0,500})\]\([^\n)]{0,2048}\)|\[([^\]\n]{1,500})\]\(([^\s()]{1,2048})\)|\*\*((?:\$[^$\n]+\$|[^*$\n])+)\*\*|\*((?:\$[^$\n]+\$|[^*$\n])+)\*|`([^`\n]+)`|\$([^$\n]+)\$/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    nodes.push(text.slice(offset, index));
    if (match[1] !== undefined) nodes.push(match[1]);
    else if (match[2] !== undefined) {
      const href = safeDiscussionLink(match[3]);
      nodes.push(href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">{match[2]}</a> : match[2]);
    } else if (match[4] !== undefined) nodes.push(<strong key={index}>{inline(match[4], mathBudget, depth + 1)}</strong>);
    else if (match[5] !== undefined) nodes.push(<em key={index}>{inline(match[5], mathBudget, depth + 1)}</em>);
    else if (match[6] !== undefined) nodes.push(<code key={index} className="rounded bg-muted px-1 font-mono">{match[6]}</code>);
    else if (match[7] !== undefined) nodes.push(mathBudget.remaining-- > 0 ? <MathValue key={index} value={match[7]} /> : match[0]);
    offset = index + match[0].length;
  }
  nodes.push(text.slice(offset));
  return nodes;
}

export const DiscussionMarkdown = memo(function DiscussionMarkdown({ content }: { content: string }) {
  if (content.length > 20_000) return <p className="whitespace-pre-wrap break-words text-body-base">{content}</p>;
  const blocks = content.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g);
  const mathBudget = { remaining: 30 };
  return <div className="min-w-0 space-y-2 break-words text-body-base leading-relaxed">
    {blocks.map((block, index) => {
      if (block.startsWith("```") && block.endsWith("```")) {
        const code = block.slice(3, -3).replace(/^[^\n]*\n/, "");
        return <pre key={index} className="overflow-x-auto rounded-md bg-muted p-2 text-body-xs"><code>{code}</code></pre>;
      }
      if (block.startsWith("$$") && block.endsWith("$$")) return mathBudget.remaining-- > 0 ? <div key={index}><MathValue value={block.slice(2, -2)} display /></div> : <p key={index}>{block}</p>;
      return block.split(/\n{2,}/).filter(Boolean).map((paragraph, part) => {
        const lines = paragraph.split("\n");
        if (lines.every((line) => /^\s*[-*] /.test(line))) return <ul key={`${index}-${part}`} className="list-disc space-y-1 pl-5">{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*] /, ""), mathBudget)}</li>)}</ul>;
        if (lines.every((line) => /^\s*\d+\. /.test(line))) return <ol key={`${index}-${part}`} className="list-decimal space-y-1 pl-5">{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*\d+\. /, ""), mathBudget)}</li>)}</ol>;
        return <p key={`${index}-${part}`} className="whitespace-pre-wrap">{inline(paragraph, mathBudget)}</p>;
      });
    })}
  </div>;
});
