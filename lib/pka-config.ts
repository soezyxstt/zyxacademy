/** Shared constants for the Tutorial PKA campaign (see lib/pka-simulation.ts). */

/** Hardcoded course id; this campaign is a single seasonal course, not a general category. */
export const PKA_COURSE_ID = "tutorial-pka";

export const PKA_SUBJECTS = ["matematika", "fisika", "kimia"] as const;
export type PkaSubject = (typeof PKA_SUBJECTS)[number];

export const PKA_SUBJECT_LABELS: Record<PkaSubject, string> = {
  matematika: "Matematika",
  fisika: "Fisika",
  kimia: "Kimia",
};

export const PKA_STAGES = [1, 2, 3] as const;
export type PkaStage = (typeof PKA_STAGES)[number];

/** Number of live tutorial sessions held before the actual PKA pretest. */
export const PKA_TOTAL_SESSIONS = 6;

/**
 * Estimated PKA test date shown on the countdown. ITB does not publish this
 * date to Zyx; keep the UI copy explicit that it is an estimate, not official.
 */
export const PKA_ASSUMED_TEST_DATE = new Date("2026-07-23T00:00:00+07:00");

export const PKA_DISCLAIMER =
  "Simulasi ini dibuat oleh Zyx Academy untuk latihan mandiri; bukan hasil PKA resmi ITB. Hasil dan keputusan SCL resmi hanya dikeluarkan oleh Ditsama ITB.";
