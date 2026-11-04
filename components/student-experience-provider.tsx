"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoEvent, DemoOverlay } from "@/lib/demo/session-overlay";

export type StudentExperienceAdapter = {
  mode: "student" | "demo";
  courseHref: (courseId: string) => string;
  route: (view: string, courseId?: string) => string;
  baseline: readonly PublicDemoSnapshot[];
  selectedCourseId: string | null;
  overlay: DemoOverlay | null;
  ready: boolean;
  record?: (kind: DemoEvent["kind"], id: string, grade?: number) => void;
  reset?: () => void;
};
const defaultAdapter: StudentExperienceAdapter = {
  mode: "student", courseHref: (id) => `/courses/${encodeURIComponent(id)}`,
  route: (view, id) => id ? `/courses/${encodeURIComponent(id)}/${view}` : `/${view}`,
  baseline: [], selectedCourseId: null, overlay: null, ready: true,
};
const Context = createContext<StudentExperienceAdapter>(defaultAdapter);
export function StudentExperienceProvider({ value, children }: { value: StudentExperienceAdapter; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStudentExperience() { return useContext(Context); }
