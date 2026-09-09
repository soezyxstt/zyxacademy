"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tutorSlotNotes } from "@/db/schedule-extras";
import { tutorSlots } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  addTutorSlotAction,
  deleteTutorSlotAction,
} from "@/app/(tutor)/tutor/schedule/actions";
import type { IndonesianDay } from "@/lib/date-utils";

export type AddTutorSlotWithNotesInput = {
  dayOfWeek: IndonesianDay;
  startTime: string;
  endTime: string;
  mode: "online" | "offline";
  location?: string;
  sessionDate?: string;
  notes?: string;
};

export async function addTutorSlotWithNotesAction(
  input: AddTutorSlotWithNotesInput,
) {
  const notes = input.notes?.trim() ?? "";
  const result = await addTutorSlotAction({
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    mode: input.mode,
    location: input.location,
    sessionDate: input.sessionDate,
  });

  if (!result.success || !result.slotId || !notes) {
    return result;
  }

  try {
    await db.insert(tutorSlotNotes).values({
      slotId: result.slotId,
      notes,
    });
    revalidatePath("/tutor/schedule");
    return result;
  } catch (error) {
    console.error("Failed to persist tutor slot notes", error);
    await deleteTutorSlotAction({ slotId: result.slotId }).catch(() => undefined);
    return {
      success: false as const,
      error: "Slot tidak disimpan karena catatan tutor gagal disimpan. Coba lagi.",
      reason: "SLOT_NOTES_PERSIST_FAILED",
    };
  }
}

export async function getTutorSlotNotesAction(slotIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const ids = Array.from(new Set(slotIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return {} as Record<string, string>;

  const rows = await db
    .select({
      slotId: tutorSlotNotes.slotId,
      notes: tutorSlotNotes.notes,
    })
    .from(tutorSlotNotes)
    .innerJoin(tutorSlots, eq(tutorSlots.id, tutorSlotNotes.slotId))
    .where(
      and(
        inArray(tutorSlotNotes.slotId, ids),
        eq(tutorSlots.tutorId, session.user.id),
      ),
    );

  return Object.fromEntries(rows.map((row) => [row.slotId, row.notes]));
}
