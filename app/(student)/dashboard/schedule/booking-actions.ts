"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tutorSlots } from "@/db/schema";
import { collaborativeBookSlot } from "./actions";

export type BookTutorialSlotInput = {
  slotId: string;
  courseId: string;
  groupId: string;
  topic?: string;
  preSessionNotes?: string;
};

/**
 * Browser-facing booking contract. The client never supplies the session date:
 * tutor_slots.session_date is the canonical source and is revalidated by the
 * transactional booking action before insert.
 */
export async function bookTutorialSlot(input: BookTutorialSlotInput) {
  const slotId = input.slotId?.trim();
  const courseId = input.courseId?.trim();
  const groupId = input.groupId?.trim();

  if (!slotId || !courseId || !groupId) {
    return {
      success: false as const,
      error: "Slot, mata kuliah, dan kelompok wajib dipilih.",
      reason: "BOOKING_INPUT_REQUIRED",
    };
  }

  const slotRows = await db
    .select({ sessionDate: tutorSlots.sessionDate })
    .from(tutorSlots)
    .where(eq(tutorSlots.id, slotId))
    .limit(1);
  const sessionDate = slotRows[0]?.sessionDate?.trim() || "";

  if (!sessionDate) {
    return {
      success: false as const,
      error: "Slot jadwal tidak ditemukan atau belum memiliki tanggal sesi.",
      reason: "SLOT_NOT_BOOKABLE",
    };
  }

  return collaborativeBookSlot(slotId, courseId, groupId, sessionDate, {
    topic: input.topic,
    preSessionNotes: input.preSessionNotes,
  });
}
