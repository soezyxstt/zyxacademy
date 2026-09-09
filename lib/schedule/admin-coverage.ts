export const ADMIN_COVERAGE_STATUSES = [
  "Belum submit",
  "Ada availability",
  "Low availability",
  "Fully booked",
] as const;

export type AdminCoverageStatus = (typeof ADMIN_COVERAGE_STATUSES)[number];

export interface AdminCoverageRow {
  tutorId: string;
  tutorName: string;
  slotsOpened: number;
  booked: number;
  available: number;
  status: AdminCoverageStatus;
}

/**
 * Keeps the weekly operations signal intentionally small and derived from
 * concrete rows. A tutor has low availability when at most one slot remains
 * or when the remaining capacity is at most 25 percent of opened slots.
 */
export function deriveAdminCoverageStatus(
  slotsOpened: number,
  booked: number,
): AdminCoverageStatus {
  if (slotsOpened <= 0) return "Belum submit";

  const available = Math.max(0, slotsOpened - Math.max(0, booked));
  if (available === 0) return "Fully booked";

  if (available <= 1 || available / slotsOpened <= 0.25) {
    return "Low availability";
  }

  return "Ada availability";
}

type CoverageTutor = {
  id: string;
  name?: string | null;
};

type CoverageSlot = {
  tutorId: string;
  sessionDate?: string | null;
  booking?: { status?: string | null } | null;
};

/** Builds rows in tutor-name order so the admin view is stable and scannable. */
export function buildAdminCoverage(
  tutors: CoverageTutor[],
  slots: CoverageSlot[],
): AdminCoverageRow[] {
  return tutors
    .map((tutor) => {
      const tutorSlots = slots.filter(
        (slot) => slot.tutorId === tutor.id && Boolean(slot.sessionDate),
      );
      const booked = tutorSlots.filter(
        (slot) => slot.booking && slot.booking.status !== "cancelled",
      ).length;
      const slotsOpened = tutorSlots.length;
      const available = Math.max(0, slotsOpened - booked);

      return {
        tutorId: tutor.id,
        tutorName: tutor.name?.trim() || "Tutor tanpa nama",
        slotsOpened,
        booked,
        available,
        status: deriveAdminCoverageStatus(slotsOpened, booked),
      } satisfies AdminCoverageRow;
    })
    .sort((a, b) => a.tutorName.localeCompare(b.tutorName, "id"));
}
