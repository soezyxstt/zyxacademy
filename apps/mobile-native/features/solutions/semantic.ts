import type { SolutionPart as ArticlePart } from "../../../../packages/native-parity/student/assessment/solution-contract";

function displayMath(latex?: string) {
  if (!latex?.trim() || /^(?:\$|\\[[(])/.test(latex.trim())) return latex;
  return `$$${latex.trim()}$$`;
}

export function partText(part: ArticlePart): string {
  switch (part.kind) {
    case "markdown": return part.markdown;
    case "math_unit": return [displayMath(part.latex), ...(part.relations?.flatMap((relation) => [displayMath(relation.latex), displayMath(relation.conditionLatex), relation.meaningMarkdown, relation.conditionsMarkdown]) ?? []),
      part.meaningMarkdown, part.conditionsMarkdown, ...(part.symbolDefinitions?.flatMap((symbol) => [displayMath(symbol.latex), symbol.meaningMarkdown, symbol.conditionsMarkdown]) ?? [])].filter(Boolean).join("\n\n");
    case "worked_example": return [part.title, part.problemMarkdown, ...part.steps.flatMap((step) => [step.operationMarkdown, ...step.parts.map(partText), step.reasonMarkdown, step.conditionsMarkdown]), part.verificationMarkdown].filter(Boolean).join("\n\n");
    case "code_example": {
      let fenceLength = 3;
      for (const match of part.code.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
      const fence = "`".repeat(fenceLength);
      return `${fence}\n${part.code}\n${fence}`;
    }
    case "visual_ref": case "coding_exercise": return "";
  }
}
