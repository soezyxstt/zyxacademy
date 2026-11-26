import { eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { sendOptionalEmail } from "@/lib/email-preferences/send";
import { renderScheduleEventEmail } from "@/lib/notifications/email-templates";
import { sendToMany } from "@/lib/notifications/send";
import { tutorTicketDecisionPayload, tutorTicketMessagePayload } from "@/lib/notifications/templates";

type Ticket = { groupId: string; courseId: string };

export async function notifyTutorTicketDecision(ticket: Ticket & { type: "reschedule" | "cancellation" }, decision: "approved" | "rejected", notes: string | null, client: Pick<typeof db, "select"> = db) {
  try {
    const memberRows = await client
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, ticket.groupId));

    const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
    if (memberUserIds.length > 0) {
      await sendToMany(memberUserIds, tutorTicketDecisionPayload({
        ticketType: ticket.type,
        decision,
        notes: notes || null,
        courseTitle: (await resolveCourseIdentity(ticket.courseId).catch(() => null))?.title,
      }));
      if (process.env.RESEND_API_KEY) {
        await Promise.allSettled(
          memberUserIds.map((uid: string) =>
            sendOptionalEmail({
              userId: uid,
              category: "events_and_schedules",
              render: (locale) => {
                const isEn = locale === "en";
                const typeLabel = ticket.type === "reschedule"
                  ? "Reschedule"
                  : isEn ? "Cancellation" : "Pembatalan";
                const decisionLabel = decision === "approved"
                  ? isEn ? "approved" : "disetujui"
                  : isEn ? "declined" : "ditolak";
                return renderScheduleEventEmail({
                  locale,
                  recipientName: isEn ? "Student" : "Siswa",
                  title: isEn
                    ? `${typeLabel} request ${decisionLabel}`
                    : `Tiket ${typeLabel} ${decisionLabel}`,
                  summary: notes || (isEn
                    ? `Your tutor has ${decisionLabel} the ${typeLabel.toLowerCase()} request.`
                    : `Pengajar telah memutuskan tiket ${typeLabel.toLowerCase()} (${decisionLabel}).`),
                  details: [
                    { label: isEn ? "Request" : "Jenis tiket", value: typeLabel },
                    { label: isEn ? "Decision" : "Keputusan", value: decisionLabel },
                  ],
                  link: "/dashboard/schedule",
                });
              },
            }),
          ),
        );
      }
    }
  } catch (notifErr) {
    console.error("[TUTOR_SCHEDULE] Ticket decision notification error:", notifErr);
  }
}

export async function notifyTutorTicketReply(ticket: Ticket, messageText: string, senderName: string | null, client: Pick<typeof db, "select"> = db) {
  try {
    const memberRows = await client
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, ticket.groupId));

    const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
    if (memberUserIds.length > 0) {
      await sendToMany(memberUserIds, tutorTicketMessagePayload(
        messageText,
        "/dashboard/schedule",
        { courseTitle: (await resolveCourseIdentity(ticket.courseId).catch(() => null))?.title, senderName: senderName ?? undefined },
      ));
    }
  } catch (notifErr) {
    console.error("[TUTOR_SCHEDULE] Ticket message notification error:", notifErr);
  }
}
