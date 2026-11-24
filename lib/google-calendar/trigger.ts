import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { account, bookingRescheduleTickets, bookings, googleCalendarSync, groupMembers, tutorSlots } from "@/db/schema";
import { inngest } from "@/jobs/client";
import { minutesFrom } from "@/lib/date-utils";
import { centralCalendarConfigured } from "./central";
import { hasCalendarScope } from "./shared";

async function enqueueSingleTarget(target: string, userId: string | null): Promise<boolean> {
  await db
    .insert(googleCalendarSync)
    .values({ target, userId })
    .onConflictDoNothing();

  const { requestedAt, shouldEnqueue } = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ requestedAt: googleCalendarSync.requestedAt })
      .from(googleCalendarSync)
      .where(eq(googleCalendarSync.target, target))
      .for("update");
    const requestedAt = new Date();
    const shouldEnqueue = !current?.requestedAt || current.requestedAt < minutesFrom(-15);
    await tx
      .update(googleCalendarSync)
      .set({ requestedAt, ...(shouldEnqueue ? { error: null } : {}) })
      .where(eq(googleCalendarSync.target, target));
    return { requestedAt, shouldEnqueue };
  });

  if (!shouldEnqueue) return false;

  try {
    await inngest.send({
      name: "google-calendar/sync.requested",
      data: { target },
    });
    return true;
  } catch (error) {
    await db
      .update(googleCalendarSync)
      .set({ requestedAt: null, error: "failed" })
      .where(
        and(
          eq(googleCalendarSync.target, target),
          eq(googleCalendarSync.requestedAt, requestedAt),
        ),
      );
    console.error("[GOOGLE_CALENDAR_TRIGGER] Failed to enqueue sync:", target, error);
    return false;
  }
}

export interface ScheduleCalendarSyncTriggerInput {
  userIds?: Iterable<string | null | undefined>;
  groupIds?: Iterable<string | null | undefined>;
  includeCentral?: boolean;
}

/**
 * Best-effort enqueue of Google Calendar sync for affected connected users
 * and optionally the central Zyx calendar after a schedule mutation.
 * Never throws so calendar sync issues cannot block core schedule operations.
 */
export async function triggerGoogleCalendarSyncForScheduleChange(
  input: ScheduleCalendarSyncTriggerInput,
): Promise<string[]> {
  try {
    const candidateUserIds = new Set<string>();
    for (const rawId of input.userIds ?? []) {
      const id = rawId?.trim();
      if (id) candidateUserIds.add(id);
    }

    const cleanGroupIds = [
      ...new Set(
        Array.from(input.groupIds ?? [])
          .map((id) => id?.trim() ?? "")
          .filter(Boolean),
      ),
    ];

    if (cleanGroupIds.length > 0) {
      const members = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(inArray(groupMembers.groupId, cleanGroupIds));
      for (const member of members) {
        if (member.userId) candidateUserIds.add(member.userId);
      }
    }

    const targets: Array<{ target: string; userId: string | null }> = [];

    if (candidateUserIds.size > 0) {
      const connectedAccounts = await db
        .select({ userId: account.userId, scope: account.scope })
        .from(account)
        .where(
          and(
            eq(account.providerId, "google"),
            inArray(account.userId, [...candidateUserIds]),
            isNotNull(account.refreshToken),
          ),
        );

      const eligibleUsers = new Set<string>();
      for (const row of connectedAccounts) {
        if (row.userId && hasCalendarScope(row.scope)) {
          eligibleUsers.add(row.userId);
        }
      }

      for (const userId of eligibleUsers) {
        targets.push({ target: `user:${userId}`, userId });
      }
    }

    if (input.includeCentral && centralCalendarConfigured()) {
      targets.push({ target: "central", userId: null });
    }

    const enqueued: string[] = [];
    for (const item of targets) {
      try {
        const sent = await enqueueSingleTarget(item.target, item.userId);
        if (sent) enqueued.push(item.target);
      } catch (error) {
        console.error("[GOOGLE_CALENDAR_TRIGGER] Target enqueue error:", item.target, error);
      }
    }

    return enqueued;
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_TRIGGER] Failed to trigger schedule sync:", error);
    return [];
  }
}

/**
 * Looks up a booking's tutor and study group and enqueues best-effort Google
 * Calendar sync for connected participants and the central calendar.
 */
export async function triggerGoogleCalendarSyncForBookingId(
  bookingId: string | null | undefined,
  extraUserIds: Iterable<string | null | undefined> = [],
): Promise<string[]> {
  const id = bookingId?.trim();
  if (!id) return [];
  try {
    const [row] = await db
      .select({
        groupId: bookings.groupId,
        tutorId: tutorSlots.tutorId,
      })
      .from(bookings)
      .leftJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .where(eq(bookings.id, id))
      .limit(1);

    if (!row) return [];
    return triggerGoogleCalendarSyncForScheduleChange({
      userIds: [row.tutorId, ...extraUserIds],
      groupIds: [row.groupId],
      includeCentral: true,
    });
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_TRIGGER] Failed booking lookup for sync:", id, error);
    return [];
  }
}

export async function triggerGoogleCalendarSyncForRescheduleTicketId(ticketId: string) {
  try {
    const [ticket] = await db
      .select({ bookingId: bookingRescheduleTickets.bookingId })
      .from(bookingRescheduleTickets)
      .where(eq(bookingRescheduleTickets.id, ticketId))
      .limit(1);
    return triggerGoogleCalendarSyncForBookingId(ticket?.bookingId);
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_TRIGGER] Failed ticket lookup for sync:", ticketId, error);
    return [];
  }
}
