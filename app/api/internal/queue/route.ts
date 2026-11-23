import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { enqueueTask } from "@/lib/queue/cloud-tasks";

const childEvent = z.object({
  name: z.enum([
    "ai-model-catalog-cron",
    "google-calendar-sync-cron", "google-calendar/sync.requested",
    "vector.sync.dispatch", "discussion/notifications.continue", "discussion/ai.continue",
    "discussion/images.sweep-continue", "gamification/outbox.continue", "gamification/missions.page",
    "admin/operations.continue", "product.verification.requested",
    "admin-operations-outbox", "discussion-notifications", "discussion-ai-cron", "discussion-image-sweep",
    "gamification-outbox-cron", "vector-sync-cron-worker", "course-analytics-snapshot-cron",
    "content-quality-audit-cron", "weekly-reflection-cron", "gamification-missions-cron", "mastery-snapshot-cron",
    "study-reengagement-cron", "flashcard-reminder-cron", "upcoming-session-reminder-cron", "tutor-daily-digest-cron",
  ]),
  id: z.string().min(1).max(1024),
  data: z.record(z.string(), z.unknown()),
  delaySeconds: z.number().nonnegative().max(30 * 86400).optional(),
}).strict();

export async function POST(request: Request) {
  if (process.env.QUEUE_PROVIDER !== "cloud-tasks") return new Response(null, { status: 404 });
  const secret = process.env.COMPUTE_SERVICE_SECRET;
  const received = Buffer.from(request.headers.get("Authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || expected.length !== received.length || !timingSafeEqual(expected, received)) return new Response(null, { status: 401 });
  const event = childEvent.safeParse(await request.json().catch(() => null));
  if (!event.success) return new Response(null, { status: 400 });
  const id = await enqueueTask(event.data);
  return Response.json({ id });
}
