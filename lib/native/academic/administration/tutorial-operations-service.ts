import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  executeAdminAssignTutorialSession, executeAdminCancelTutorialSession, executeAdminCreateTutorAvailability,
  executeAdminDeleteTutorAvailability, executeAdminMoveTutorialSession, executeAdminUpdateTutorCourses,
} from "@/app/(admin)/admin/(academic)/schedules/actions";
import { bookings, tutorCourses, tutorSlots } from "@/db/schema";
import type { DbExecutor } from "@/lib/auth/tutor-access";
import { triggerGoogleCalendarSyncForBookingId } from "@/lib/google-calendar/trigger";
import { tutorialBookingRevision, tutorialSlotRevision, tutorQualificationRevision } from "@/lib/schedule/admin-tutorial-revisions";
import { lockTutorAssignmentChanges } from "@/lib/auth/authoring-actor";
import type { AdminTutorialCommand } from "@/packages/academic/admin-tutorial-operations";
import type { NativeAdminViewer } from "./admin-transaction";
import { runAdminCommand } from "./admin-command-receipt";

function assertSuccess(result: { success: boolean; reason?: string }) {
  if (!result.success) throw new Error(result.reason || "DATABASE_ERROR");
}

export async function saveNativeTutorialOperation(command: AdminTutorialCommand, requestId: string, viewer: NativeAdminViewer) {
  let previousTutor: string | undefined;
  const result = await runAdminCommand("native_admin_tutorial", command, requestId, viewer, async tx => {
    const executor: DbExecutor = tx;
    const options = { executor, actorId: viewer.user.id, requestId, deferEffects: true };
    if (command.action === "create-availability") {
      const written = await executeAdminCreateTutorAvailability(command, options);
      assertSuccess(written);
      if (!written.slotId) throw new Error("DATABASE_ERROR");
      return written.slotId;
    }
    if (command.action === "qualifications") {
      await lockTutorAssignmentChanges(tx, command.id);
      const existing = await tx.select({ courseId: tutorCourses.courseId }).from(tutorCourses).where(eq(tutorCourses.tutorId, command.id));
      if (tutorQualificationRevision(command.id, existing.map(row => row.courseId)) !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
      assertSuccess(await executeAdminUpdateTutorCourses(command.id, command.courseIds, options));
      return command.id;
    }
    if (command.action === "delete-availability" || command.action === "assign") {
      const [slot] = await tx.select().from(tutorSlots).where(eq(tutorSlots.id, command.id)).limit(1).for("update");
      if (!slot) throw new Error("SLOT_NOT_FOUND");
      if (tutorialSlotRevision(slot) !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (command.action === "delete-availability") {
        assertSuccess(await executeAdminDeleteTutorAvailability({ slotId: command.id, reason: command.reason }, options));
        return command.id;
      }
      const written = await executeAdminAssignTutorialSession({ ...command, slotId: command.id }, options);
      assertSuccess(written);
      if (!written.bookingId) throw new Error("DATABASE_ERROR");
      return written.bookingId;
    }
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, command.id)).limit(1).for("update");
    if (!booking) throw new Error("BOOKING_NOT_FOUND");
    if (tutorialBookingRevision(booking) !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
    if (command.action === "move") {
      const [target] = await tx.select().from(tutorSlots).where(eq(tutorSlots.id, command.targetSlotId)).limit(1).for("update");
      if (!target) throw new Error("TARGET_SLOT_NOT_FOUND");
      if (tutorialSlotRevision(target) !== command.expectedTargetRevision) throw new Error("REVISION_CONFLICT");
      const [source] = await tx.select({ tutorId: tutorSlots.tutorId }).from(tutorSlots).where(eq(tutorSlots.id, booking.slotId)).limit(1);
      previousTutor = source?.tutorId;
      assertSuccess(await executeAdminMoveTutorialSession({ ...command, bookingId: command.id }, options));
    } else {
      assertSuccess(await executeAdminCancelTutorialSession({ ...command, bookingId: command.id }, options));
    }
    return command.id;
  });

  if (!result.replay) {
    revalidatePath("/admin/schedules");
    revalidatePath("/tutor/schedule");
    if (command.action === "delete-availability" || command.action === "move" || command.action === "assign" || command.action === "cancel") {
      revalidatePath("/dashboard/schedule");
    }
    if (command.action === "move") await triggerGoogleCalendarSyncForBookingId(result.id, [previousTutor]);
    if (command.action === "assign" || command.action === "cancel") await triggerGoogleCalendarSyncForBookingId(result.id);
  }
  return result;
}
