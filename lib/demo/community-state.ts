import { z } from "zod";
import { demoCommunitySeed, demoGroupId } from "./community-seed";
import { addCalendarDays, assertCalendarDate, getCalendarWeekRange, isCalendarDate } from "@/lib/date-utils";

const text = z.string().trim().min(1).max(200);
const date = z.string().refine(isCalendarDate);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const resource = z.object({ id: text, phase: z.enum(["pre", "post"]), kind: z.enum(["file", "link", "recording"]), label: text, url: z.string().max(2000), fileName: z.string().nullable(), mimeType: z.string().nullable(), sizeBytes: z.number().nonnegative().nullable(), createdById: text }).refine(row => row.kind === "file" ? row.url === "" : /^https?:\/\//i.test(row.url) && URL.canParse(row.url));
export const demoBookingSchema = z.object({ id: text, slotId: text, sessionDate: date, startTime: time, endTime: time, courseId: text, groupId: text, topic: z.string().max(500), preSessionNotes: z.string().max(5000), postSessionNotes: z.string().max(5000), status: z.enum(["confirmed", "completed", "cancelled"]), resources: z.array(resource).max(100) }).refine(row => row.endTime > row.startTime);
export const demoCommunitySchema = z.object({ version: z.literal(1), group: z.object({ name: text, members: z.array(text).min(1).max(6).refine(rows => new Set(rows.map(row => row.toLowerCase())).size === rows.length) }), bookings: z.array(demoBookingSchema).max(1000) }).refine(value => new Set(value.bookings.map(row => row.id)).size === value.bookings.length);
export type DemoBooking = z.infer<typeof demoBookingSchema>;
export type DemoResource = z.infer<typeof resource>;
export type DemoCommunity = z.infer<typeof demoCommunitySchema>;
export type DemoCommunityScope = { courseId: string; revision: string; courseTitle?: string };
export const communityKey = (scope: DemoCommunityScope) => `zyx-demo-community:1:${encodeURIComponent(scope.courseId)}:${encodeURIComponent(scope.revision)}`;
export const emptyCommunity = (courseId?: string, courseTitle?: string): DemoCommunity => ({ version: 1, group: courseId ? { name: demoCommunitySeed(courseId, courseTitle).group, members: [...demoCommunitySeed(courseId, courseTitle).members] } : { name: "Kelompok belajar", members: ["Pelajar Demo", "Alya", "Bima"] }, bookings: [] });
export function parseCommunity(raw: string | null, courseId?: string, courseTitle?: string): DemoCommunity {
  if (!raw) return emptyCommunity(courseId, courseTitle);
  const state = demoCommunitySchema.parse(JSON.parse(raw.length <= 2000000 ? raw : "null"));
  if (courseId && state.bookings.some(booking => booking.courseId !== courseId)) throw new Error("COURSE_UNAVAILABLE");
  return { ...state, bookings: state.bookings.map(booking => {
    const legacyDate = /^demo-booking-(\d{4}-\d{2}-\d{2})$/.exec(booking.id)?.[1];
    let id = booking.id;
    if (legacyDate) {
      const { startIso } = getCalendarWeekRange(assertCalendarDate(legacyDate));
      const index = legacyDate === startIso ? 0 : legacyDate === addCalendarDays(startIso, 2) ? 1 : -1;
      const originalDate = index < 0 ? legacyDate : addCalendarDays(startIso, demoCommunitySeed(booking.courseId, courseTitle).days[index]);
      id = `demo-booking-${encodeURIComponent(booking.courseId)}-${originalDate}`;
    }
    return { ...booking, id, groupId: booking.groupId === "demo-group" ? demoGroupId(booking.courseId) : booking.groupId };
  }) };
}
function demoSlots(anchor: string, courseId: string, courseTitle?: string) {
  const { startIso } = getCalendarWeekRange(assertCalendarDate(anchor));
  const seed = demoCommunitySeed(courseId, courseTitle);
  return seed.days.map((offset, index) => ({ id: `demo-slot-${encodeURIComponent(courseId)}-${addCalendarDays(startIso, offset)}`, sessionDate: addCalendarDays(startIso, offset), startTime: seed.times[index][0], endTime: seed.times[index][1], courseId, tutorId: `fictional-demo-tutor-${encodeURIComponent(courseId)}`, tutor: { id: `fictional-demo-tutor-${encodeURIComponent(courseId)}`, name: seed.tutor }, mode: "online" }));
}
function withCurrentSlot(booking: DemoBooking, courseTitle?: string): DemoBooking {
  const slot = demoSlots(booking.sessionDate, booking.courseId, courseTitle).find(row => row.sessionDate === booking.sessionDate && row.startTime === booking.startTime && row.endTime === booking.endTime);
  return { ...booking, slotId: slot?.id ?? `demo-custom-${booking.id}` };
}
const overlaps = (a: Pick<DemoBooking, "sessionDate" | "startTime" | "endTime">, b: Pick<DemoBooking, "sessionDate" | "startTime" | "endTime">) => a.sessionDate === b.sessionDate && a.startTime < b.endTime && b.startTime < a.endTime;

/** Check implicit weekly seeds too, and release the old slot when a session moves. */
export function putDemoBooking(scope: DemoCommunityScope, state: DemoCommunity, value: DemoBooking): DemoCommunity {
  const next = withCurrentSlot(demoBookingSchema.parse(value), scope.courseTitle);
  if (next.status !== "cancelled" && demoWeek(scope, next.sessionDate, state).bookings.some(row => row.id !== next.id && row.status !== "cancelled" && overlaps(row, next))) throw new Error("SLOT_TAKEN");
  return { ...state, bookings: [...state.bookings.filter(row => row.id !== next.id), next] };
}
export function demoWeek(scope: DemoCommunityScope, anchor: string, state: DemoCommunity) {
  const { startIso, endIso } = getCalendarWeekRange(assertCalendarDate(anchor));
  const slots = demoSlots(anchor, scope.courseId, scope.courseTitle);
  const seed = demoCommunitySeed(scope.courseId, scope.courseTitle);
  const seeds: DemoBooking[] = slots.slice(0, 2).map((slot, index) => ({ id: `demo-booking-${encodeURIComponent(scope.courseId)}-${slot.sessionDate}`, slotId: slot.id, sessionDate: slot.sessionDate, startTime: slot.startTime, endTime: slot.endTime, courseId: scope.courseId, groupId: demoGroupId(scope.courseId), topic: `${index ? "Latihan dan pembahasan" : "Diskusi materi"}: ${seed.topics[index]}`, preSessionNotes: "", postSessionNotes: "", status: "confirmed", resources: [] }));
  const overrides = new Map(state.bookings.map(row => [row.id, row]));
  const bookings = [...seeds.filter(row => !overrides.has(row.id)), ...state.bookings].filter(row => row.sessionDate >= startIso && row.sessionDate <= endIso).map(booking => withCurrentSlot(booking, scope.courseTitle));
  return { slots: slots.map(slot => ({ ...slot, booking: bookings.find(row => row.status !== "cancelled" && overlaps(row, slot)) ?? null })), bookings };
}
