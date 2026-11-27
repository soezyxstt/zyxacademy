"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { writeTutorSlotCourses } from "@/lib/schedule/replace-slot-courses";
import { db } from "@/db";
import { tutorSlotCourses, tutorSlotNotes } from "@/db/schedule-extras";
import { tutorSlots } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  addTutorSlotAction,
  deleteTutorSlotAction,
  updateTutorSlotAction,
} from "@/app/(tutor)/tutor/schedule/actions";
import type { IndonesianDay } from "@/lib/date-utils";
import {
  isMissingTutorSlotCoursesTable,
  normalizeSlotCourseIds,
} from "@/lib/schedule/slot-courses";

export type AddTutorSlotWithNotesInput = {
  dayOfWeek: IndonesianDay;
  startTime: string;
  endTime: string;
  mode: "online" | "offline";
  location?: string;
  sessionDate?: string;
  notes?: string;
  courseIds?: string[];
};

export type UpdateTutorSlotWithNotesInput = AddTutorSlotWithNotesInput & {
  slotId: string;
};

function errorChainMessage(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current != null && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
    } else if (typeof current === "object") {
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string") messages.push(message);
    } else {
      messages.push(String(current));
    }
    current = typeof current === "object"
      ? (current as { cause?: unknown }).cause
      : undefined;
  }

  return messages.join(" ");
}

function isMissingTutorSlotNotesTable(error: unknown): boolean {
  return /(?:no such table:\s*tutor_slot_notes|relation\s+"?tutor_slot_notes"?\s+does not exist)/i.test(
    errorChainMessage(error),
  );
}

async function replaceTutorSlotCourses(slotId: string, courseIds: readonly string[]) {
  await db.transaction(tx => writeTutorSlotCourses(tx, slotId, courseIds));
}

export async function addTutorSlotWithNotesAction(
  input: AddTutorSlotWithNotesInput,
) {
  const notes = input.notes?.trim() ?? "";
  const courseIds = normalizeSlotCourseIds(input.courseIds).slice(0, 50);
  const result = await addTutorSlotAction({
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    mode: input.mode,
    location: input.location,
    sessionDate: input.sessionDate,
  });

  if (!result.success) {
    return result;
  }

  if (!result.slotId) {
    return result;
  }

  if (notes) {
    try {
      await db.insert(tutorSlotNotes).values({
        slotId: result.slotId,
        notes,
      });
    } catch (error) {
      console.error("Failed to persist tutor slot notes", error);
      await deleteTutorSlotAction({ slotId: result.slotId }).catch(() => undefined);
      return {
        success: false as const,
        error: isMissingTutorSlotNotesTable(error)
          ? "Schema catatan slot belum tersedia pada database. Slot dibatalkan agar data tidak tersimpan setengah."
          : "Slot tidak disimpan karena catatan tutor gagal disimpan. Coba lagi.",
        reason: isMissingTutorSlotNotesTable(error)
          ? "SCHEDULE_SCHEMA_NOT_READY"
          : "SLOT_NOTES_PERSIST_FAILED",
      };
    }
  }

  if (courseIds.length > 0) {
    try {
      await replaceTutorSlotCourses(result.slotId, courseIds);
    } catch (error) {
      console.error("Failed to persist tutor slot courses", error);
      await deleteTutorSlotAction({ slotId: result.slotId }).catch(() => undefined);
      return {
        success: false as const,
        error: isMissingTutorSlotCoursesTable(error)
          ? "Schema pilihan mata kuliah slot belum tersedia pada database. Slot dibatalkan agar pembatasan tidak terlewat."
          : "Slot tidak disimpan karena pilihan mata kuliah gagal disimpan. Coba lagi.",
        reason: isMissingTutorSlotCoursesTable(error)
          ? "SCHEDULE_SCHEMA_NOT_READY"
          : "SLOT_COURSES_PERSIST_FAILED",
      };
    }
  }

  if (notes || courseIds.length > 0) {
    revalidatePath("/tutor/schedule");
    revalidatePath("/dashboard/schedule");
  }

  return result;
}

export async function updateTutorSlotWithNotesAction(
  input: UpdateTutorSlotWithNotesInput,
) {
  const { notes, courseIds, ...slot } = input;
  const result = await updateTutorSlotAction(slot, notes ?? "");
  if (!result.success) return result;

  if (Array.isArray(courseIds)) {
    const normalized = normalizeSlotCourseIds(courseIds).slice(0, 50);
    try {
      await replaceTutorSlotCourses(slot.slotId, normalized);
      revalidatePath("/tutor/schedule");
      revalidatePath("/dashboard/schedule");
    } catch (error) {
      if (normalized.length === 0 && isMissingTutorSlotCoursesTable(error)) {
        return result;
      }
      console.error("Failed to update tutor slot courses", error);
      return {
        success: false as const,
        error: isMissingTutorSlotCoursesTable(error)
          ? "Schema pilihan mata kuliah slot belum tersedia pada database."
          : "Pilihan mata kuliah slot gagal diperbarui. Coba lagi.",
        reason: isMissingTutorSlotCoursesTable(error)
          ? "SCHEDULE_SCHEMA_NOT_READY"
          : "SLOT_COURSES_PERSIST_FAILED",
      };
    }
  }

  return result;
}

export async function getTutorSlotNotesAction(slotIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const ids = Array.from(new Set(slotIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return {} as Record<string, string>;

  try {
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
  } catch (error) {
    if (isMissingTutorSlotNotesTable(error)) {
      console.error("Schedule schema is missing tutor_slot_notes; returning empty notes until migration is applied.");
      return {} as Record<string, string>;
    }
    throw error;
  }
}

export async function getTutorSlotCoursesAction(slotIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const ids = Array.from(new Set(slotIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return {} as Record<string, string[]>;

  try {
    const rows = await db
      .select({
        slotId: tutorSlotCourses.slotId,
        courseId: tutorSlotCourses.courseId,
      })
      .from(tutorSlotCourses)
      .innerJoin(tutorSlots, eq(tutorSlots.id, tutorSlotCourses.slotId))
      .where(
        and(
          inArray(tutorSlotCourses.slotId, ids),
          eq(tutorSlots.tutorId, session.user.id),
        ),
      );

    const bySlot: Record<string, string[]> = {};
    for (const row of rows) {
      if (!bySlot[row.slotId]) bySlot[row.slotId] = [];
      bySlot[row.slotId].push(row.courseId);
    }
    return bySlot;
  } catch (error) {
    if (isMissingTutorSlotCoursesTable(error)) {
      console.error("Schedule schema is missing tutor_slot_courses; returning unrestricted slots until migration is applied.");
      return {} as Record<string, string[]>;
    }
    throw error;
  }
}
