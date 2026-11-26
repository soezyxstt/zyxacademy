import type { VisualSpec } from "../../../../lib/materials/visual-contract";

export type SolutionPart =
  | { id: string; kind: "markdown"; markdown: string }
  | { id: string; kind: "math_unit"; latex?: string; meaningMarkdown: string; conditionsMarkdown?: string;
      relations?: { latex: string; conditionLatex?: string; meaningMarkdown: string; conditionsMarkdown?: string }[];
      symbolDefinitions?: { latex: string; meaningMarkdown: string; conditionsMarkdown?: string }[] }
  | { id: string; kind: "worked_example"; title: string; problemMarkdown: string; verificationMarkdown: string;
      steps: { operationMarkdown: string; reasonMarkdown: string; conditionsMarkdown?: string; parts: SolutionPart[] }[] }
  | { id: string; kind: "code_example"; code: string }
  | { id: string; kind: "visual_ref"; visualId: string }
  | { id: string; kind: "coding_exercise" };

export type SolutionProvenance = { attribution: string; sources: { title: string; locator: string; url?: string }[] };
export type SolutionItem = {
  id: string;
  title: string;
  template: "choice" | "calculation" | "conceptual" | "code_trace" | "code_construction";
  prompt: SolutionPart[];
  options: { id: string; parts: SolutionPart[] }[];
  answer: { optionIds: string[]; parts: SolutionPart[] };
  hintMarkdown?: string;
  strategy: SolutionPart[];
  steps: { id: string; operationMarkdown: string; reasonMarkdown: string; conditionsMarkdown?: string; parts?: SolutionPart[] }[];
  verification: SolutionPart[];
  misconceptions?: { id: string; misconceptionMarkdown: string; correctionMarkdown: string }[];
  visuals: VisualSpec[];
  provenance: { problem: SolutionProvenance; solution: SolutionProvenance };
};
export type SolutionCollection = { title: string; chapter: { title: string }; items: SolutionItem[] };
