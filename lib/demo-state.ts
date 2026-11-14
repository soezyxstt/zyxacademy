import { z } from "zod";
import { addCalendarDays, getCalendarWeekRange, isCalendarDate } from "@/lib/date-utils";

const date = z.string().refine(isCalendarDate);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const text = z.string().trim().min(1).max(200);
export const demoResourceSchema = z.discriminatedUnion("kind", [
  z.object({ id: text, phase: z.enum(["pre", "post"]), kind: z.literal("file"), name: text }),
  z.object({ id: text, phase: z.enum(["pre", "post"]), kind: z.literal("link"), name: text,
    url: z.string().url().refine(value => /^https?:\/\//i.test(value)) }),
]);
export const demoSessionSchema = z.object({
  id: text, date, time, topic: text, notes: z.string().max(4000),
  status: z.enum(["booked", "cancelled", "completed"]),
  resources: z.array(demoResourceSchema).max(40),
});
export const demoStateSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string(), demoSessionSchema).default({}),
  groupName: text.default("Kelompok Cakrawala"),
  members: z.array(text).min(1).max(6).refine(names => new Set(names).size === names.length).default(["Alya", "Bima", "Citra", "Dimas", "Nadia", "Kamu"]),
  quiz: z.object({
    signature: z.string(), questionCount: z.number().int().min(1).max(100), answers: z.array(z.array(z.number().int().min(0))),
    score: z.number().min(0).max(100).nullable(),
    results: z.array(z.object({ index: z.number().int().min(0), isCorrect: z.boolean(), explanation: z.string().nullable() })).nullable(),
  }).refine(quiz => quiz.score === null || quiz.score <= quiz.questionCount).optional(),
  flashcard: z.object({ signature: z.string(), index: z.number().int().min(0), revealed: z.boolean() }).optional(),
});
export type DemoState = z.infer<typeof demoStateSchema>;
export type DemoSession = z.infer<typeof demoSessionSchema>;
export type DemoResource = z.infer<typeof demoResourceSchema>;
export const initialDemoState = (): DemoState => demoStateSchema.parse({ version: 1 });
export const demoStorageKey = (coursePath: string) => `zyx-public-demo:v1:${coursePath}`;

export function demoWeekSessions(day: string, chapter: string, overrides: DemoState["sessions"]): DemoSession[] {
  const { startIso, endIso } = getCalendarWeekRange(day);
  const seeds = [
    { offset: 0, time: "19:00", topic: "Diskusi konsep" },
    { offset: 2, time: "19:00", topic: "Latihan soal" },
    { offset: 5, time: "09:00", topic: "Pembahasan kuis" },
  ].map(({ offset, time, topic }): DemoSession => {
    const date = addCalendarDays(startIso, offset);
    return { id: `seed-${date}`, date, time, topic: `${topic}: ${chapter}`, notes: "", status: "booked", resources: [] };
  });
  const merged = new Map(seeds.map(session => [session.id, session]));
  for (const session of Object.values(overrides)) merged.set(session.id, session);
  return [...merged.values()].filter(session => session.date >= startIso && session.date <= endIso)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}
