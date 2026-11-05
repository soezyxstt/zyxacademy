import { z } from "zod";
import { isValid, parseISO } from "date-fns";
import { formatIsoDateUtc } from "@/lib/date-utils";

const eventSchema = z.object({
  kind: z.enum(["article", "review", "quiz"]),
  id: z.string().min(1).max(128),
  grade: z.number().int().min(1).max(4).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = parseISO(`${value}T00:00:00Z`);
    return isValid(parsed) && formatIsoDateUtc(parsed) === value;
  }),
}).strict().refine((event) => event.kind === "review" ? event.grade !== undefined : event.grade === undefined);
const overlaySchema = z.object({ version: z.literal(1), events: z.array(eventSchema).max(500) }).strict().refine(({ events }) => new Set(events.map((event) => JSON.stringify([event.kind, event.id]))).size === events.length);
export type DemoEvent = z.infer<typeof eventSchema>;
export type DemoOverlay = z.infer<typeof overlaySchema>;
export const emptyOverlay = (): DemoOverlay => ({ version: 1, events: [] });
export const overlayKey = (courseId: string, revision: string) => `zyx-demo:1:${encodeURIComponent(courseId)}:${encodeURIComponent(revision)}`;
export function parseOverlay(value: string | null): DemoOverlay {
  try { return overlaySchema.parse(JSON.parse(value && value.length <= 150000 ? value : "null")); } catch { return emptyOverlay(); }
}
export function addDemoEvent(overlay: DemoOverlay, event: DemoEvent): DemoOverlay {
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success || overlay.events.length >= 500 || overlay.events.some((item) => item.kind === event.kind && item.id === event.id)) return overlay;
  return { version: 1, events: [...overlay.events, parsed.data] };
}

/** Scope positional flashcard IDs to their selected set and page. */
export function scopedDemoReviewId(setId: string, offset: number, cardId: string): string {
  const input = JSON.stringify([setId, offset, cardId]);
  let first = 2166136261;
  let second = 2246822519;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `demo-review-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
