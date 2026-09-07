export type MaterialReaderMode = "learner" | "admin-preview";

export function isLearnerReaderMode(mode: MaterialReaderMode): boolean {
  return mode === "learner";
}
