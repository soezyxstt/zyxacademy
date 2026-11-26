import { createContext, useContext } from "react";
import type { ExecutionResult } from "../../../../../lib/coding/contracts";

export type CourseZyraContextInput =
  | { kind: "selection"; snippet: string; sectionTitle?: string; chapterTitle?: string }
  | { kind: "playground"; code: string; stdin: string; execution: ExecutionResult | null;
      intent: "review" | "explain_error" | "hint" | "decompose" | "flowchart" | "generate" };

export type CourseZyraHandoff = { id: string; pathname: string; input: CourseZyraContextInput };
export const CourseZyraContext = createContext<((input: CourseZyraContextInput) => void) | undefined>(undefined);

export const useOpenCourseZyra = () => useContext(CourseZyraContext);
