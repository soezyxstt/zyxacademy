import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, bookings } from "@/db/schema";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "@/lib/auth/native-admin-session";
import { createGoogleMeetSpace, GoogleMeetRequestRejected } from "@/lib/google-meet";
import { triggerGoogleCalendarSyncForBookingId } from "@/lib/google-calendar/trigger";

export async function pendingBookingMeets(viewer: NativeAdminViewer, after: string | null) {
  return db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer);
    const rows = await tx.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.mode, "online"), eq(bookings.status, "scheduled"), isNull(bookings.googleMeetUrl), after ? gt(bookings.id, after) : undefined,
    )).orderBy(asc(bookings.id)).limit(26);
    const ids = rows.slice(0, 25).map(row => row.id);
    return { ids, next: rows.length > ids.length ? ids.at(-1) : undefined };
  });
}

type Result = { status: "ready" | "skipped" | "uncertain" | "rejected"; url?: string };

// Google Meet spaces.create has no idempotency key. All booking entry points reserve
// the same booking before the provider call, including simultaneous web and app requests.
export async function provisionBookingMeet(id: string, viewer?: NativeAdminViewer): Promise<Result> {
  const receipt = "schedule_meet:" + id;
  const statuses = viewer ? ["scheduled"] as const : ["scheduled", "rescheduled"] as const;
  const target = and(eq(bookings.id, id), eq(bookings.mode, "online"), inArray(bookings.status, [...statuses]));
  const claim = await db.transaction(async tx => {
    if (viewer) await assertNativeAdminTransaction(tx, viewer);
    const [booking] = await tx.select({ url: bookings.googleMeetUrl }).from(bookings).where(target).for("update");
    if (!booking) return { status: "skipped" } as const;
    if (booking.url) return { status: "ready", url: booking.url } as const;
    const [reservation] = await tx.insert(auditMutasi).values({ id: receipt, actorId: viewer?.user.id, entityType: "tutorial_booking",
      entityId: id, action: "provision_meet", afterSnapshot: { state: "reserved" } }).onConflictDoNothing().returning({ id: auditMutasi.id });
    if (!reservation) {
      // The provider result may have arrived while the booking was cancelled or offline.
      const [prior] = await tx.select({ data: auditMutasi.afterSnapshot }).from(auditMutasi).where(eq(auditMutasi.id, receipt));
      const { url, space } = prior?.data ?? {};
      if (typeof url !== "string" || typeof space !== "string") return { status: "uncertain" } as const;
      await tx.update(bookings).set({ googleMeetUrl: url, googleMeetSpaceName: space }).where(target);
      return { status: "restored", url } as const;
    }
    return { status: "reserved" } as const;
  });
  if (claim.status === "restored") {
    await triggerGoogleCalendarSyncForBookingId(id);
    return { status: "ready", url: claim.url };
  }
  if (claim.status !== "reserved") return claim;
  let space;
  try {
    space = await createGoogleMeetSpace({ moderation: "ON", accessType: "OPEN" });
  } catch (error) {
    if (error instanceof GoogleMeetRequestRejected) {
      await db.delete(auditMutasi).where(eq(auditMutasi.id, receipt));
      return { status: "rejected" };
    }
    // A lost response can mean a space exists. Retain the reservation for reconciliation.
    await db.update(auditMutasi).set({ outcome: "failed", afterSnapshot: { state: "uncertain" } }).where(eq(auditMutasi.id, receipt));
    return { status: "uncertain" };
  }
  if (!space.name || !space.meetingUri) return { status: "uncertain" };
  const url = space.meetingUri;
  const saved = await db.transaction(async tx => {
    const [booking] = await tx.update(bookings).set({ googleMeetUrl: url, googleMeetSpaceName: space.name })
      .where(and(target, isNull(bookings.googleMeetUrl))).returning({ id: bookings.id });
    await tx.update(auditMutasi).set({ outcome: "success", afterSnapshot: { state: "created", url, space: space.name } }).where(eq(auditMutasi.id, receipt));
    return Boolean(booking);
  });
  if (!saved) return { status: "skipped" };
  await triggerGoogleCalendarSyncForBookingId(id);
  return { status: "ready", url };
}
