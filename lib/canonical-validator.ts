import katex from "@/lib/math/katex";

/**
 * Validates a string and compiles any LaTeX math blocks with KaTeX to verify syntax validity.
 */
export function validateKaTeXInString(text: string): string[] {
  const errors: string[] = [];
  
  // Match $$ block equations
  const blockMatches = text.match(/\$\$([\s\S]*?)\$\$/g) || [];
  for (const match of blockMatches) {
    const equation = match.slice(2, -2).trim();
    try {
      katex.renderToString(equation, { displayMode: true, throwOnError: true });
    } catch (err: any) {
      errors.push(`KaTeX block compile failure for "${equation}": ${err?.message || err}`);
    }
  }
  
  // Replace $$ block equations with placeholders before doing inline searches to avoid nested matches
  let inlineSearchText = text;
  for (const match of blockMatches) {
    inlineSearchText = inlineSearchText.replace(match, "BLOCK_PLACEHOLDER");
  }
  
  // Match inline $ equations
  const inlineMatches = inlineSearchText.match(/\$(.*?)\$/g) || [];
  for (const match of inlineMatches) {
    const equation = match.slice(1, -1).trim();
    
    // Ignore single dollar symbols (e.g. currency) or simple letters/digits
    if (!equation || equation.match(/^\d+$/) || equation.match(/^[a-zA-Z]$/) || equation === "") {
      continue;
    }
    
    try {
      katex.renderToString(equation, { displayMode: false, throwOnError: true });
    } catch (err: any) {
      errors.push(`KaTeX inline compile failure for "${equation}": ${err?.message || err}`);
    }
  }
  
  return errors;
}

/**
 * Deterministically validates Canonical Markdown structure before ingestion.
 */
export function validateCanonicalMarkdown(markdown: string): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  // 1. Heading Hierarchy Check
  let hasH1 = false;
  let prevLevel = 0;
  const headingPattern = /^(#{1,6})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(headingPattern);
    if (match) {
      const level = match[1].length;
      if (level === 1) {
        hasH1 = true;
      } else {
        if (level > prevLevel + 1 && prevLevel > 0) {
          errors.push(
            `Line ${i + 1}: Heading hierarchy nesting mismatch. H${level} cannot directly follow H${prevLevel}.`
          );
        }
      }
      prevLevel = level;
    }
  }

  if (!hasH1) {
    errors.push("Document must contain at least one H1 title (e.g., '# Title').");
  }

  // 2. Container Syntax Check (::: open/close balance)
  const containerStack: { type: string; line: number }[] = [];
  const containerOpenPattern = /^:::([a-zA-Z_]+)(?:\s+({[^}]+}))?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(":::")) {
      if (line === ":::") {
        // Closing a container
        if (containerStack.length === 0) {
          errors.push(`Line ${i + 1}: Closing container ':::' found with no matching opening tag.`);
        } else {
          containerStack.pop();
        }
      } else {
        // Opening a container
        const match = line.match(containerOpenPattern);
        if (match) {
          const type = match[1];
          containerStack.push({ type, line: i + 1 });
        } else {
          errors.push(`Line ${i + 1}: Malformed container declaration '${line}'.`);
        }
      }
    }
  }

  while (containerStack.length > 0) {
    const open = containerStack.pop()!;
    errors.push(`Line ${open.line}: Unclosed container of type '${open.type}'.`);
  }

  // 3. LaTeX Equation Compile Checks
  const latexErrors = validateKaTeXInString(markdown);
  errors.push(...latexErrors);

  return {
    success: errors.length === 0,
    errors,
  };
}
