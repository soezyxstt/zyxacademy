/**
 * lib/notifications/templates.ts
 *
 * Pure functions that build notification payloads for each event type.
 * These are intentionally free of side-effects; they only return data.
 * Importing this file is safe in any environment (server, client, edge).
 */

import type { NotificationPayload } from "./types";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../../messages/id/notifications.json" with { type: "json" };
import enMessages from "../../messages/en/notifications.json" with { type: "json" };

const messages = { id: idMessages, en: enMessages } as const;

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Plain, bounded text for inbox cards and native notification banners. */
export function shortNotificationText(value: string | null | undefined, limit: number): string {
  if (!value) return "";
  const plain = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
  const chars = Array.from(plain);
  return chars.length > limit ? chars.slice(0, limit - 1).join("") + "…" : plain;
}

// ─── Quiz Published ───────────────────────────────────────────────────────────

export function quizPublishedPayload(
  quizTitle: string,
  courseTitle: string,
  quizUrl: string,
): NotificationPayload {
  return {
    title: shortNotificationText(interpolate(messages.id.push.quizPublished.title, { quizTitle }), 65),
    body: interpolate(messages.id.push.quizPublished.body, { quizTitle, courseTitle }),
    type: "quiz_published",
    link: quizUrl,
    metadata: {
      quizTitle,
      courseTitle,
      url: quizUrl,
    },
    systemTemplate: { key: "quiz_published", params: { quizTitle, courseTitle } },
  };
}

export function quizGradedPayload(input: {
  quizTitle: string;
  courseTitle: string;
  scoreLabel: string;
  link: string;
  attemptId?: string;
}): NotificationPayload {
  return {
    title: shortNotificationText(interpolate(messages.id.push.quizGraded.title, input), 65),
    body: interpolate(messages.id.push.quizGraded.body, {
      quizTitle: input.quizTitle,
      courseTitle: input.courseTitle,
      scoreLabel: input.scoreLabel,
    }),
    type: "quiz_graded",
    link: input.link,
    metadata: {
      url: input.link,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    },
    systemTemplate: {
      key: "quiz_graded",
      params: {
        quizTitle: input.quizTitle,
        courseTitle: input.courseTitle,
        scoreLabel: input.scoreLabel,
      },
    },
  };
}

export function flashcardReminderPayload(input: {
  dueCount: number;
  courseTitle?: string;
  link: string;
  dedupeKey?: string;
}): NotificationPayload {
  const body = input.courseTitle
    ? interpolate(messages.id.push.flashcardReminder.bodyWithCourse, {
        dueCount: input.dueCount,
        courseTitle: input.courseTitle,
      })
    : interpolate(messages.id.push.flashcardReminder.body, {
        dueCount: input.dueCount,
      });

  return {
    title: interpolate(messages.id.push.flashcardReminder.title, { dueCount: input.dueCount }),
    body,
    type: "flashcard_reminder",
    link: input.link,
    metadata: {
      url: input.link,
      dueCount: String(input.dueCount),
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    },
    systemTemplate: {
      key: "flashcard_reminder",
      params: {
        dueCount: input.dueCount,
        ...(input.courseTitle ? { courseTitle: input.courseTitle } : {}),
      },
    },
  };
}

export function paymentSuccessPayload(input: {
  groupName: string;
  courseCount: number;
  link?: string;
}): NotificationPayload {
  const link = input.link ?? "/dashboard";
  return {
    title: shortNotificationText(interpolate(messages.id.push.paymentSuccess.title, input), 65),
    body: interpolate(messages.id.push.paymentSuccess.body, {
      groupName: input.groupName,
      courseCount: input.courseCount,
    }),
    type: "payment_success",
    link,
    metadata: {
      url: link,
      groupName: input.groupName,
      courseCount: String(input.courseCount),
    },
    systemTemplate: {
      key: "payment_success",
      params: {
        groupName: input.groupName,
        courseCount: input.courseCount,
      },
    },
  };
}

export function weeklyProgressPayload(input: {
  quizzes: number;
  flashcards: number;
  modules: number;
  currentStreak: number;
  weekStart: string;
  link?: string;
}): NotificationPayload {
  const link = input.link ?? "/dashboard";
  return {
    title: messages.id.push.weeklyProgress.title,
    body: interpolate(messages.id.push.weeklyProgress.body, {
      quizzes: input.quizzes,
      flashcards: input.flashcards,
      modules: input.modules,
      currentStreak: input.currentStreak,
    }),
    type: "weekly_progress",
    link,
    metadata: {
      url: link,
      dedupeKey: `weekly_progress:${input.weekStart}`,
    },
    systemTemplate: {
      key: "weekly_progress",
      params: {
        quizzes: input.quizzes,
        flashcards: input.flashcards,
        modules: input.modules,
        currentStreak: input.currentStreak,
      },
    },
  };
}

export function studyReengagementPayload(input: {
  inactiveDays: number;
  courseTitle: string;
  topicTitle?: string;
  link: string;
  dedupeKey: string;
}): NotificationPayload {
  const title = interpolate(messages.id.push.studyReengagement.title, {
    courseTitle: input.courseTitle,
  });
  const body = input.topicTitle
    ? interpolate(messages.id.push.studyReengagement.bodyWithTopic, {
        inactiveDays: input.inactiveDays,
        courseTitle: input.courseTitle,
        topicTitle: input.topicTitle,
      })
    : interpolate(messages.id.push.studyReengagement.body, {
        inactiveDays: input.inactiveDays,
        courseTitle: input.courseTitle,
      });

  return {
    title,
    body,
    type: "study_reengagement",
    link: input.link,
    metadata: {
      url: input.link,
      inactiveDays: String(input.inactiveDays),
      dedupeKey: input.dedupeKey,
    },
    systemTemplate: {
      key: "study_reengagement",
      params: {
        inactiveDays: input.inactiveDays,
        courseTitle: input.courseTitle,
        ...(input.topicTitle ? { topicTitle: input.topicTitle } : {}),
      },
    },
  };
}

/** Render an app-owned notification string for one recipient's language. */
export function renderNotificationPayload(payload: NotificationPayload, locale: Locale): NotificationPayload {
  if (!payload.systemTemplate) return payload;
  const pushMessages = messages[locale].push;
  const withLocale = { ...payload.metadata, locale };

  switch (payload.systemTemplate.key) {
    case "discussion": {
      const { threadTitle, preview, eventKind } = payload.systemTemplate.params;
      const copy = pushMessages.discussion;
      const title = threadTitle ? shortNotificationText(interpolate(copy.titleWithThread, { threadTitle }), 65) : copy.title;
      const fallback = eventKind === "edit" ? copy.edited : eventKind === "delete" ? copy.deleted
        : eventKind === "resolved" ? copy.statusChanged : threadTitle ? copy.newMessage : copy.body;
      return { ...payload, title, body: shortNotificationText(preview, 180) || fallback, metadata: withLocale };
    }

    case "pka_schedule": {
      const { scheduleTitle, sessionAt } = payload.systemTemplate.params;
      const sessionLabel = new Date(sessionAt).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      });
      const values = { scheduleTitle, sessionLabel };
      return {
        ...payload,
        title: interpolate(pushMessages.pkaSchedule.title, values),
        body: interpolate(pushMessages.pkaSchedule.body, values),
        metadata: withLocale,
      };
    }

    case "pka_schedule_update": {
      const { scheduleTitle, sessionAt } = payload.systemTemplate.params;
      const sessionLabel = new Date(sessionAt).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      });
      const values = { scheduleTitle, sessionLabel };
      return {
        ...payload,
        title: interpolate(pushMessages.pkaScheduleUpdate.title, values),
        body: interpolate(pushMessages.pkaScheduleUpdate.body, values),
        metadata: withLocale,
      };
    }

    case "tutor_schedule_moved": {
      const template = pushMessages.tutorScheduleMoved;
      return {
        ...payload,
        title: payload.systemTemplate.params.courseTitle ? shortNotificationText(interpolate(template.titleWithCourse, { courseTitle: payload.systemTemplate.params.courseTitle }), 65) : template.title,
        body: interpolate(template.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "tutor_ticket_decision": {
      const template = pushMessages.tutorTicketDecision;
      const typeLabel =
        payload.systemTemplate.params.ticketType === "reschedule"
          ? locale === "id" ? "Perubahan jadwal" : "Reschedule"
          : locale === "id"
            ? "Pembatalan"
            : "Cancellation";
      const decisionLabel =
        payload.systemTemplate.params.decision === "approved"
          ? locale === "id"
            ? "Disetujui"
            : "approved"
          : locale === "id"
            ? "Ditolak"
            : "declined";
      return {
        ...payload,
        title: interpolate(template.title, { ticketType: typeLabel, decision: decisionLabel }),
        body: payload.systemTemplate.params.notes ?? interpolate(template.body, { ticketType: typeLabel }),
        metadata: withLocale,
      };
    }

    case "tutor_ticket_message":
      return {
        ...payload,
        title: pushMessages.tutorTicketMessage.title,
        body: payload.systemTemplate.params.body,
        metadata: withLocale,
      };

    case "quiz_published": {
      const { quizTitle, courseTitle } = payload.systemTemplate.params;
      const text = pushMessages.quizPublished;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, { quizTitle, courseTitle }), 65),
        body: interpolate(text.body, { quizTitle, courseTitle }),
        metadata: withLocale,
      };
    }

    case "quiz_graded": {
      const text = pushMessages.quizGraded;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, payload.systemTemplate.params), 65),
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "flashcard_reminder": {
      const text = pushMessages.flashcardReminder;
      const { dueCount, courseTitle } = payload.systemTemplate.params;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, { dueCount }), 65),
        body: courseTitle
          ? interpolate(text.bodyWithCourse, { dueCount, courseTitle })
          : interpolate(text.body, { dueCount }),
        metadata: withLocale,
      };
    }

    case "payment_success": {
      const text = pushMessages.paymentSuccess;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, payload.systemTemplate.params), 65),
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "weekly_progress": {
      const text = pushMessages.weeklyProgress;
      return {
        ...payload,
        title: text.title,
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "study_reengagement": {
      const text = pushMessages.studyReengagement;
      const { inactiveDays, courseTitle, topicTitle } = payload.systemTemplate.params;
      return {
        ...payload,
        title: interpolate(text.title, { courseTitle }),
        body: topicTitle
          ? interpolate(text.bodyWithTopic, { inactiveDays, courseTitle, topicTitle })
          : interpolate(text.body, { inactiveDays, courseTitle }),
        metadata: withLocale,
      };
    }

    case "tutor_booking_created": {
      const text = pushMessages.tutorBookingCreated;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, payload.systemTemplate.params), 65),
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "tutor_booking_moved": {
      const text = pushMessages.tutorBookingMoved;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, payload.systemTemplate.params), 65),
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "tutor_booking_cancelled": {
      const text = pushMessages.tutorBookingCancelled;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, payload.systemTemplate.params), 65),
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "tutor_ticket_submitted": {
      const text = pushMessages.tutorTicketSubmitted;
      const typeLabel =
        payload.systemTemplate.params.ticketType === "reschedule"
          ? locale === "id" ? "perubahan jadwal" : "reschedule"
          : locale === "id"
            ? "pembatalan"
            : "cancellation";
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, { ticketType: typeLabel, courseTitle: payload.systemTemplate.params.courseTitle }), 65),
        body: interpolate(text.body, {
          studentName: payload.systemTemplate.params.studentName,
          ticketType: typeLabel,
          courseTitle: payload.systemTemplate.params.courseTitle,
        }),
        metadata: withLocale,
      };
    }

    case "upcoming_session_reminder": {
      const text = pushMessages.upcomingSessionReminder;
      const { window, courseTitle, sessionDate, startTime } = payload.systemTemplate.params;
      return {
        ...payload,
        title: shortNotificationText(interpolate(text.title, { courseTitle }), 65),
        body: interpolate(window === "24h" ? text.body24h : text.body1h, {
          courseTitle,
          sessionDate,
          startTime,
        }),
        metadata: withLocale,
      };
    }

    case "tutor_daily_digest": {
      const text = pushMessages.tutorDailyDigest;
      return {
        ...payload,
        title: text.title,
        body: interpolate(text.body, payload.systemTemplate.params),
        metadata: withLocale,
      };
    }

    case "admin_alert":
      return {
        ...payload,
        title: payload.systemTemplate.params.title,
        body: payload.systemTemplate.params.body,
        metadata: withLocale,
      };
  }
}

export function discussionNotificationLink(threadId: string, report = false, messageId?: string): string {
  return report
    ? "/discussions?discussionTab=reports"
    : `/discussions?thread=${encodeURIComponent(threadId)}${messageId ? `&message=${encodeURIComponent(messageId)}` : ""}`;
}

export function discussionPayload(input: {
  role: "student" | "tutor" | "admin";
  channelId: string;
  threadId: string;
  seq: number;
  messageId?: string | null;
  report?: boolean;
  threadTitle?: string;
  preview?: string;
  eventKind?: string;
}): NotificationPayload {
  const link = discussionNotificationLink(input.threadId, input.report, input.messageId ?? undefined);
  return {
    ...messages.id.push.discussion,
    type: "discussion",
    link,
    metadata: {
      url: link,
      channelId: input.channelId,
      threadId: input.threadId,
      seq: String(input.seq),
      ...(!input.report && input.messageId ? { messageId: input.messageId } : {}),
    },
    systemTemplate: { key: "discussion", params: input.report ? {} : { threadTitle: input.threadTitle, preview: input.preview, eventKind: input.eventKind } },
  };
}

// ─── Admin Broadcast & Alerts ─────────────────────────────────────────────────

export function adminBroadcastPayload(
  title: string,
  body: string,
  link: string = "/dashboard",
): NotificationPayload {
  return {
    title,
    body,
    type: "admin_broadcast",
    link,
    metadata: {
      url: link,
    },
  };
}

export function adminAlertPayload(
  title: string,
  body: string,
  link: string = "/admin",
): NotificationPayload {
  return {
    title,
    body,
    type: "admin_alert",
    link,
    metadata: { url: link },
    systemTemplate: { key: "admin_alert", params: { title, body } },
  };
}

// ─── Tutorial PKA Announcements & Schedules ───────────────────────────────────

export function pkaAnnouncementPayload(
  title: string,
  body: string,
  link: string = "/courses/tutorial-pka",
): NotificationPayload {
  return {
    title,
    body,
    type: "announcement",
    link,
    metadata: {
      url: link,
    },
  };
}

export function pkaSchedulePayload(title: string, sessionAt: Date, link: string): NotificationPayload {
  return {
    title,
    body: `Jadwal sesi tutorial PKA: ${title}.`,
    type: "announcement",
    link,
    metadata: { url: link },
    systemTemplate: { key: "pka_schedule", params: { scheduleTitle: title, sessionAt: sessionAt.toISOString() } },
  };
}

export function pkaScheduleUpdatePayload(title: string, sessionAt: Date, link: string): NotificationPayload {
  return {
    title: `Update Link Meet: ${title}`,
    body: `Link Meet telah ditambahkan untuk sesi ${title}.`,
    type: "announcement",
    link,
    metadata: { url: link },
    systemTemplate: { key: "pka_schedule_update", params: { scheduleTitle: title, sessionAt: sessionAt.toISOString() } },
  };
}

// ─── Student <-> Tutor Schedule & Tickets ─────────────────────────────────────

export function tutorScheduleMovedPayload(input: {
  dayOfWeek: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  courseTitle?: string;
}): NotificationPayload {
  return {
    title: "Jadwal Tutorial Diperbarui",
    body: `Sesi dipindahkan ke ${input.dayOfWeek}, ${input.sessionDate} pukul ${input.startTime} - ${input.endTime}.`,
    type: "tutor_reminder",
    link: "/dashboard/schedule",
    metadata: { url: "/dashboard/schedule" },
    systemTemplate: { key: "tutor_schedule_moved", params: input },
  };
}

export function tutorTicketDecisionPayload(input: {
  ticketType: "reschedule" | "cancellation";
  decision: "approved" | "rejected";
  notes: string | null;
}): NotificationPayload {
  return {
    title: "Pembaruan tiket jadwal",
    body: input.notes ?? "Pengajar telah memutuskan tiket jadwal.",
    type: "tutor_reminder",
    link: "/dashboard/schedule",
    metadata: { url: "/dashboard/schedule" },
    systemTemplate: { key: "tutor_ticket_decision", params: input },
  };
}

export function tutorTicketMessagePayload(body: string, link = "/dashboard/schedule"): NotificationPayload {
  return {
    title: "Balasan baru pada diskusi jadwal",
    body,
    type: "tutor_reminder",
    link,
    metadata: { url: link },
    systemTemplate: { key: "tutor_ticket_message", params: { body } },
  };
}

export function tutorBookingCreatedPayload(input: {
  studentName: string;
  courseTitle: string;
  sessionDate: string;
  startTime: string;
  bookingId?: string;
}): NotificationPayload {
  const link = "/tutor/schedule";
  return {
    title: shortNotificationText(interpolate(messages.id.push.tutorBookingCreated.title, input), 65),
    body: interpolate(messages.id.push.tutorBookingCreated.body, input),
    type: "tutor_booking",
    link,
    metadata: {
      url: link,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    },
    systemTemplate: {
      key: "tutor_booking_created",
      params: {
        studentName: input.studentName,
        courseTitle: input.courseTitle,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
      },
    },
  };
}

export function tutorBookingMovedPayload(input: {
  studentName: string;
  courseTitle: string;
  sessionDate: string;
  startTime: string;
  bookingId?: string;
}): NotificationPayload {
  const link = "/tutor/schedule";
  return {
    title: shortNotificationText(interpolate(messages.id.push.tutorBookingMoved.title, input), 65),
    body: interpolate(messages.id.push.tutorBookingMoved.body, input),
    type: "tutor_booking",
    link,
    metadata: {
      url: link,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    },
    systemTemplate: {
      key: "tutor_booking_moved",
      params: {
        studentName: input.studentName,
        courseTitle: input.courseTitle,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
      },
    },
  };
}

export function tutorBookingCancelledPayload(input: {
  studentName: string;
  courseTitle: string;
  sessionDate: string;
  startTime: string;
  bookingId?: string;
}): NotificationPayload {
  const link = "/tutor/schedule";
  return {
    title: shortNotificationText(interpolate(messages.id.push.tutorBookingCancelled.title, input), 65),
    body: interpolate(messages.id.push.tutorBookingCancelled.body, input),
    type: "tutor_booking",
    link,
    metadata: {
      url: link,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    },
    systemTemplate: {
      key: "tutor_booking_cancelled",
      params: {
        studentName: input.studentName,
        courseTitle: input.courseTitle,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
      },
    },
  };
}

export function tutorTicketSubmittedPayload(input: {
  studentName: string;
  ticketType: "reschedule" | "cancellation";
  courseTitle: string;
  ticketId?: string;
}): NotificationPayload {
  const link = "/tutor/schedule";
  const typeLabel = input.ticketType === "reschedule" ? "reschedule" : "pembatalan";
  return {
    title: shortNotificationText(interpolate(messages.id.push.tutorTicketSubmitted.title, { ticketType: typeLabel, courseTitle: input.courseTitle }), 65),
    body: interpolate(messages.id.push.tutorTicketSubmitted.body, {
      studentName: input.studentName,
      ticketType: typeLabel,
      courseTitle: input.courseTitle,
    }),
    type: "tutor_booking",
    link,
    metadata: {
      url: link,
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    },
    systemTemplate: {
      key: "tutor_ticket_submitted",
      params: {
        studentName: input.studentName,
        ticketType: input.ticketType,
        courseTitle: input.courseTitle,
      },
    },
  };
}

export function upcomingSessionReminderPayload(input: {
  audience: "student" | "tutor";
  window: "24h" | "1h";
  courseTitle: string;
  sessionDate: string;
  startTime: string;
  bookingId: string;
}): NotificationPayload {
  const link = input.audience === "tutor" ? "/tutor/schedule" : "/dashboard/schedule";
  const text = messages.id.push.upcomingSessionReminder;
  return {
    title: shortNotificationText(interpolate(text.title, { courseTitle: input.courseTitle }), 65),
    body: interpolate(input.window === "24h" ? text.body24h : text.body1h, {
      courseTitle: input.courseTitle,
      sessionDate: input.sessionDate,
      startTime: input.startTime,
    }),
    type: "tutor_reminder",
    link,
    metadata: {
      url: link,
      bookingId: input.bookingId,
      dedupeKey: `upcoming_session:${input.bookingId}:${input.window}`,
    },
    systemTemplate: {
      key: "upcoming_session_reminder",
      params: {
        audience: input.audience,
        window: input.window,
        courseTitle: input.courseTitle,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
      },
    },
  };
}

export function tutorDailyDigestPayload(input: {
  pendingTickets: number;
  pendingGradings: number;
  dateKey: string;
}): NotificationPayload {
  const link = input.pendingTickets > 0 ? "/tutor/schedule" : "/tutor";
  return {
    title: messages.id.push.tutorDailyDigest.title,
    body: interpolate(messages.id.push.tutorDailyDigest.body, {
      pendingTickets: input.pendingTickets,
      pendingGradings: input.pendingGradings,
    }),
    type: "tutor_digest",
    link,
    metadata: {
      url: link,
      pendingTickets: String(input.pendingTickets),
      pendingGradings: String(input.pendingGradings),
      dedupeKey: `tutor_digest:${input.dateKey}`,
    },
    systemTemplate: {
      key: "tutor_daily_digest",
      params: {
        pendingTickets: input.pendingTickets,
        pendingGradings: input.pendingGradings,
      },
    },
  };
}
