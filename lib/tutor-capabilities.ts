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
  imageInput: boolean;
  canvas: boolean;
  muridExperience: boolean;
  pet: boolean;
}

const IMAGE_INPUT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1 === "1";
const CANVAS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ZYRA_LEARNING_CANVAS_V1 === "1";
const MURID_EXPERIENCE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ZYRA_MURID_V3 === "1";
const PET_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ZYRA_PET_V1 === "1";

const ALL_ON: TutorCapabilities = {
  chat: true,
  mistake: true,
  explain: true,
  studyPlan: true,
  microApps: true,
  imageInput: IMAGE_INPUT_ENABLED,
  canvas: CANVAS_ENABLED,
  muridExperience: MURID_EXPERIENCE_ENABLED,
  pet: PET_ENABLED,
};

const PKA_CAPS: TutorCapabilities = {
  chat: true,
  mistake: true,
  explain: false,
  studyPlan: false,
  microApps: false,
  imageInput: IMAGE_INPUT_ENABLED,
  canvas: CANVAS_ENABLED,
  muridExperience: MURID_EXPERIENCE_ENABLED,
  pet: PET_ENABLED,
};

export function getTutorCapabilities(courseId: string | null | undefined): TutorCapabilities {
  if (courseId === PKA_COURSE_ID) return PKA_CAPS;
  return ALL_ON;
}
