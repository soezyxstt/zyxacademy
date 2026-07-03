import { PKA_COURSE_ID } from "@/lib/pka-config";

/**
 * Per-course Zyra capability map. Client-safe (no server imports).
 * The Tutorial PKA course limits Zyra to tutor chat and mistake feedback;
 * explain mode, study plans, and in-drawer micro-apps stay off.
 */
export interface TutorCapabilities {
  chat: boolean;
  mistake: boolean;
  explain: boolean;
  studyPlan: boolean;
  microApps: boolean;
}

const ALL_ON: TutorCapabilities = {
  chat: true,
  mistake: true,
  explain: true,
  studyPlan: true,
  microApps: true,
};

const PKA_CAPS: TutorCapabilities = {
  chat: true,
  mistake: true,
  explain: false,
  studyPlan: false,
  microApps: false,
};

export function getTutorCapabilities(courseId: string | null | undefined): TutorCapabilities {
  if (courseId === PKA_COURSE_ID) return PKA_CAPS;
  return ALL_ON;
}
