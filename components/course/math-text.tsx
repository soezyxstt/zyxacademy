import type { ReactNode } from "react";
import katex from "@/lib/math/katex";
import { cn } from "@/lib/utils";
import { normalizeMathInText } from "@/lib/math/math-normalizer";
import { splitScientificText } from "@/lib/math/text-segments";
import { QuestionImage } from "@/components/course/question-image";

type MathTextProps = {
  children: string | null | undefined;
  className?: string;
  as?: "span" | "div" | "p";
  /** Render a formula-only field that contains LaTeX without delimiters. */
  bareMath?: boolean;
};

const katexOptions = {
  throwOnError: false,
  strict: false,
  trust: false,
};

const IMAGE_MARKDOWN_REGEX = /!\[(.*?)\]\(((?:data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=\s]+)|(?:https?:\/\/[^\s)]+)|\/api\/storage\/[^\s)]+|[^\s)]+)\)/g;

const MARKDOWN_TOKEN_REGEX = /(?:\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\))|(?:(https?:\/\/[^\s<)]+))|(?:\*\*([^\*]+?)\*\*)|(?:\*([^\*]+?)\*)|(?:`([^`]+?)`)/g;

function renderInlineMarkdown(text: string, baseKey: string): ReactNode[] {
  if (!text) return [];
  text = text.replace(/\\\$/g, "$");

  const nodes: ReactNode[] = [];
  const regex = new RegExp(MARKDOWN_TOKEN_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const subKey = `${baseKey}-${match.index}`;

    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={subKey}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary underline underline-offset-2 hover:text-brand-primary/80 transition-colors cursor-pointer"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      nodes.push(
        <a
          key={subKey}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary underline underline-offset-2 hover:text-brand-primary/80 transition-colors break-all cursor-pointer"
        >
          {match[3]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={subKey} className="font-semibold text-foreground">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      nodes.push(
        <em key={subKey} className="italic">
          {match[5]}
        </em>
      );
    } else if (match[6]) {
      nodes.push(
        <code
          key={subKey}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-xs text-foreground border border-border/50"
        >
          {match[6]}
        </code>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMath(value: string, displayMode: boolean) {
  return katex.renderToString(value, { ...katexOptions, displayMode });
}

function renderMathSegments(text: string, bareMath = false): ReactNode[] {
  const segments = bareMath && text.trim()
    ? [{ type: "math" as const, value: text.trim(), display: true }]
    : splitScientificText(text).flatMap((segment) => segment.type === "text"
      ? splitScientificText(normalizeMathInText(segment.value))
      : [segment]);

  return segments.map((segment, index): ReactNode => {
    if (segment.type === "code") {
      return segment.display
        ? <span key={index} className="block overflow-x-auto whitespace-pre-wrap"><code>{segment.value}</code></span>
        : <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-xs">{segment.value}</code>;
    }
    if (segment.type === "text") {
      const rendered = renderInlineMarkdown(segment.value, `seg-${index}`);
      return <span key={index}>{rendered}</span>;
    }

    return (
      <span
        key={index}
        className={cn(
          segment.display
            ? "my-3 block overflow-x-auto overflow-y-hidden py-1"
            : "inline",
        )}
        dangerouslySetInnerHTML={{ __html: renderMath(segment.value, segment.display) }}
      />
    );
  });
}

export function MathText({ children, className, as = "span", bareMath = false }: MathTextProps) {
  const rawText = children ?? "";
  const Component = as;

  if (!rawText.includes("![")) {
    return (
      <Component className={cn("math-text", className)}>
        {renderMathSegments(rawText, bareMath)}
      </Component>
    );
  }

  // Split content by markdown images so QuestionImage is rendered as a block sibling outside inline/paragraph tags
  const parts: ReactNode[] = [];
  const regex = new RegExp(IMAGE_MARKDOWN_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = rawText.slice(lastIndex, match.index);
      if (textChunk) {
        parts.push(
          <Component key={`chunk-${lastIndex}`} className={cn("math-text", className)}>
            {renderMathSegments(textChunk, bareMath)}
          </Component>
        );
      }
    }
    const alt = match[1] || "";
    const src = match[2] || "";
    parts.push(
      <QuestionImage
        key={`img-${match.index}`}
        src={src}
        alt={alt}
      />
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    const trailingChunk = rawText.slice(lastIndex);
    if (trailingChunk) {
      parts.push(
        <Component key={`chunk-${lastIndex}`} className={cn("math-text", className)}>
          {renderMathSegments(trailingChunk, bareMath)}
        </Component>
      );
    }
  }

  return <>{parts}</>;
}
