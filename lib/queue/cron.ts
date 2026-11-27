export type QueueEnvironment = "staging" | "production";

export function isCronJobName(name: string | undefined, environment: QueueEnvironment) {
  const job = `zyx-${environment}-dispatcher`;
  return name === job || name === `projects/zyx-academy/locations/asia-southeast1/jobs/${job}`
    || name === `projects/307641710075/locations/asia-southeast1/jobs/${job}`;
}

const recoveryJobs = [
  "admin-operations-outbox", "discussion-notifications", "discussion-ai-cron",
  "gamification-outbox-cron", "discussion-image-sweep", "vector-sync-cron-worker",
  "pka-native-delivery",
];

const scheduledJobs = [
  { job: "public-page-analytics-cron", hour: 0, minute: 0 },
  { job: "offline-change-retention", hour: 18, minute: 30 },
  { job: "ai-model-catalog-cron", hour: 0, minute: 0 },
  { job: "ai-model-catalog-cron", hour: 12, minute: 0 },
  { job: "tutor-daily-digest-cron", hour: 0, minute: 30 },
  { job: "flashcard-reminder-cron", hour: 1, minute: 0 },
  { job: "tutor-availability-reminder-cron", hour: 1, minute: 0 },
  { job: "study-reengagement-cron", hour: 11, minute: 0 },
  { job: "google-calendar-sync-cron", hour: 20, minute: 0 },
  { job: "course-analytics-snapshot-cron", hour: 2, minute: 0 },
  { job: "content-quality-audit-cron", hour: 3, minute: 0 },
  { job: "weekly-reflection-cron", hour: 6, minute: 0, weekday: 1 },
  { job: "gamification-missions-cron", hour: 17, minute: 5 },
  { job: "mastery-snapshot-cron", hour: 19, minute: 0 },
];

// Scheduler sends the original scheduled time on retries. Each window owns
// its start and excludes its end so adjacent ticks cannot duplicate work.
export function cronWindow(environment: QueueEnvironment, scheduledAt: Date) {
  const start = scheduledAt.getTime();
  const hours = environment === "staging" ? 24 : 6;
  if (!Number.isFinite(start) || start % (hours * 3_600_000) !== 0) throw new Error("QUEUE_CRON_WINDOW_INVALID");
  const end = start + hours * 3_600_000;
  const entries = recoveryJobs.map(job => ({ job, scheduledAt: start }));
  for (let scheduledAt = start; scheduledAt < end; scheduledAt += 3_600_000) {
    entries.push({ job: "upcoming-session-reminder-cron", scheduledAt });
    entries.push({ job: "notification-quiet-recovery", scheduledAt });
  }
  for (let scheduledAt = start; scheduledAt < end; scheduledAt += 300_000) {
    entries.push({ job: "tutorial-session-email-cron", scheduledAt });
  }
  for (const { job, hour, minute, weekday } of scheduledJobs) {
    const due = new Date(start);
    due.setUTCHours(hour, minute, 0, 0);
    if (due.getTime() >= start && due.getTime() < end && (weekday === undefined || due.getUTCDay() === weekday)) {
      entries.push({ job, scheduledAt: due.getTime() });
    }
  }
  return entries;
}
