import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { completeTutorSessionAction } from "@/app/(student)/dashboard/schedule/actions";
import { db } from "@/db";
import { bookingResources, bookings, tutorSlots } from "@/db/schema";
import { hasPeran } from "@/lib/auth/authorization";
import { checkTutorCourseAccess } from "@/lib/auth/tutor-access";
import { uploadScheduleAttachment } from "@/lib/schedule/attachment-upload";
import { addBookingResource, deleteBookingResource, getBookingResources, type SessionResource } from "@/lib/schedule/session-resources";
import { mergeBookingResources } from "@/lib/schedule/tutor-read-model";
import { joinKey, sanitizeFilename, slugifySegment } from "@/lib/storage/keys";
import { canReadGroupFile } from "@/lib/storage/scoped-file-authorization";
import { storage } from "@/lib/storage";
import type { CourseAccessDbExecutor } from "@/lib/student/course-access";
import { safeScheduleLink, writableSchedulePhase, type NativeScheduleResources, type ScheduleCommand, type ScheduleRole } from "@/packages/native-parity/schedule/resources";
import { matchesScheduleFile, resourceDownloadKey, scopedUploadId } from "./resource-file";

export type ScheduleViewer = { userId: string; sessionId: string; role: ScheduleRole };

export async function readScheduleBooking(viewer: ScheduleViewer, bookingId: string, executor: CourseAccessDbExecutor = db, lock = false) {
  const client = executor as typeof db;
  const query = client.select({ booking: bookings, tutorId: tutorSlots.tutorId }).from(bookings)
    .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id)).where(eq(bookings.id, bookingId)).limit(1);
  const [row] = await (lock ? query.for("update", { of: bookings }) : query);
  if (!row) return null;
  const { booking, tutorId } = row;
  const tutor = viewer.role === "tutor";
  const allowed = tutor
    ? tutorId === viewer.userId && (await checkTutorCourseAccess(viewer.userId, booking.courseId, { allowAdmin: false }, executor)).hasAccess
    : await canReadGroupFile(booking, viewer.userId, executor);
  if (!allowed) return null;
  return { booking, canWrite: writableSchedulePhase(viewer.role, booking.status) };
}

type ScheduleAccess = NonNullable<Awaited<ReturnType<typeof readScheduleBooking>>>;

const nativeId = (resource: SessionResource) => createHash("sha256").update(resource.id).digest("hex");
const canDelete = (viewer: ScheduleViewer, access: ScheduleAccess, resource: SessionResource) =>
  access.canWrite === resource.phase && resource.metadata?.legacy !== true &&
  (viewer.role === "tutor" || resource.createdById === viewer.userId);

export async function scheduleResources(viewer: ScheduleViewer, access: ScheduleAccess, executor: CourseAccessDbExecutor = db) {
  const normalized = await getBookingResources(access.booking.id, { actorId: viewer.userId, executor });
  if (!normalized.success) throw new Error("Schedule resources unavailable");
  return mergeBookingResources(access.booking, normalized.resources);
}

export function scheduleResourceList(viewer: ScheduleViewer, access: ScheduleAccess, resources: SessionResource[]): NativeScheduleResources {
  const { booking } = access;
  return {
    bookingId: booking.id, status: booking.status, topic: booking.topic, preNotes: booking.preSessionNotes,
    postNotes: booking.postSessionNotes, location: booking.location, meetUrl: booking.googleMeetUrl ? safeScheduleLink(booking.googleMeetUrl) : null,
    canWrite: access.canWrite,
    resources: resources.map(resource => {
      const file = resource.kind === "file";
      const url = file ? null : safeScheduleLink(resource.url);
      return {
        id: nativeId(resource), label: resource.label, phase: resource.phase, kind: resource.kind, url,
        available: file ? booking.status !== "cancelled" && !!resourceDownloadKey(booking.id, resource.phase, resource.url) : Boolean(url),
        canDelete: canDelete(viewer, access, resource),
      };
    }),
  };
}

export function scheduleDownload(access: ScheduleAccess, resources: SessionResource[], id: string) {
  if (access.booking.status === "cancelled") return null;
  const resource = resources.find(entry => entry.kind === "file" && nativeId(entry) === id);
  return resource ? resourceDownloadKey(access.booking.id, resource.phase, resource.url) : null;
}

function revalidateSchedule() {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/tutor/schedule");
}

export async function updateScheduleResources(viewer: ScheduleViewer, access: ScheduleAccess, command: ScheduleCommand) {
  if (!access.canWrite) return null;
  if (command.action === "summary") {
    if (access.canWrite !== "post") return null;
    const result = await completeTutorSessionAction(access.booking.id, command.notes);
    return result.success ? { id: access.booking.id } : null;
  }
  const receipt = await db.transaction(async tx => {
    const current = await readScheduleBooking(viewer, access.booking.id, tx, true);
    if (!current?.canWrite) return null;
    const options = { actorId: viewer.userId, executor: tx };
    if (command.action === "delete") {
      const resource = (await scheduleResources(viewer, current, tx)).find(value => nativeId(value) === command.id);
      if (!resource || !canDelete(viewer, current, resource)) return null;
      const result = await deleteBookingResource(resource.id, options);
      return result.success ? { id: command.id } : null;
    }
    const url = safeScheduleLink(command.url);
    if (!url || (command.kind === "recording" && current.canWrite !== "post")) return null;
    const result = await addBookingResource({
      bookingId: current.booking.id, phase: current.canWrite, kind: command.kind, label: command.label, url,
    }, options);
    return result.success ? { id: nativeId(result.resource) } : null;
  });
  if (receipt) revalidateSchedule();
  return receipt;
}

export async function saveScheduleAttachment(viewer: ScheduleViewer, bookingId: string, requestId: string, file: File, mime: string) {
  const id = scopedUploadId(viewer.sessionId, bookingId, requestId);
  const data = Buffer.from(await file.arrayBuffer());
  if (!matchesScheduleFile(data, mime)) return { status: 415 } as const;
  const digest = createHash("sha256").update(data).digest("hex");
  const receipt = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`zyx:schedule:upload:${id}`}, 0))`);
    const access = await readScheduleBooking(viewer, bookingId, tx);
    if (!access?.canWrite) return { status: 403 } as const;
    const phase = access.canWrite;
    const [prior] = await tx.select().from(bookingResources)
      .where(and(eq(bookingResources.id, id), eq(bookingResources.bookingId, bookingId))).limit(1);
    if (prior) {
      return prior.createdById === viewer.userId && prior.phase === phase && prior.mimeType === mime &&
        prior.fileName === file.name && prior.metadata?.sha256 === digest
        ? { status: 200, id: createHash("sha256").update(id).digest("hex") } as const
        : { status: 409 } as const;
    }
    const kind = phase === "pre" ? "pre_session" : "post_session";
    const objectKey = joinKey("schedules", slugifySegment(bookingId, "booking"), kind, `${id}-${sanitizeFilename(file.name)}`);
    const upload = await uploadScheduleAttachment({ bookingId, kind, file, mime, userId: viewer.userId, objectKey, bytes: data });
    const current = await readScheduleBooking(viewer, bookingId, tx, true);
    if (current?.canWrite !== phase || !(await hasPeran(viewer.userId, viewer.role))) {
      await storage.delete(objectKey).catch(() => {});
      return { status: 403 } as const;
    }
    const result = await addBookingResource({
      bookingId, phase, kind: "file", label: file.name, url: upload.url,
      fileName: file.name, mimeType: mime, sizeBytes: upload.size, metadata: { sha256: digest },
    }, { actorId: viewer.userId, executor: tx, resourceId: id });
    // Keep the private object on an uncertain database result. Repeating the same request can recover it.
    return result.success ? { status: 200, id: nativeId(result.resource) } as const : { status: 503 } as const;
  });
  if (receipt.status === 200) revalidateSchedule();
  return receipt;
}
