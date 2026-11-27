import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { academicSchedules, courses } from "@/db/schema";
import { triggerGoogleCalendarSyncForScheduleChange } from "@/lib/google-calendar/trigger";
import { academicEventView, deleteAcademicEvent, insertAcademicEvent, updateAcademicEvent } from "@/lib/schedule/academic-event";
import type { AcademicEventCommand } from "@/packages/academic/admin-schedule-events";
import type { NativeAdminViewer } from "./admin-transaction";
import { runAdminCommand } from "./admin-command-receipt";

export async function saveNativeAcademicEvent(command: AcademicEventCommand, key: string, viewer: NativeAdminViewer) {
  const result = await runAdminCommand("native_academic_event", command, key, viewer, async tx => {
    if (command.action !== "create") {
      const [existing] = await tx.select().from(academicSchedules).where(eq(academicSchedules.id, command.id)).for("update");
      if (!existing) throw new Error("NOT_FOUND");
      if (academicEventView(existing).revision !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (command.action === "delete") {
        await deleteAcademicEvent(tx, command.id);
        return command.id;
      }
    }
    const data = command.fields;
    if (data.courseId) {
      const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, data.courseId)).for("key share");
      if (!course) throw new Error("INVALID_INPUT");
    }
    const fields = { ...data, startDate: new Date(data.startDate), endDate: data.endDate ? new Date(data.endDate) : null };
    if (command.action === "create") return insertAcademicEvent(tx, viewer.user.id, fields);
    await updateAcademicEvent(tx, command.id, fields);
    return command.id;
  });
  if (!result.replay) {
    revalidatePath("/admin/schedules");
    revalidatePath("/dashboard/schedule");
    await triggerGoogleCalendarSyncForScheduleChange({ includeCentral: true });
  }
  return result;
}
