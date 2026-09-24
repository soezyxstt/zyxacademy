import type { ReactNode } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";
import { normalizeMathInText } from "@/lib/math/math-normalizer";
import { QuestionImage } from "@/components/course/question-image";

type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

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

function isEscaped(input: string, index: number) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i--) slashCount++;
  return slashCount % 2 === 1;
}

function findDelimiter(input: string, delimiter: string, from: number) {
  for (let i = from; i < input.length; i++) {
    if (input.startsWith(delimiter, i) && !isEscaped(input, i)) return i;
  }
  return -1;
}

function pushText(segments: Segment[], value: string) {
  if (value) segments.push({ type: "text", value });
}

function parseMathText(input: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const startsDisplayDollar = input.startsWith("$$", cursor) && !isEscaped(input, cursor);
    const startsInlineDollar = input[cursor] === "$" && !startsDisplayDollar && !isEscaped(input, cursor);
    const startsDisplayBracket = input.startsWith("\\[", cursor) && !isEscaped(input, cursor);
    const startsInlineParen = input.startsWith("\\(", cursor) && !isEscaped(input, cursor);

    if (startsDisplayDollar || startsInlineDollar || startsDisplayBracket || startsInlineParen) {
      const open = startsDisplayDollar ? "$$" : startsInlineDollar ? "$" : startsDisplayBracket ? "\\[" : "\\(";
      const close = startsDisplayDollar ? "$$" : startsInlineDollar ? "$" : startsDisplayBracket ? "\\]" : "\\)";
      const display = startsDisplayDollar || startsDisplayBracket;
      const closeIndex = findDelimiter(input, close, cursor + open.length);

      if (closeIndex !== -1) {
        pushText(segments, input.slice(0, cursor));
        const math = input.slice(cursor + open.length, closeIndex).trim();
        if (math) segments.push({ type: "math", value: math, display });

        const rest = input.slice(closeIndex + close.length);
        return [...segments, ...parseMathText(rest)];
      }
    }

    cursor++;
  }

  pushText(segments, input);
  return segments;
}

function renderMath(value: string, displayMode: boolean) {
  return katex.renderToString(value, { ...katexOptions, displayMode });
}

function renderMathSegments(text: string, bareMath = false): ReactNode[] {
  const normalized = bareMath ? text : normalizeMathInText(text);
  const mathReadyText = bareMath && normalized.trim() ? `$$${normalized.trim()}$$` : normalized;
  const segments = parseMathText(mathReadyText);

  return segments.map((segment, index): ReactNode => {
    if (segment.type === "text") return <span key={index}>{segment.value}</span>;

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
