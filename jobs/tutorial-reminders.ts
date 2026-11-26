import { and, eq, gt, gte, inArray, isNull, lte, notExists, or } from "drizzle-orm";
import { db } from "@/db";
import { bookingResources, bookings, courses, groupMembers, groups, pengguna, penggunaPeran, peran, tutorSlots, user } from "@/db/schema";
import { getActivityNotificationPreferences } from "@/lib/notifications/activity-preferences";
import { hasRecentNotificationByDedupeKey, sendToUser } from "@/lib/notifications/send";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import { formatJakartaDateKey } from "@/lib/notifications/interval-policy";
import { getAvailabilityReminderWeek, isDueTutorialEmail } from "@/lib/notifications/tutorial-reminder-policy";
import { renderTutorAvailabilityEmail, renderTutorialSession30mEmail, type TutorialReminderResource } from "@/lib/notifications/tutorial-reminder-emails";
import { extractStorageKey, scopedStorageFileKind } from "@/lib/storage/keys";
import { defineJob } from "./define-job";
import { mapConcurrent } from "./vector-sync";

function scheduledTick(data: Record<string, unknown>, now: Date) {
  if (typeof data.scheduledAt === "number" && Number.isFinite(data.scheduledAt)) return new Date(data.scheduledAt);
  return new Date(Math.floor(now.getTime() / 300_000) * 300_000);
}

// A protected storage route preserves access checks even if the email is forwarded.
function attachmentUrl(url: string, kind: string) {
  if (kind !== "file") return url;
  const key = extractStorageKey(url);
  return key && scopedStorageFileKind(key) === "tutorial"
    ? "/api/storage/file/" + key.split("/").map(encodeURIComponent).join("/")
    : null;
}

export const tutorAvailabilityReminderCron = defineJob(
  { id: "tutor-availability-reminder-cron", name: "Tutor availability reminder", triggers: [{ cron: "0 1 * * *" }] },
  async ({ event, step }) => step.run("notify-tutors", async () => {
    const now = new Date();
    const week = getAvailabilityReminderWeek(scheduledTick(event.data, now));
    if (week.dateKey !== formatJakartaDateKey(now)) return { sent: 0 };
    // Canonical tutor role and active account; an already booked or elapsed
    // slot still proves the tutor provided availability for the target week.
    const candidates = await db.selectDistinct({ id: user.id, name: user.name })
      .from(user).innerJoin(pengguna, eq(pengguna.id, user.id))
      .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id))
      .innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
      .where(and(eq(peran.code, "tutor"), eq(pengguna.status, "active"),
        notExists(db.select({ id: tutorSlots.id }).from(tutorSlots).where(and(
          eq(tutorSlots.tutorId, user.id), gte(tutorSlots.sessionDate, week.start), lte(tutorSlots.sessionDate, week.end),
        )))));
    let sent = 0;
    const failures: unknown[] = [];
    await mapConcurrent(candidates, 5, async (tutor) => {
      try {
        if (!(await getActivityNotificationPreferences(tutor.id)).tutorAvailabilityEnabled) return;
        // Recheck after fetching candidates so a slot added during the job stops reminders.
        const [slot] = await db.select({ id: tutorSlots.id }).from(tutorSlots).where(and(
          eq(tutorSlots.tutorId, tutor.id), gte(tutorSlots.sessionDate, week.start), lte(tutorSlots.sessionDate, week.end),
        )).limit(1);
        if (slot) return;
        const locale = (await getUserLocalePreference(tutor.id)) ?? DEFAULT_LOCALE;
        const dedupeKey = `tutor_availability:${week.dateKey}`;
        if (week.saturday && !(await hasRecentNotificationByDedupeKey({ userId: tutor.id, type: "tutor_reminder", dedupeKey }))) {
          const en = locale === "en";
          await sendToUser(tutor.id, {
            title: en ? "Add your tutorial availability" : "Isi jadwal ketersediaan tutorial",
            body: en ? "Add at least one slot for next week so students can book a tutorial." : "Tambahkan minimal satu slot untuk minggu depan agar siswa bisa memesan tutorial.",
            type: "tutor_reminder", link: "/tutor/schedule",
            metadata: { url: "/tutor/schedule", dedupeKey, locale },
          }, locale);
        }
        if (process.env.RESEND_API_KEY) {
          const result = await sendOptionalEmail({ userId: tutor.id, category: "events_and_schedules", locale,
            idempotencyKey: `availability/${tutor.id}/${week.dateKey}`,
            render: resolved => renderTutorAvailabilityEmail({ locale: resolved, name: tutor.name, start: week.start, end: week.end }) });
          if (result.status === "sent") sent++;
        }
      } catch (error) { failures.push(error); }
    });
    if (failures.length) throw new Error(`AVAILABILITY_REMINDER_FAILED:${failures.length}`);
    return { sent };
  }),
);

export const tutorialSessionEmailCron = defineJob(
  { id: "tutorial-session-email-cron", name: "Tutorial H-30 email", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ event, step }) => step.run("send-session-emails", async () => {
    if (!process.env.RESEND_API_KEY) return { sent: 0 };
    const now = new Date();
    const tick = scheduledTick(event.data, now);
    const dateKeys = [formatJakartaDateKey(tick), formatJakartaDateKey(new Date(tick.getTime() + 86_400_000))];
    const sessions = await db.select({
      id: bookings.id, groupId: bookings.groupId, groupName: groups.name, courseTitle: courses.title,
      tutorId: tutorSlots.tutorId, tutorName: user.name, date: bookings.sessionDate,
      startTime: bookings.startTime, endTime: bookings.endTime,
      slotStart: tutorSlots.startTime, slotEnd: tutorSlots.endTime,
      mode: bookings.mode, location: bookings.location, meetUrl: bookings.googleMeetUrl, topic: bookings.topic,
      pre: bookings.preSessionAttachments, post: bookings.postSessionAttachments,
      postLink: bookings.postSessionLinkUrl, postLinkTitle: bookings.postSessionLinkTitle,
    }).from(bookings).innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .innerJoin(groups, eq(bookings.groupId, groups.id)).innerJoin(courses, eq(bookings.courseId, courses.id))
      .innerJoin(user, eq(tutorSlots.tutorId, user.id))
      .where(and(eq(bookings.status, "scheduled"), eq(groups.status, "active"), or(isNull(groups.endDate), gt(groups.endDate, now)),
        inArray(bookings.sessionDate, dateKeys)));
    let sent = 0;
    const failures: unknown[] = [];
    for (const session of sessions) {
      const startTime = session.startTime ?? session.slotStart;
      const endTime = session.endTime ?? session.slotEnd;
      if (!session.date || !isDueTutorialEmail(session.date, startTime, tick, now)) continue;
      const date = session.date;
      const members = await db.select({ id: user.id, name: user.name }).from(groupMembers)
        .innerJoin(user, eq(groupMembers.userId, user.id)).innerJoin(pengguna, eq(user.id, pengguna.id))
        .where(and(eq(groupMembers.groupId, session.groupId), eq(pengguna.status, "active")));
      const recipients = new Map(members.map(member => [member.id, { ...member, audience: "student" as "student" | "tutor" }]));
      const [activeTutor] = await db.select({ id: pengguna.id }).from(pengguna)
        .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id)).innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
        .where(and(eq(pengguna.id, session.tutorId), eq(pengguna.status, "active"), eq(peran.code, "tutor"))).limit(1);
      if (activeTutor) recipients.set(session.tutorId, { id: session.tutorId, name: session.tutorName, audience: "tutor" });
      const normalized = await db.select().from(bookingResources).where(eq(bookingResources.bookingId, session.id));
      const resources: TutorialReminderResource[] = [];
      const urls = new Set<string>();
      const add = (label: string, raw: string, kind: string, fromTutor: boolean) => {
        const url = attachmentUrl(raw, kind);
        if (!url || urls.has(url)) return;
        urls.add(url);
        resources.push({ label, url, fromTutor });
      };
      for (const row of normalized) add(row.label, row.url, row.kind, row.createdById === session.tutorId || row.phase === "post");
      for (const phase of ["pre", "post"] as const) {
        if (!normalized.some(row => row.phase === phase && row.kind === "file")) {
          for (const row of session[phase] ?? []) add(row.name, row.url, "file", row.uploadedBy === session.tutorId || phase === "post");
        }
      }
      if (session.postLink && !normalized.some(row => row.phase === "post" && row.kind !== "file")) {
        add(session.postLinkTitle ?? "Tutorial resource", session.postLink, "link", true);
      }
      await mapConcurrent([...recipients.values()], 5, async (recipient) => {
        try {
          if (!(await getActivityNotificationPreferences(recipient.id)).tutorialSessionEmailEnabled) return;
          // Avoid sending a cancelled/rescheduled or already-started session from a delayed batch.
          const [current] = await db.select({ status: bookings.status, date: bookings.sessionDate, start: bookings.startTime, slot: bookings.slotId })
            .from(bookings).where(eq(bookings.id, session.id)).limit(1);
          if (!current || current.status !== "scheduled" || current.date !== date || (current.start ?? session.slotStart) !== startTime ||
              !isDueTutorialEmail(date, startTime, tick, new Date())) return;
          const result = await sendOptionalEmail({ userId: recipient.id, category: "events_and_schedules",
            idempotencyKey: `tutorial-h30/${session.id}/${date}/${startTime}/${recipient.id}`,
            render: locale => renderTutorialSession30mEmail({ locale, name: recipient.name, courseTitle: session.courseTitle,
              groupName: session.groupName, tutorName: session.tutorName, date, startTime, endTime,
              mode: session.mode, location: session.location, meetUrl: session.meetUrl, topic: session.topic,
              audience: recipient.audience, resources }),
          });
          if (result.status === "sent") sent++;
        } catch (error) { failures.push(error); }
      });
    }
    if (failures.length) throw new Error(`TUTORIAL_SESSION_EMAIL_FAILED:${failures.length}`);
    return { sent };
  }),
);
